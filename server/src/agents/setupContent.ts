/**
 * LLM-generated setup content: greetings, ships, missions, tutorial.
 * Replaces hardcoded catalogs while keeping the setup state machine.
 */

import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type {
  CrewMember,
  Difficulty,
  GameState,
  Mission,
  MissionType,
  Ship,
  TurnOption,
} from "../../../packages/game-core/src/index.js";
import {
  DEFAULT_SYSTEMS,
  normalizeRegistryNumber,
} from "../../../packages/game-core/src/index.js";
import { logError, logLlm } from "../debug/sessionDebugLog.js";
import { ensureCrewVoices } from "../services/voice/voiceIdentity.js";
import { isLlmConfigured } from "./llmGamemaster.js";

export type SetupShipOffer = {
  id: string;
  name: string;
  /** e.g. NCC-71899 or NX-01 */
  registryNumber: string;
  className: string;
  era: string;
  stardate: string;
  description: string;
  capabilities: string[];
  shipVisualPrompt: string;
  crew: Array<{
    name: string;
    role: string;
    species: string;
    sex?: string;
    height?: string;
    skinTone?: string;
    hair?: string;
    eyes?: string;
    build?: string;
    clothing?: string;
    scarsMarks?: string;
    personality?: string;
    bio?: string;
    imagePrompt: string;
  }>;
};

export type SetupMissionOffer = {
  id: string;
  title: string;
  summary: string;
  type: MissionType;
  location: string;
  background: string;
  main: string;
  secondaries: string[];
};

/** Default setup timeout; heavy tasks override per-call */
const SETUP_TIMEOUT_MS = Number(process.env.XAI_SETUP_TIMEOUT_MS || 90_000);

function getClient(timeoutMs = SETUP_TIMEOUT_MS) {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    timeout: timeoutMs,
    maxRetries: 0, // we handle retries ourselves with clear logs
  });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(body.slice(start, end + 1));
}

async function callSetupJson(
  runId: string,
  phase: string,
  purpose: string,
  system: string,
  user: Record<string, unknown>,
  opts: { timeoutMs?: number; maxTokens?: number; maxAttempts?: number } = {}
): Promise<Record<string, unknown>> {
  if (!isLlmConfigured()) {
    throw new Error("LLM not configured for setup content");
  }

  const timeoutMs =
    opts.timeoutMs ??
    (purpose === "setup_ships" || purpose === "setup_missions"
      ? 90_000
      : SETUP_TIMEOUT_MS);
  const maxTokens =
    opts.maxTokens ??
    (purpose === "setup_ships"
      ? 3500
      : purpose === "setup_missions"
        ? 2800
        : 1200);
  const client = getClient(timeoutMs);
  if (!client) throw new Error("No xAI client");

  const model = process.env.XAI_MODEL || "grok-4.5";
  const maxAttempts =
    opts.maxAttempts ??
    (purpose === "setup_ships" || purpose === "setup_missions" ? 2 : 1);
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    await logLlm(runId, phase, `LLM request: ${purpose}`, {
      model,
      purpose,
      attempt,
      timeoutMs,
      maxTokens,
    });
    try {
      const response = await client.chat.completions.create({
        model,
        temperature: purpose === "setup_ships" ? 0.85 : 0.95,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
      });

      const content = response.choices[0]?.message?.content || "";
      await logLlm(runId, phase, `LLM response: ${purpose}`, {
        model,
        chars: content.length,
        preview: content.slice(0, 280),
        attempt,
        durationMs: Date.now() - t0,
      });

      const parsed = extractJson(content);
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`Invalid JSON from ${purpose}`);
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await logError(runId, phase, `setup LLM attempt failed: ${purpose}`, {
        attempt,
        durationMs: Date.now() - t0,
        error: lastErr.message,
      });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
    }
  }

  throw lastErr || new Error(`Failed setup content: ${purpose}`);
}

const SETUP_SYSTEM = `You are the Narrator, a Star Trek adventure Gamemaster (Picard tone).
Generate setup content aligned with the Star Trek universe: Federation, Starfleet, exploration, diplomacy, ethics, wonder.
Prefer original ship/mission names that feel canon-adjacent; do not paste protected episode scripts.
Always respond with pure JSON only (no markdown fences).`;

