/**
 * True LLM Gamemaster (Narrator) via xAI.
 * Code remains referee for dice/integrity; this agent authors scenes.
 */

import OpenAI from "openai";
import type {
  CrewLine,
  GameState,
  ObjectiveStatus,
  OptionRisk,
  TurnOption,
} from "../../../packages/game-core/src/index.js";
import { loadSkillPacksCompact } from "../content/loader.js";
import { logError, logLlm } from "../debug/sessionDebugLog.js";
import { stateSnapshot } from "../debug/sessionDebugLog.js";

export type MechanicalResults = {
  playerAction: string;
  risk: OptionRisk | string;
  roll?: {
    die: number;
    threshold: number;
    success: boolean;
    critical: "none" | "success" | "failure";
    reason: string;
  } | null;
  integrityBefore: number;
  integrityAfter: number;
  integrityDelta: number;
  systemChanges: string[];
  flagsAdded: string[];
  notes: string[];
};

export type LlmScene = {
  narration: string;
  crewDialogue: CrewLine[];
  options: TurnOption[];
  viewscreenPrompt: string;
  newIntel: string[];
  setFlags: string[];
  objectiveUpdates: Array<{ id: string; status: ObjectiveStatus }>;
  endMission: null | "success" | "failed";
  /**
   * Bridge SFX cues for this beat (catalog keys). Client plays on turn paint.
   * Empty array = no narrator-driven SFX (client still has keyword/state SFX).
   */
  sfx: string[];
  /** Always true for successful LLM scenes; false only if parse produced empty filler */
  usedLlm: boolean;
};

/**
 * Allowed SFX cue ids the Narrator may request.
 * Maps friendly aliases → client catalog keys in trekSfx.js.
 */
const SFX_ALIAS: Record<string, string> = {
  // Weapons
  phaser: "phaser",
  phasers: "phaser",
  phaser_fire: "phaser",
  weapons_fire: "phaser",
  torpedo: "torpedo",
  torpedoes: "torpedo",
  photon: "torpedo",
  photons: "torpedo",
  quantum: "quantum_torpedo",
  quantum_torpedo: "quantum_torpedo",
  fire_all: "fire_all",
  fire_all_weapons: "fire_all",
  deflector: "deflector",
  // Impacts / damage
  shield_hit: "shield_sizzle",
  shield_sizzle: "shield_sizzle",
  shields_hit: "shield_sizzle",
  hull_hit: "hull_hit",
  hull_damage: "hull_hit",
  explosion: "large_explosion",
  large_explosion: "large_explosion",
  small_explosion: "small_explosion",
  console_explode: "console_explo1",
  console_damage: "console_explo1",
  damage_alarm: "damage_alarm",
  critical: "critical",
  // Alerts
  red_alert: "red_alert",
  yellow_alert: "yellow_alert",
  klaxon: "red_alert",
  battle_stations: "red_alert",
  intruder: "intruder",
  intruder_alert: "intruder",
  proximity: "voice_proximity",
  proximity_alert: "voice_proximity",
  // Movement
  warp: "warp",
  warp_engage: "warp",
  warp_exit: "warp_exit",
  drop_out_of_warp: "warp_exit",
  impulse: "helm_engage",
  helm: "helm_engage",
  evasive: "flyby",
  flyby: "flyby",
  // Systems
  transporter: "transporter",
  transport: "transporter",
  beam: "transporter",
  transporter_fail: "transporter_fail",
  tractor: "tractor",
  tractor_beam: "tractor",
  cloak: "cloak",
  decloak: "decloak",
  shields_up: "power_up1",
  shields_down: "power_down",
  power_up: "power_up1",
  power_down: "power_down",
  engineering: "engineering",
  repair: "engineering",
  sensors: "sensor",
  scan: "sensor",
  sensor: "sensor",
  probe: "probe",
  tricorder: "tricorder",
  // Comms
  hail: "hailing_open",
  hailing: "hailing_open",
  hailing_open: "hailing_open",
  incoming_hail: "incoming_hail",
  end_transmission: "end_transmission",
  static: "comm_static",
  comm_static: "comm_static",
  // Security / ship life
  forcefield: "forcefield",
  forcefield_off: "forcefield_off",
  door: "door",
  turbolift: "turbolift_start",
  // Flavor
  replicator: "replicator",
  medical: "hypospray",
  hypospray: "hypospray",
  holodeck: "holodeck_on",
  holodeck_off: "holodeck_off",
  // Voices / outcomes
  shields_failing: "voice_shields_failing",
  structural: "voice_structural",
  abandon_ship: "voice_abandon_ship",
  warp_core: "voice_warp_core",
  unable: "voice_unable",
  affirmative: "voice_affirmative",
  transfer_complete: "voice_transfer",
  self_destruct: "voice_self_destruct",
  // Enemy
  klingon: "klingon_disruptor",
  romulan: "romulan_disruptor",
  borg: "borg_phaser",
  // UI-ish scene beats
  viewscreen: "viewscreen_on",
  viewscreen_on: "viewscreen_on",
  viewscreen_off: "viewscreen_off",
  alert: "alert01",
  warning: "console_warning",
};

