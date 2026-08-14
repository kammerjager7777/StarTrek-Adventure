import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SYSTEMS,
  normalizeRegistryNumber,
  type CrewMember,
  type Ship,
  type VisualIdentity,
} from "../../../packages/game-core/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

export type StockShipTemplate = {
  id: string;
  name: string;
  /** Optional; synthesized if missing */
  registryNumber?: string;
  className: string;
  era: string;
  stardate: string;
  description: string;
  capabilities: string[];
  crew: Array<{
    name: string;
    role: string;
    species?: string;
  }>;
};

type CrewVisualEntry = {
  sex?: string;
  height?: string;
  species?: string;
  skinTone?: string;
  hair?: string;
  eyes?: string;
  build?: string;
  clothing?: string;
  scarsMarks?: string;
  imagePrompt: string;
};

type ShipVisualEntry = {
  imagePrompt: string;
};

let crewVisualsCache: Record<string, CrewVisualEntry> | null = null;
let shipVisualsCache: Record<string, ShipVisualEntry> | null = null;

export async function loadStockShips(): Promise<StockShipTemplate[]> {
  const file = path.join(ROOT, "content/ships/stock-ships.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as StockShipTemplate[];
}

/** Cached skill pack text — avoid re-reading disk every LLM turn */
let skillPacksCache: string | null = null;

export async function loadSkillPacks(): Promise<string> {
  if (skillPacksCache != null) return skillPacksCache;
  const dir = path.join(ROOT, "content/skills");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const parts = [];
  for (const f of files) {
    parts.push(await fs.readFile(path.join(dir, f), "utf8"));
  }
  skillPacksCache = parts.join("\n\n---\n\n");
  return skillPacksCache;
}

/**
 * Compact skill pack for play turns (faster prompts).
 * Caps total size so the system message does not dominate latency.
 */
export async function loadSkillPacksCompact(maxChars = 12_000): Promise<string> {
  const full = await loadSkillPacks();
  if (full.length <= maxChars) return full;
  // Prefer head of pack (usually core tone) + note truncation
  return (
    full.slice(0, maxChars) +
    "\n\n[Skill packs truncated for latency — keep Picard/Trek tone and JSON schema.]"
  );
}

async function loadCrewVisuals(): Promise<Record<string, CrewVisualEntry>> {
  if (crewVisualsCache) return crewVisualsCache;
  const file = path.join(ROOT, "content/visuals/crew-visuals.json");
  const raw = await fs.readFile(file, "utf8");
  crewVisualsCache = JSON.parse(raw) as Record<string, CrewVisualEntry>;
  return crewVisualsCache;
}

async function loadShipVisuals(): Promise<Record<string, ShipVisualEntry>> {
  if (shipVisualsCache) return shipVisualsCache;
  const file = path.join(ROOT, "content/visuals/ship-visuals.json");
  const raw = await fs.readFile(file, "utf8");
  shipVisualsCache = JSON.parse(raw) as Record<string, ShipVisualEntry>;
  return shipVisualsCache;
}

function defaultPersonality(name: string, role: string, species?: string): string {
  const known: Record<string, string> = {
    Spock: "Logical, precise, quietly loyal",
    "Leonard McCoy": "Irascible, compassionate, plain-spoken",
    "Nyota Uhura": "Poised, brilliant communicator",
    "Montgomery Scott": "Inventive engineer, unshakable under pressure",
    "William T. Riker": "Bold, diplomatic, confident",
    Data: "Curious android seeking understanding",
    Worf: "Honorable warrior, duty-bound",
    "Deanna Troi": "Empathic counselor, calm insight",
    "Geordi La Forge": "Optimistic problem-solver",
    "Beverly Crusher": "Principled physician, steady moral center",
    "T'Pol": "Disciplined Vulcan science officer",
    "Malcolm Reed": "Cautious tactical specialist",
    "Hoshi Sato": "Gifted linguist, adaptable",
    "Trip Tucker": "Hands-on engineer, warm Southern grit",
    Chakotay: "Grounded leader, spiritual pragmatist",
    Tuvok: "Stoic Vulcan security chief",
    "B'Elanna Torres": "Brilliant, fiery engineer",
    "The Doctor": "Holographic physician with growing ego and heart",
    "Seven of Nine": "Efficient, analytical, reclaiming humanity",
  };
  if (known[name]) return known[name];
  if (/science/i.test(role)) return "Analytical and methodical";
  if (/tactical|security|armory/i.test(role)) return "Vigilant and decisive";
  if (/engineer/i.test(role)) return "Practical and resourceful";
  if (/medical|doctor/i.test(role)) return "Compassionate under fire";
  if (/first officer|xo/i.test(role)) return "Steady second-in-command";
  return species ? `Dedicated ${species} officer` : "Dedicated Starfleet officer";
}

function defaultBio(name: string, role: string, species?: string): string {
  return `${name} serves as ${role}${
    species ? ` (${species})` : ""
  }. A trusted member of the bridge team whose counsel shapes the captain's decisions.`;
}

function buildGenericCrewVisual(
  name: string,
  role: string,
  species?: string
): CrewVisualEntry {
  const sp = species || "Human";
  return {
    sex: "unspecified",
    height: "average",
    species: sp,
    skinTone: "natural tone for species",
    hair: "neat duty cut",
    eyes: "alert",
    build: "fit Starfleet officer",
    clothing: `Starfleet duty uniform appropriate to role (${role})`,
    scarsMarks: "none notable",
    imagePrompt: `Photorealistic portrait of ${name}, ${sp} Starfleet officer, ${role}, neat duty appearance, fit build, wearing era-appropriate Starfleet uniform for ${role}, professional expression, bridge soft lighting, head-and-shoulders, no text, no watermark`,
  };
}

function crewVisualIdentity(
  name: string,
  role: string,
  species: string | undefined,
  entry: CrewVisualEntry
): VisualIdentity {
  return {
    subjectId: `crew:${name.toLowerCase().replace(/\s+/g, "_")}`,
    imagePrompt: entry.imagePrompt,
    tags: [role, species || entry.species || "unknown", entry.sex || "unspecified"].filter(
      Boolean
    ) as string[],
  };
}

export async function templateToShip(t: StockShipTemplate): Promise<Ship> {
  const crewCatalog = await loadCrewVisuals();
  const shipCatalog = await loadShipVisuals();

  const crew: CrewMember[] = t.crew.map((c) => {
    const visualEntry =
      crewCatalog[c.name] || buildGenericCrewVisual(c.name, c.role, c.species);
    return {
      id: randomUUID(),
      name: c.name,
      role: c.role,
      species: c.species || visualEntry.species,
      sex: visualEntry.sex,
      height: visualEntry.height,
      skinTone: visualEntry.skinTone,
      hair: visualEntry.hair,
      eyes: visualEntry.eyes,
      build: visualEntry.build,
      clothing: visualEntry.clothing,
      scarsMarks: visualEntry.scarsMarks,
      personality: defaultPersonality(c.name, c.role, c.species),
      bio: defaultBio(c.name, c.role, c.species),
      visual: crewVisualIdentity(c.name, c.role, c.species, visualEntry),
      imageUrl: null,
      portraitStatus: "none",
      loyalty: 50 + Math.floor(Math.random() * 21),
    };
  });

  const shipVisual = shipCatalog[t.id] || shipCatalog.default;

  const registryNumber = normalizeRegistryNumber(
    t.registryNumber,
    [...t.name, t.id].join("").length * 41
  );

  return {
    id: t.id,
    name: t.name,
    registryNumber,
    className: t.className,
    era: t.era,
    stardate: t.stardate,
    description: t.description,
    capabilities: t.capabilities,
    integrity: 100,
    maxIntegrity: 100,
    shieldIntegrity: 100,
    maxShieldIntegrity: 100,
    shieldGridOnline: true,
    shieldRechargeTurns: 0,
    systems: { ...DEFAULT_SYSTEMS },
    crew,
    scars: [],
    visual: {
      subjectId: `ship:${t.id}`,
      imagePrompt: shipVisual.imagePrompt,
      tags: [t.className, t.era, t.name, registryNumber],
    },
    exteriorImageUrl: null,
  };
}

export function shipChoicesText(ships: StockShipTemplate[]): string {
  return ships
    .map((s, i) => {
      const reg = s.registryNumber
        ? normalizeRegistryNumber(s.registryNumber)
        : "";
      return `${i + 1}. ${s.name}${reg ? ` ${reg}` : ""} — ${s.className} (${s.era})\n   ${s.description}`;
    })
    .join("\n\n");
}

/** Build visual bible block for Imagine agents */
export function formatVisualBible(ship: Ship | null | undefined): string {
  if (!ship) return "No ship selected.";
  const lines: string[] = [];
  lines.push(
    `SHIP: ${ship.name} ${ship.registryNumber || ""} (${ship.className}, ${ship.era})`.replace(
      /\s+/g,
      " "
    )
  );
  lines.push(`SHIP VISUAL LOCK: ${ship.visual?.imagePrompt || ship.description}`);
  lines.push(`SHIP STATUS: integrity ${ship.integrity}/${ship.maxIntegrity}`);
  if (ship.scars.length) lines.push(`SHIP SCARS: ${ship.scars.slice(-4).join(" | ")}`);
  lines.push("CREW VISUAL LOCKS:");
  for (const c of ship.crew) {
    lines.push(
      `- ${c.name} / ${c.role}: ${c.visual?.imagePrompt || `${c.species || "officer"}, ${c.clothing || "duty uniform"}`}`
    );
  }
  return lines.join("\n");
}