export async function generateOpeningGreeting(state: GameState): Promise<string> {
  try {
    const obj = await callSetupJson(
      state.runId,
      state.phase,
      "setup_greeting",
      SETUP_SYSTEM,
      {
        task: "opening_greeting",
        instruction:
          "Write 2-4 sentences introducing yourself as Narrator/Gamemaster and ask only for the captain's name. Picard tone. Return { narration: string }.",
      }
    );
    const n = typeof obj.narration === "string" ? obj.narration.trim() : "";
    if (!n) throw new Error("empty greeting");
    return n;
  } catch (err) {
    await logError(state.runId, state.phase, "setup_greeting failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function generateWelcomeAndTutorialOffer(
  state: GameState,
  captainName: string
): Promise<{ narration: string; choices: string[] }> {
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_welcome",
    SETUP_SYSTEM,
    {
      task: "welcome_tutorial_offer",
      captainName,
      instruction:
        "Welcome the captain by name. Ask if they want an optional tutorial. Return { narration: string, choices: [string, string] } where choices[0] accepts tutorial and choices[1] skips to ship selection. Exactly 2 choices.",
    }
  );
  const narration = String(obj.narration || "").trim();
  const choices = Array.isArray(obj.choices)
    ? obj.choices.map((c) => String(c)).filter(Boolean).slice(0, 2)
    : [];
  if (!narration || choices.length < 2) {
    throw new Error("Invalid welcome payload");
  }
  return { narration, choices };
}

export async function generateTutorialBeat(
  state: GameState
): Promise<{
  narration: string;
  choices: string[];
  crewLine: { speaker: string; line: string };
  viewscreenPrompt: string;
}> {
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_tutorial",
    SETUP_SYSTEM,
    {
      task: "tutorial_beat",
      instruction:
        "Create a low-stakes Starfleet training drill. Return { narration, choices: [safer, riskier], crewLine: {speaker, line}, viewscreenPrompt }. Exactly 2 choices. Teach numbered options and consequences without heavy combat.",
    }
  );
  const narration = String(obj.narration || "").trim();
  const choices = Array.isArray(obj.choices)
    ? obj.choices.map((c) => String(c)).filter(Boolean).slice(0, 2)
    : [];
  const cl = (obj.crewLine && typeof obj.crewLine === "object"
    ? obj.crewLine
    : {}) as Record<string, unknown>;
  const crewLine = {
    speaker: String(cl.speaker || "Operations"),
    line: String(cl.line || "Sensors show a training buoy, Captain."),
  };
  const viewscreenPrompt = String(
    obj.viewscreenPrompt || "Starfleet training buoy on the viewscreen"
  );
  if (!narration || choices.length < 2) throw new Error("Invalid tutorial payload");
  return { narration, choices, crewLine, viewscreenPrompt };
}