/** Catalog keys the client accepts (subset + aliases resolved to these) */
const SFX_CATALOG = new Set([
  ...Object.values(SFX_ALIAS),
  "phaser2",
  "torpedo2",
  "shield_sizzle2",
  "console_explo2",
  "console_explo3",
  "large_explosion2",
  "damage_alarm2",
  "red_alert2",
  "intruder_nemesis",
  "voice_structural_breach",
  "voice_nacelle",
  "voice_incoming",
  "voice_long_range",
  "voice_insufficient_sensors",
  "voice_self_destruct_cancel",
  "voice_auth",
  "start_transmission",
  "hail_beep",
  "energize",
  "tactical",
  "ops_seq",
  "helm_seq",
  "sensor_alert",
  "alert_sensors",
  "power_up2",
  "powering_down",
  "forcefield_disable",
  "forcefield_hit",
  "door_close",
  "door_open2",
  "turbolift",
  "turbolift_stop",
  "tng_chime",
  "engage",
  "input_ok",
  "deny",
]);

function normalizeSfx(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) continue;
    const mapped = SFX_ALIAS[key] || (SFX_CATALOG.has(key) ? key : null);
    if (mapped && !out.includes(mapped)) out.push(mapped);
    if (out.length >= 4) break;
  }
  return out;
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

/** Play-turn LLM timeout (ms). Keep below client abort so the UI gets a clean error. */
const LLM_TIMEOUT_MS = Number(process.env.XAI_LLM_TIMEOUT_MS || 75_000);
/** Cap completion length — long Picard monologues are the main latency sink */
const PLAY_MAX_TOKENS = Number(process.env.XAI_PLAY_MAX_TOKENS || 1400);

function getClient(timeoutMs = LLM_TIMEOUT_MS) {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    timeout: timeoutMs,
    maxRetries: 1, // one retry on transient errors; don't stack 3× long waits
  });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip markdown fences if the model ignores instructions
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(body.slice(start, end + 1));
}

function normalizeRisk(raw: unknown): OptionRisk {
  const s = String(raw || "medium").toLowerCase();
  if (s === "low" || s === "medium" || s === "high" || s === "trap") return s;
  return "medium";
}

function normalizeStatus(raw: unknown): ObjectiveStatus | null {
  const s = String(raw || "").toLowerCase();
  if (
    s === "active" ||
    s === "completed" ||
    s === "failed" ||
    s === "missed"
  ) {
    return s;
  }
  return null;
}

