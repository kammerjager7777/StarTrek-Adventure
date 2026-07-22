import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SYSTEMS,
  type CrewMember,
  type Ship,
} from "../../../packages/game-core/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

export type StockShipTemplate = {
  id: string;
  name: string;
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

export async function loadStockShips(): Promise<StockShipTemplate[]> {
  const file = path.join(ROOT, "content/ships/stock-ships.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as StockShipTemplate[];
}

export async function loadSkillPacks(): Promise<string> {
  const dir = path.join(ROOT, "content/skills");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const parts = [];
  for (const f of files) {
    parts.push(await fs.readFile(path.join(dir, f), "utf8"));
  }
  return parts.join("\n\n---\n\n");
}

export function templateToShip(t: StockShipTemplate): Ship {
  const crew: CrewMember[] = t.crew.map((c) => ({
    id: randomUUID(),
    name: c.name,
    role: c.role,
    species: c.species,
    imageUrl: null,
    loyalty: 50,
  }));

  return {
    id: t.id,
    name: t.name,
    className: t.className,
    era: t.era,
    stardate: t.stardate,
    description: t.description,
    capabilities: t.capabilities,
    integrity: 100,
    maxIntegrity: 100,
    systems: { ...DEFAULT_SYSTEMS },
    crew,
    scars: [],
  };
}

export function shipChoicesText(ships: StockShipTemplate[]): string {
  return ships
    .map(
      (s, i) =>
        `${i + 1}. ${s.name} — ${s.className} (${s.era})\n   ${s.description}`
    )
    .join("\n\n");
}