export async function generateShipOffers(
  state: GameState
): Promise<{ narration: string; ships: SetupShipOffer[] }> {
  // Keep this payload SMALL — full crew visual bibles made setup_ships hang (90s+).
  // Portraits synthesize imagePrompt server-side from name/role/species.
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_ships",
    SETUP_SYSTEM,
    {
      task: "ship_offers",
      instruction: `Generate exactly 4 Starfleet command ships from DIFFERENT eras (22nd–24th century mix).
Return compact JSON only:
{
  "narration": "2-3 sentences inviting ship choice; mention option 5 custom",
  "ships": [{
    "name": "USS …",
    "registryNumber": "NCC-##### or NX-##",
    "className": "… class",
    "era": "…",
    "stardate": "…",
    "description": "1-2 sentences",
    "capabilities": ["…","…","…"],
    "shipVisualPrompt": "short exterior image lock, no text",
    "crew": [
      {"name":"…","role":"Captain or XO","species":"…","personality":"short"},
      {"name":"…","role":"…","species":"…","personality":"short"},
      {"name":"…","role":"…","species":"…","personality":"short"},
      {"name":"…","role":"…","species":"…","personality":"short"}
    ]
  }]
}
Rules: exactly 4 ships; exactly 4 crew each; unique registryNumbers; no imagePrompt/bio/height fields; keep JSON under ~6k characters.`,
    },
    { timeoutMs: 90_000, maxTokens: 3500, maxAttempts: 2 }
  );

  const narration = String(obj.narration || "").trim();
  const rawShips = Array.isArray(obj.ships) ? obj.ships : [];
  const ships: SetupShipOffer[] = rawShips.slice(0, 4).map((s, i) => {
    const sh = s as Record<string, unknown>;
    const crewRaw = Array.isArray(sh.crew) ? sh.crew : [];
    const shipName = String(sh.name || `USS Vessel ${i + 1}`);
    const className = String(sh.className || "Starfleet class");
    const registryNumber = normalizeRegistryNumber(
      String(sh.registryNumber || sh.registry || sh.ncc || ""),
      shipName.length * 97 + i * 1301
    );
    return {
      id: String(sh.id || `gen-ship-${i + 1}-${randomUUID().slice(0, 8)}`),
      name: shipName,
      registryNumber,
      className,
      era: String(sh.era || "24th century"),
      stardate: String(sh.stardate || "47600.1"),
      description: String(sh.description || "A Starfleet vessel."),
      capabilities: Array.isArray(sh.capabilities)
        ? sh.capabilities.map((c) => String(c)).slice(0, 6)
        : ["Warp drive", "Phasers", "Shields"],
      shipVisualPrompt: String(
        sh.shipVisualPrompt ||
          `Federation starship ${shipName} ${registryNumber}, ${className}, cinematic exterior, no text`
      ),
      crew: crewRaw.slice(0, 4).map((c) => {
        const m = c as Record<string, unknown>;
        const name = String(m.name || "Officer");
        const role = String(m.role || "Bridge Officer");
        const species = String(m.species || "Human");
        const personality = m.personality
          ? String(m.personality)
          : "Dedicated Starfleet officer";
        return {
          name,
          role,
          species,
          sex: m.sex ? String(m.sex) : undefined,
          personality,
          bio: m.bio
            ? String(m.bio)
            : `${name} serves as ${role} aboard ${shipName}.`,
          // Server-side portrait lock — do not require LLM to invent long prompts
          imagePrompt: String(
            m.imagePrompt ||
              `Photorealistic portrait of ${name}, ${species} ${role}, Starfleet uniform, head-and-shoulders, neutral lighting, no text, no watermark`
          ),
        };
      }),
    };
  });

  // Ensure at least 4 crew with placeholders if model under-delivered
  for (const ship of ships) {
    const roles = ["First Officer", "Chief Engineer", "Science Officer", "Tactical"];
    while (ship.crew.length < 4) {
      const n = ship.crew.length;
      const role = roles[n] || "Bridge Officer";
      const name = `Officer ${n + 1}`;
      ship.crew.push({
        name,
        role,
        species: "Human",
        personality: "Dedicated Starfleet officer",
        bio: `${name} serves as ${role}.`,
        imagePrompt: `Photorealistic portrait of ${name}, Human ${role}, Starfleet uniform, head-and-shoulders, no text`,
      });
    }
  }

  if (ships.length < 4) throw new Error("Need 4 generated ships");
  if (!narration) throw new Error("Empty ship narration");
  return { narration, ships };
}