function normalizeScene(raw: unknown, fallbackNotes: string[]): LlmScene {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  // Do not invent mock narration — empty means caller should treat as LLM failure
  const narration =
    typeof obj.narration === "string" && obj.narration.trim()
      ? obj.narration.trim()
      : "";

  const crewDialogue: CrewLine[] = Array.isArray(obj.crewDialogue)
    ? obj.crewDialogue
        .map((line) => {
          const l = line as Record<string, unknown>;
          if (typeof l?.speaker === "string" && typeof l?.line === "string") {
            return { speaker: l.speaker, line: l.line };
          }
          return null;
        })
        .filter(Boolean) as CrewLine[]
    : [];

  let options: TurnOption[] = Array.isArray(obj.options)
    ? obj.options
        .map((opt, i) => {
          const o = opt as Record<string, unknown>;
          const text = typeof o?.text === "string" ? o.text.trim() : "";
          if (!text) return null;
          return {
            id: typeof o.id === "number" ? o.id : i + 1,
            text,
            risk: normalizeRisk(o.risk),
          };
        })
        .filter(Boolean) as TurnOption[]
    : [];

  // Ensure 3–4 options and sequential ids
  if (options.length < 3) {
    const fillers: TurnOption[] = [
      {
        id: options.length + 1,
        text: "Hold position and reassess with senior staff",
        risk: "low",
      },
      {
        id: options.length + 2,
        text: "Press the primary objective with a measured plan",
        risk: "medium",
      },
      {
        id: options.length + 3,
        text: "Take a bold, high-risk action to force the issue",
        risk: "trap",
      },
    ];
    options = [...options, ...fillers].slice(0, 4);
  }
  options = options.slice(0, 4).map((o, i) => ({
    ...o,
    id: i + 1,
    risk: normalizeRisk(o.risk),
  }));
  if (!options.some((o) => o.risk === "high" || o.risk === "trap")) {
    options[options.length - 1] = {
      ...options[options.length - 1],
      risk: "trap",
    };
  }

  const viewscreenPrompt =
    typeof obj.viewscreenPrompt === "string" && obj.viewscreenPrompt.trim()
      ? obj.viewscreenPrompt.trim()
      : "Starship bridge viewscreen, dramatic lighting, deep space";

  const newIntel = Array.isArray(obj.newIntel)
    ? obj.newIntel.filter(
        (x): x is string => typeof x === "string" && Boolean(x.trim())
      )
    : [];

  const setFlags = Array.isArray(obj.setFlags)
    ? obj.setFlags.filter(
        (x): x is string => typeof x === "string" && Boolean(x.trim())
      )
    : [];

  const objectiveUpdates: LlmScene["objectiveUpdates"] = [];
  if (Array.isArray(obj.objectiveUpdates)) {
    for (const u of obj.objectiveUpdates) {
      const item = u as Record<string, unknown>;
      const id = typeof item?.id === "string" ? item.id : null;
      const status = normalizeStatus(item?.status);
      if (id && status) objectiveUpdates.push({ id, status });
    }
  }

  let endMission: LlmScene["endMission"] = null;
  if (obj.endMission === "success" || obj.endMission === "failed") {
    endMission = obj.endMission;
  }

  // Accept sfx, sounds, or audioCues from the model
  const sfx = normalizeSfx(
    obj.sfx ?? obj.sounds ?? obj.audioCues ?? obj.soundEffects
  );

  return {
    narration,
    crewDialogue,
    options,
    viewscreenPrompt,
    newIntel,
    setFlags,
    objectiveUpdates,
    endMission,
    sfx,
    // Only count as a real LLM scene if we got narration text
    usedLlm: Boolean(narration),
  };
}

