/**
 * Phase 5 “Ask for advice” referee helpers.
 * No I/O, no dice, no playTurnCount. LLM only fills the scene fragment.
 */

import type {
  AdviceSuggestedOption,
  CrewMember,
  GameState,
  LastAdvice,
  OptionRisk,
  TurnOption,
} from "./types.js";

export type AdviceGate =
  | { ok: true; member: CrewMember; turn: number }
  | { ok: false; error: string; member?: CrewMember };

export type AdviceScene = {
  narration: string;
  advice: string;
  suggestedOption: AdviceSuggestedOption | null;
};

const OPTION_RISKS: OptionRisk[] = ["low", "medium", "high", "trap"];

export function gateCrewAdvice(state: GameState, memberId: string): AdviceGate {
  const id = String(memberId || "").trim();
  if (!id) return { ok: false, error: "Crew member not found" };
  const member = state.ship?.crew?.find((c) => c.id === id);
  if (!member) return { ok: false, error: "Crew member not found" };
  const status = member.status || "active";
  if (status !== "active") {
    return {
      ok: false,
      error: `${member.name} is ${status} and cannot advise.`,
      member,
    };
  }
  const turn = state.mission?.playTurnCount || 0;
  const last = state.adviceCooldowns?.[id];
  // Includes turn 0 — one consult per officer per play beat.
  if (typeof last === "number" && last === turn) {
    return {
      ok: false,
      error: "Already sought this officer's advice this turn.",
      member,
    };
  }
  return { ok: true, member, turn };
}

export function buildAdviceSnapshot(
  state: GameState,
  member: CrewMember,
  question?: string
) {
  const crew = state.ship?.crew || [];
  return {
    officer: {
      name: member.name,
      role: member.role,
      rank: member.rank,
      species: member.species,
      personality: member.personality,
      bio: member.bio,
      skills: member.skills,
      loyalty: member.loyalty,
      serviceTurns: member.serviceTurns,
      missionsServed: member.missionsServed,
      status: member.status || "active",
    },
    question:
      question?.trim() || "What is your recommendation, given our situation?",
    situation: {
      phase: state.phase,
      pendingQuestion: state.pendingQuestion?.slice(0, 600),
      mission: state.mission
        ? {
            title: state.mission.title,
            type: state.mission.type,
            playTurnCount: state.mission.playTurnCount || 0,
            flags: state.mission.flags?.slice(-10),
            knownIntel: state.mission.knownIntel?.slice(-6),
          }
        : null,
      ship: state.ship
        ? {
            name: state.ship.name,
            hull: `${state.ship.integrity}/${state.ship.maxIntegrity}`,
            shields: `${state.ship.shieldIntegrity}/${state.ship.maxShieldIntegrity}`,
            systems: state.ship.systems,
            skills: state.ship.skills?.total,
          }
        : null,
      universe: state.universe
        ? {
            stardate: state.universe.stardate,
            reputation: state.universe.factionReputation,
          }
        : null,
    },
    scars: (state.ship?.scars || []).slice(-8),
    deaths: crew
      .filter((c) => c.status === "dead")
      .map((c) => ({
        name: c.name,
        role: c.role,
        cause: c.deathCause || "lost in the line of duty",
      })),
  };
}

function normalizeRisk(raw: unknown): OptionRisk {
  const s = String(raw || "").toLowerCase();
  return OPTION_RISKS.includes(s as OptionRisk) ? (s as OptionRisk) : "medium";
}

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim();
}

type RawAdviceJson = {
  narration?: unknown;
  advice?: unknown;
  suggestedOption?: { text?: unknown; risk?: unknown } | null;
};

export function parseAdviceScene(raw: string, fallbackSpeaker: string): AdviceScene {
  const text = String(raw || "").trim();
  let obj: RawAdviceJson | null = null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      obj = JSON.parse(text.slice(start, end + 1)) as RawAdviceJson;
    } catch {
      obj = null;
    }
  }
  const advice = clip(
    String(obj?.advice || (obj ? "" : text) || "").trim() ||
      `${fallbackSpeaker}: I need a moment to consider the data, Captain.`,
    800
  );
  const narration = clip(String(obj?.narration || "").trim(), 400);
  const optText = String(obj?.suggestedOption?.text || "").trim();
  const suggestedOption: AdviceSuggestedOption | null = optText
    ? { text: clip(optText, 160), risk: normalizeRisk(obj?.suggestedOption?.risk) }
    : null;
  return { narration, advice, suggestedOption };
}

export function mergeSuggestedOption(
  options: TurnOption[] | null | undefined,
  suggested: AdviceSuggestedOption | null | undefined
): TurnOption[] | null {
  if (!options?.length) return options ? [...options] : null;
  if (!suggested?.text?.trim()) return [...options];
  const needle = suggested.text.trim().toLowerCase();
  if (options.some((o) => o.text.trim().toLowerCase() === needle)) {
    return [...options];
  }
  const nextId = Math.max(0, ...options.map((o) => o.id)) + 1;
  return [
    ...options,
    {
      id: nextId,
      text: clip(suggested.text, 160),
      risk: suggested.risk || "medium",
    },
  ];
}

export function applyAdviceToState(
  state: GameState,
  member: CrewMember,
  scene: AdviceScene,
  question?: string
): GameState {
  const turnCount = state.mission?.playTurnCount || 0;
  const cooldowns = { ...(state.adviceCooldowns || {}) };
  cooldowns[member.id] = turnCount;

  const q = question?.trim() || undefined;
  const lastAdvice: LastAdvice = {
    memberId: member.id,
    memberName: member.name,
    question: q,
    narration: scene.narration,
    advice: scene.advice,
    suggestedOption: scene.suggestedOption,
    atTurn: turnCount,
  };

  const crewLine = { speaker: member.name, line: scene.advice };
  let nextTurn = state.turn
    ? {
        ...state.turn,
        crewDialogue: [...(state.turn.crewDialogue || []), crewLine].slice(-6),
      }
    : state.turn;

  let pendingChoices = state.pendingChoices;
  if (scene.suggestedOption) {
    const merged = mergeSuggestedOption(
      pendingChoices || nextTurn?.options,
      scene.suggestedOption
    );
    if (merged) {
      pendingChoices = merged;
      if (nextTurn) nextTurn = { ...nextTurn, options: merged };
    }
  }

  const logText = scene.narration
    ? `Advice — ${member.name}: ${scene.narration} ${scene.advice}`
    : `Advice — ${member.name}: ${scene.advice}`;

  return {
    ...state,
    adviceCooldowns: cooldowns,
    lastAdvice,
    turn: nextTurn,
    pendingChoices: pendingChoices ?? state.pendingChoices,
    log: [
      ...state.log,
      {
        at: new Date().toISOString(),
        phase: state.phase,
        kind: "system",
        text: logText,
      },
    ],
  };
}