export function shipOfferToShip(offer: SetupShipOffer): Ship {
  const crew: CrewMember[] = (offer.crew.length ? offer.crew : [
    {
      name: "First Officer",
      role: "XO",
      species: "Human",
      imagePrompt:
        "Photorealistic Starfleet first officer portrait, head-and-shoulders, no text",
    },
  ]).map((c) => {
    const personality = c.personality || "Dedicated Starfleet officer";
    const bio = c.bio || `${c.name} serves as ${c.role}.`;
    return {
      id: randomUUID(),
      name: c.name,
      role: c.role,
      species: c.species,
      sex: c.sex,
      height: c.height,
      skinTone: c.skinTone,
      hair: c.hair,
      eyes: c.eyes,
      build: c.build,
      clothing: c.clothing,
      scarsMarks: c.scarsMarks,
      personality,
      bio,
      visual: {
        subjectId: `crew:${c.name.toLowerCase().replace(/\s+/g, "_")}`,
        imagePrompt: c.imagePrompt,
        tags: [c.role, c.species, c.sex || ""].filter(Boolean),
      },
      imageUrl: null,
      portraitStatus: "none" as const,
      loyalty: 50 + Math.floor(Math.random() * 21),
    };
  });

  // Assign distinct locked voices (never the Narrator voice)
  const crewed = ensureCrewVoices(crew);

  const registryNumber = normalizeRegistryNumber(
    offer.registryNumber,
    [...offer.name].reduce((a, c) => a + c.charCodeAt(0), 0)
  );

  return {
    id: offer.id,
    name: offer.name,
    registryNumber,
    className: offer.className,
    era: offer.era,
    stardate: offer.stardate,
    description: offer.description,
    capabilities: offer.capabilities,
    integrity: 100,
    maxIntegrity: 100,
    shieldIntegrity: 100,
    maxShieldIntegrity: 100,
    shieldGridOnline: true,
    shieldRechargeTurns: 0,
    systems: { ...DEFAULT_SYSTEMS },
    crew: crewed,
    scars: [],
    visual: {
      subjectId: `ship:${offer.id}`,
      imagePrompt: offer.shipVisualPrompt,
      tags: [offer.className, offer.era, offer.name, registryNumber],
    },
    exteriorImageUrl: null,
  };
}

/** Normalize custom vessel names to the Starfleet USS registry form. */
function ensureUssName(raw: string): string {
  let name = raw.trim().replace(/^U\.?S\.?S\.?\s+/i, "").trim();
  if (!name) name = "Unnamed";
  return `USS ${name}`;
}

export async function generateCustomShip(
  state: GameState,
  shipName: string,
  className: string
): Promise<Ship> {
  const ussName = ensureUssName(shipName);
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_custom_ship",
    SETUP_SYSTEM,
    {
      task: "custom_ship",
      shipName: ussName,
      className,
      instruction: `Build a complete custom Starfleet ship for name="${ussName}" class="${className}".
The ship name MUST keep the USS prefix exactly as given.
Return {
  registryNumber, era, stardate, description, capabilities: string[],
  shipVisualPrompt,
  crew: [4-6 officers with name, role, species, sex, height, skinTone, hair, eyes, build, clothing, scarsMarks, personality, bio, imagePrompt]
}
registryNumber is required (e.g. "NCC-74205") — era-appropriate unique Starfleet hull number.
Era/stardate should match the class era. Crew must fit that stardate period.`,
    }
  );

  const registryNumber = normalizeRegistryNumber(
    String(obj.registryNumber || obj.registry || obj.ncc || ""),
    [...ussName, className].join("").length * 131
  );

  const offer: SetupShipOffer = {
    id: `custom-${randomUUID().slice(0, 8)}`,
    name: ussName,
    registryNumber,
    className,
    era: String(obj.era || "24th century"),
    stardate: String(obj.stardate || "47600.1"),
    description: String(obj.description || `The ${ussName}, a ${className}.`),
    capabilities: Array.isArray(obj.capabilities)
      ? obj.capabilities.map((c) => String(c))
      : ["Warp drive", "Phasers", "Shields"],
    shipVisualPrompt: String(
      obj.shipVisualPrompt ||
        `${ussName} ${registryNumber}, ${className} Federation starship exterior, cinematic, no text`
    ),
    crew: Array.isArray(obj.crew)
      ? obj.crew.map((c) => {
          const m = c as Record<string, unknown>;
          const name = String(m.name || "Officer");
          return {
            name,
            role: String(m.role || "Bridge Officer"),
            species: String(m.species || "Human"),
            sex: m.sex ? String(m.sex) : undefined,
            height: m.height ? String(m.height) : undefined,
            skinTone: m.skinTone ? String(m.skinTone) : undefined,
            hair: m.hair ? String(m.hair) : undefined,
            eyes: m.eyes ? String(m.eyes) : undefined,
            build: m.build ? String(m.build) : undefined,
            clothing: m.clothing ? String(m.clothing) : undefined,
            scarsMarks: m.scarsMarks ? String(m.scarsMarks) : undefined,
            personality: m.personality ? String(m.personality) : undefined,
            bio: m.bio ? String(m.bio) : undefined,
            imagePrompt: String(
              m.imagePrompt ||
                `Photorealistic portrait of ${name}, Starfleet officer, no text`
            ),
          };
        })
      : [],
  };
  return shipOfferToShip(offer);
}