async function callXaiJson(
  state: GameState,
  userPayload: Record<string, unknown>,
  purpose: string
): Promise<LlmScene | null> {
  const client = getClient();
  if (!client) return null;

  // Compact skills + lean context = much lower time-to-first-token
  const skills = await loadSkillPacksCompact(10_000);
  const model = process.env.XAI_MODEL || "grok-4.5";

  try {
    await logLlm(state.runId, state.phase, `LLM request: ${purpose}`, {
      model,
      purpose,
      timeoutMs: LLM_TIMEOUT_MS,
      maxTokens: PLAY_MAX_TOKENS,
    });

    const response = await client.chat.completions.create({
      model,
      temperature: 0.85,
      max_tokens: PLAY_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: [
            skills,
            "",
            "You are the live Gamemaster for the PLAYING phase.",
            "The host already resolved dice and integrity. Treat mechanicalResults as absolute truth.",
            "Return ONE JSON object only (no markdown fences) with keys:",
            "narration, crewDialogue[{speaker,line}], options[{id,text,risk}], viewscreenPrompt, newIntel[], setFlags[], objectiveUpdates[{id,status}], endMission, sfx[].",
            "Narration: 1–3 short paragraphs max (TTS-friendly). crewDialogue: 0–2 short lines.",
            "options: exactly 3–4, risk one of low|medium|high|trap. endMission: null unless mission truly ends.",
            "sfx: optional string array (0–4) of bridge sound cues that match THIS beat's fiction — played on the client as the scene lands.",
            "Use sfx for events the player HEARS on the bridge (weapons fire, shield hits, alerts, warp, transporter, hails, explosions, system failures).",
            "Valid sfx examples: phaser, torpedo, quantum_torpedo, fire_all, shield_hit, hull_hit, explosion, red_alert, yellow_alert, intruder, warp, warp_exit, transporter, tractor, cloak, decloak, hail, end_transmission, scan, probe, shields_up, shields_down, engineering, forcefield, door, medical, holodeck, klingon, romulan, borg, shields_failing, structural, damage_alarm, critical, proximity, static, viewscreen.",
            "Prefer 1–3 precise cues; empty [] if nothing distinctive happens. Do NOT invent cue names outside the list.",
            "Do NOT invent mock dice. Do NOT mention raw d20 numbers.",
            "Intensity: battle/low hull = short urgent sentences; wonder = calmer; match the fiction.",
            "Never offer options that need destroyed systems as if they still work.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            purpose,
            sceneGuidance: {
              missionType: state.mission?.type || state.missionType,
              hull: state.ship?.integrity,
              shields: state.ship?.shieldIntegrity,
              shieldGridOnline: state.ship?.shieldGridOnline,
              systems: state.ship?.systems,
              flags: state.mission?.flags || [],
              intensityHint:
                state.mission?.type === "battle" ||
                (state.ship?.integrity ?? 100) <= 50 ||
                state.ship?.shieldGridOnline === false ||
                (state.mission?.flags || []).some((f) =>
                  /combat|trap|board|critical|raid|cloak/i.test(f)
                )
                  ? "urgent_or_tense"
                  : state.mission?.type === "exploration"
                    ? "wonder_or_calm"
                    : "match_the_moment",
            },
            game: stateSnapshot(state),
            crewRoster: (state.ship?.crew || []).slice(0, 6).map((c) => ({
              name: c.name,
              role: c.role,
              species: c.species,
            })),
            systemConstraints: state.ship
              ? Object.entries(state.ship.systems)
                  .filter(([, st]) => st !== "ok")
                  .map(([k, st]) => `${k}: ${st}`)
              : [],
            // Lean log: last 5 beats, short snippets
            recentLog: state.log.slice(-5).map((e) => ({
              kind: e.kind,
              text: e.text.slice(0, 220),
            })),
            previousScene: state.turn
              ? {
                  narration: state.turn.narration?.slice(0, 320),
                  options: state.turn.options?.map((o) => ({
                    id: o.id,
                    text: o.text.slice(0, 100),
                    risk: o.risk,
                  })),
                }
              : null,
            ...userPayload,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    await logLlm(state.runId, state.phase, `LLM response: ${purpose}`, {
      model,
      chars: content.length,
      preview: content.slice(0, 280),
    });

    const parsed = extractJson(content);
    return normalizeScene(parsed, [
      typeof userPayload.fallbackNarration === "string"
        ? userPayload.fallbackNarration
        : "",
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[llm-gm] ${purpose} failed:`, message);
    await logError(state.runId, state.phase, `LLM failed: ${purpose}`, {
      error: message,
    });
    return null;
  }
}

/** Opening captain's log when mission play begins */
export async function generateOpeningScene(
  state: GameState
): Promise<LlmScene | null> {
  return callXaiJson(
    state,
    {
      purpose: "mission_opening",
      instruction:
        "Write the opening captain's log and first decision point for this mission. No mechanicalResults yet — mission just began. Offer 3-4 opening options. endMission must be null. sfx may include viewscreen, hail, or sensor if appropriate; otherwise [].",
      fallbackNarration: `Captain's Log, Stardate ${state.ship?.stardate}. We arrive at ${state.mission?.location}. ${state.mission?.background}`,
    },
    "mission_opening"
  );
}

/** After player acts and mechanics resolve */
export async function generatePlayScene(
  state: GameState,
  mechanical: MechanicalResults
): Promise<LlmScene | null> {
  return callXaiJson(
    state,
    {
      purpose: "play_turn",
      mechanicalResults: mechanical,
      instruction: [
        "Narrate the outcome of the captain's order using mechanicalResults.",
        "Then present the next situation with 3-4 options.",
        "Match intensity: if combat, weapons fire, boarding, or low hull — urgent short sentences and tense crew lines, not florid logs.",
        "If the risk was high/trap or dice critically failed, let the bridge feel it in tone.",
        "Respect ship systems: NEVER offer an option that requires a destroyed system as if it still works (warp jump if warp destroyed, torpedo salvo if torpedoes destroyed, full sensor sweep if sensors destroyed, hails if comms destroyed).",
        "Damaged systems may still be attempted but options should acknowledge the impairment (partial scans, unstable warp, weak phasers).",
        "Reflect hull vs shield state in the fiction: shields absorb energy weapons poorly when low; torpedoes slam harder once shields fall; grid offline means recharge delay.",
        "If mechanicalResults notes system damage or shield collapse, the crew must react to it.",
        "Always set sfx[] to match the fiction of this beat (e.g. shield_hit + damage_alarm after a hit; phaser/torpedo when weapons fire; red_alert in combat; warp when going to warp).",
        "Default endMission to null.",
        "Only set endMission to success if the MAIN objective is clearly completed after a substantial arc — not after a single lucky or failed exchange.",
        "Only set endMission to failed if the main objective is truly lost or the ship is effectively finished.",
        "Partial progress = keep playing (endMission null).",
        "Do not mention raw d20 numbers in narration.",
        `Current playTurnCount=${state.mission?.playTurnCount ?? 0}.`,
        `Hull ${state.ship?.integrity ?? "?"}/${state.ship?.maxIntegrity ?? "?"}; Shields ${state.ship?.shieldIntegrity ?? "?"}/${state.ship?.maxShieldIntegrity ?? "?"} (${state.ship?.shieldGridOnline ? "online" : `offline, recharge ${state.ship?.shieldRechargeTurns ?? "?"}`}).`,
        `Systems: ${state.ship ? Object.entries(state.ship.systems).map(([k, v]) => `${k}=${v}`).join(", ") : "n/a"}.`,
      ].join(" "),
      fallbackNarration: mechanical.notes.join(" "),
    },
    "play_turn"
  );
}

/**
 * Free-text player input (questions or custom orders — not a numbered option).
 * Code may still apply light mechanics when inputKind is action.
 */
export async function generateFreeformScene(
  state: GameState,
  playerText: string,
  mechanical: MechanicalResults | null
): Promise<LlmScene | null> {
  return callXaiJson(
    state,
    {
      purpose: "freeform",
      playerFreeText: playerText,
      mechanicalResults: mechanical,
      instruction: [
        "The captain did NOT pick a numbered option. They typed free text.",
        "If it is a QUESTION (status, sensors, advice, lore the ship would know): answer in Narrator voice using only known intel. Do not invent secret facts. Keep or lightly refresh 3-4 options. endMission must be null. Do not advance the mission timeline much.",
        "If it is a CUSTOM ORDER/action: narrate the attempt. If mechanicalResults is present, treat it as absolute truth for dice/damage.",
        "Always return full JSON scene schema with 3-4 options.",
        "Include sfx[] for any distinctive audio (scan, hail, transporter, etc.); use [] for pure dialogue/Q&A.",
      ].join(" "),
      fallbackNarration: `Regarding your inquiry: "${playerText}" — the bridge crew consults available data.`,
    },
    "freeform"
  );
}

/** Debrief prose when mission ends */
export async function generateDebriefNarration(
  state: GameState,
  success: boolean
): Promise<string | null> {
  const client = getClient(45_000);
  if (!client) return null;
  const model = process.env.XAI_MODEL || "grok-4.5";
  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.75,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are Narrator. Write a concise mission debrief in Picard tone (2–4 short paragraphs). Include casualties/damage implications from the snapshot. Plain text only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            success,
            game: stateSnapshot(state),
            recentLog: state.log.slice(-6).map((e) => e.text.slice(0, 200)),
          }),
        },
      ],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (text) {
      await logLlm(state.runId, state.phase, "LLM debrief", {
        chars: text.length,
      });
    }
    return text || null;
  } catch (err) {
    console.warn("[llm-gm] debrief failed:", err);
    return null;
  }
}
