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
import { loadSkillPacks } from "../content/loader.js";
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
  /** Always true for successful LLM scenes; false only if parse produced empty filler */
  usedLlm: boolean;
};

export function isLlmConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

function getClient() {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    timeout: 60_000,
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

  return {
    narration,
    crewDialogue,
    options,
    viewscreenPrompt,
    newIntel,
    setFlags,
    objectiveUpdates,
    endMission,
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

  const skills = await loadSkillPacks();
  const model = process.env.XAI_MODEL || "grok-4.5";

  try {
    await logLlm(state.runId, state.phase, `LLM request: ${purpose}`, {
      model,
      purpose,
    });

    const response = await client.chat.completions.create({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: [
            skills,
            "",
            "You are the live Gamemaster for the PLAYING phase.",
            "The host already resolved dice and integrity. Treat mechanicalResults as absolute truth.",
            "Return JSON only matching the play-turn schema.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            purpose,
            game: stateSnapshot(state),
            crewRoster: state.ship?.crew.map((c) => ({
              name: c.name,
              role: c.role,
              species: c.species,
            })),
            recentLog: state.log.slice(-10).map((e) => ({
              kind: e.kind,
              phase: e.phase,
              text: e.text.slice(0, 400),
            })),
            previousScene: state.turn
              ? {
                  narration: state.turn.narration?.slice(0, 500),
                  options: state.turn.options,
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
        "Write the opening captain's log and first decision point for this mission. No mechanicalResults yet — mission just began. Offer 3-4 opening options. endMission must be null.",
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
        "Default endMission to null.",
        "Only set endMission to success if the MAIN objective is clearly completed after a substantial arc — not after a single lucky or failed exchange.",
        "Only set endMission to failed if the main objective is truly lost or the ship is effectively finished.",
        "Partial progress = keep playing (endMission null).",
        "Do not mention raw d20 numbers in narration.",
        `Current playTurnCount=${state.mission?.playTurnCount ?? 0}.`,
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
  const client = getClient();
  if (!client) return null;
  const model = process.env.XAI_MODEL || "grok-4.5";
  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You are Narrator. Write a concise mission debrief in Picard tone (3-6 short paragraphs). Include casualties/damage implications from the snapshot. Plain text only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            success,
            game: stateSnapshot(state),
            recentLog: state.log.slice(-12).map((e) => e.text.slice(0, 300)),
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