export async function generateMissionTypePrompt(
  state: GameState
): Promise<{ narration: string; choices: string[] }> {
  const ship = state.ship;
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_mission_type",
    SETUP_SYSTEM,
    {
      task: "mission_type",
      ship: ship
        ? {
            name: ship.name,
            registryNumber: ship.registryNumber,
            className: ship.className,
            era: ship.era,
          }
        : null,
      captainName: state.playerName,
      instruction: `The captain has the bridge. Ask what manner of mission they seek.
Return {
  narration: string,
  choices: exactly 5 strings for:
  1 Science, 2 Exploration, 3 Search & Rescue, 4 Battle, 5 Expanded multi-skill Hardcore
}
Word choices in Trek tone but keep the five categories clear.`,
    }
  );
  const narration = String(obj.narration || "").trim();
  let choices = Array.isArray(obj.choices)
    ? obj.choices.map((c) => String(c)).filter(Boolean)
    : [];
  // Ensure 5 slots map to our type indices even if model drifts
  const defaults = [
    "Science — technology and problem-solving",
    "Exploration — discovery and diplomacy",
    "Search & Rescue — find and save those in peril",
    "Battle — starship combat and strategy",
    "Expanded — complex multi-skill Hardcore scenario",
  ];
  while (choices.length < 5) choices.push(defaults[choices.length]);
  choices = choices.slice(0, 5);
  if (!narration) throw new Error("Empty mission type narration");
  return { narration, choices };
}

export async function generateDifficultyPrompt(
  state: GameState
): Promise<{ narration: string; choices: string[] }> {
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_difficulty",
    SETUP_SYSTEM,
    {
      task: "difficulty",
      missionType: state.missionType,
      instruction:
        "Ask the captain to choose difficulty. Return { narration, choices: exactly 4 strings for Easy, Medium, Hard, Hardcore in that order }. Trek tone.",
    }
  );
  const narration = String(obj.narration || "Select difficulty:").trim();
  let choices = Array.isArray(obj.choices)
    ? obj.choices.map((c) => String(c)).filter(Boolean)
    : [];
  const defaults = ["Easy", "Medium", "Hard", "Hardcore"];
  while (choices.length < 4) choices.push(defaults[choices.length]);
  return { narration, choices: choices.slice(0, 4) };
}

export async function generateMissionOffers(
  state: GameState,
  reshuffle = false
): Promise<{ narration: string; offers: SetupMissionOffer[] }> {
  const type = state.missionType || "exploration";
  const difficulty = state.difficulty || "medium";
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_missions",
    SETUP_SYSTEM,
    {
      task: "mission_offers",
      missionType: type,
      difficulty,
      reshuffle,
      ship: state.ship
        ? {
            name: state.ship.name,
            className: state.ship.className,
            era: state.ship.era,
            stardate: state.ship.stardate,
          }
        : null,
      instruction: `Invent 3 original Star Trek–style missions for type=${type}, difficulty=${difficulty}.
${reshuffle ? "Provide different missions than a prior batch." : ""}
Return {
  narration: string (present the 3 options; mention typing "more" for alternatives),
  missions: [{
    title, summary, location, background,
    main: string,
    secondaries: string[1-3]
  }]
}
Exactly 3 missions. Stakes scale with difficulty. Expanded type should be multi-faceted crises.`,
    }
  );

  const narration = String(obj.narration || "").trim();
  const raw = Array.isArray(obj.missions) ? obj.missions : [];
  const offers: SetupMissionOffer[] = raw.slice(0, 3).map((m, i) => {
    const mi = m as Record<string, unknown>;
    const secondaries = Array.isArray(mi.secondaries)
      ? mi.secondaries.map((s) => String(s)).slice(0, 3)
      : ["Complete secondary Starfleet objectives"];
    return {
      id: randomUUID(),
      title: String(mi.title || `Mission ${i + 1}`),
      summary: String(mi.summary || mi.background || "A Starfleet assignment."),
      type,
      location: String(mi.location || "Uncharted space"),
      background: String(mi.background || mi.summary || "Starfleet has issued orders."),
      main: String(mi.main || "Complete the primary objective"),
      secondaries: secondaries.length ? secondaries : ["Support allied vessels"],
    };
  });
  if (offers.length < 3) throw new Error("Need 3 missions");
  if (!narration) {
    return {
      narration: offers
        .map((o, i) => `${i + 1}. ${o.title}\n   ${o.summary}`)
        .join("\n\n") + `\n\nSelect 1–3, or type "more" for different missions.`,
      offers,
    };
  }
  return { narration, offers };
}

export function missionFromOffer(
  offer: SetupMissionOffer,
  difficulty: Difficulty
): Mission {
  return {
    id: offer.id,
    title: offer.title,
    type: offer.type,
    difficulty,
    background: offer.background,
    brief: offer.summary,
    location: offer.location,
    status: "active",
    knownIntel: [offer.summary],
    flags: [],
    playTurnCount: 0,
    objectives: [
      {
        id: "main",
        title: offer.main,
        description: offer.main,
        kind: "main",
        status: "active",
      },
      ...offer.secondaries.map((s, i) => ({
        id: `sec-${i + 1}`,
        title: s,
        description: s,
        kind: "secondary" as const,
        status: "active" as const,
      })),
    ],
  };
}

export async function generateMissionBrief(
  state: GameState
): Promise<{ narration: string; choices: string[] }> {
  const m = state.mission!;
  const ship = state.ship!;
  const obj = await callSetupJson(
    state.runId,
    state.phase,
    "setup_brief",
    SETUP_SYSTEM,
    {
      task: "mission_brief",
      captainName: state.playerName,
      ship: {
        name: ship.name,
        className: ship.className,
        stardate: ship.stardate,
        integrity: ship.integrity,
      },
      mission: {
        title: m.title,
        type: m.type,
        difficulty: m.difficulty,
        location: m.location,
        background: m.background,
        objectives: m.objectives,
      },
      instruction: `Write a formal mission brief in Picard/Narrator tone including stardate, background, objectives, and ship status.
End by asking whether to accept and take the bridge or return to the mission list.
Return {
  narration: string,
  choices: exactly 2 strings — [0]=accept/begin, [1]=return to list
}`,
    }
  );
  const narration = String(obj.narration || "").trim();
  let choices = Array.isArray(obj.choices)
    ? obj.choices.map((c) => String(c)).filter(Boolean)
    : [];
  if (choices.length < 2) {
    choices = ["Accept mission and take the bridge", "Return to mission list"];
  }
  if (!narration) throw new Error("Empty brief");
  return { narration, choices: choices.slice(0, 2) };
}

export function formatShipChoices(
  ships: SetupShipOffer[],
  narration: string
): { text: string; choices: TurnOption[] } {
  const lines = ships
    .map((s, i) => {
      const reg = s.registryNumber || "";
      return `${i + 1}. ${s.name}${reg ? ` ${reg}` : ""} — ${s.className} (${s.era})\n   ${s.description}`;
    })
    .join("\n\n");
  const customN = ships.length + 1;
  const text = `${narration}\n\n${lines}\n\n${customN}. Create a custom ship`;
  const choices: TurnOption[] = [
    ...ships.map((s, i) => ({
      id: i + 1,
      text: `${s.name}${s.registryNumber ? ` ${s.registryNumber}` : ""} — ${s.className} (${s.era})`,
      risk: "low" as const,
    })),
    {
      id: customN,
      text: "Create a custom ship",
      risk: "medium",
    },
  ];
  return { text, choices };
}
