/**
 * Tool registry — mechanical effects only.
 * Future: ImagineAgent / voice register here without changing GM core.
 */

import {
  applyIntegrityDamage,
  evaluateD20,
  hintsAllowed,
  rollD20,
  setSystem,
  shipStatusSummary,
  systemLabel,
  type Difficulty,
  type GameState,
  type ShipSystems,
} from "../../../packages/game-core/src/index.js";

export type ToolResult = {
  ok: boolean;
  message: string;
  state?: GameState;
  data?: Record<string, unknown>;
};

export function toolRollD20(
  state: GameState,
  reason: string,
  actionModifier = 0
): ToolResult {
  if (!state.difficulty) {
    return { ok: false, message: "Difficulty is not set." };
  }
  const die = rollD20();
  const result = evaluateD20(die, state.difficulty, actionModifier);
  const next: GameState = {
    ...state,
    turn: state.turn
      ? {
          ...state.turn,
          lastRoll: {
            die,
            threshold: result.threshold,
            success: result.success,
            critical: result.critical,
            reason,
          },
        }
      : state.turn,
    log: [
      ...state.log,
      {
        at: new Date().toISOString(),
        phase: state.phase,
        kind: "roll",
        text: `d20 → ${die} vs ${result.threshold} (${reason}): ${
          result.critical === "success"
            ? "CRITICAL SUCCESS"
            : result.critical === "failure"
              ? "CRITICAL FAILURE"
              : result.success
                ? "success"
                : "failure"
        }`,
      },
    ],
  };
  return {
    ok: true,
    message: `Rolled ${die} (need ${result.threshold}+).`,
    state: next,
    data: { die, ...result, reason },
  };
}

export function toolUpdateIntegrity(
  state: GameState,
  amount: number,
  note: string
): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  const { ship, destroyed, abandonSuggested } = applyIntegrityDamage(
    state.ship,
    amount
  );
  let next: GameState = {
    ...state,
    ship: {
      ...ship,
      scars:
        amount > 0 && note
          ? [...ship.scars, note].slice(-12)
          : ship.scars,
    },
  };

  if (destroyed && next.mission) {
    next = {
      ...next,
      phase: "debrief",
      mission: { ...next.mission, status: "failed" },
      status: "completed",
      debrief: `Ship integrity collapsed to zero. ${note}`,
      pendingQuestion: "Mission failed. Review the debrief, then start a new mission when ready.",
      pendingChoices: [
        { id: 1, text: "New mission", risk: "low" },
        { id: 2, text: "Review ship status", risk: "low" },
      ],
    };
  }

  return {
    ok: true,
    message: `Integrity now ${next.ship!.integrity}/${next.ship!.maxIntegrity}.${
      abandonSuggested ? " Abandon ship should be considered." : ""
    }${destroyed ? " Mission failure." : ""}`,
    state: next,
    data: { destroyed, abandonSuggested, integrity: next.ship!.integrity },
  };
}

export function toolSetSystem(
  state: GameState,
  system: keyof ShipSystems,
  status: "ok" | "damaged" | "destroyed"
): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  const systems = setSystem(state.ship.systems, system, status);
  const scar =
    status === "destroyed"
      ? `${systemLabel(system)} destroyed`
      : status === "damaged"
        ? `${systemLabel(system)} damaged`
        : null;
  const ship = {
    ...state.ship,
    systems,
    scars: scar ? [...state.ship.scars, scar].slice(-12) : state.ship.scars,
  };
  return {
    ok: true,
    message: `${systemLabel(system)} is now ${status}.`,
    state: { ...state, ship },
  };
}

export function toolSetObjective(
  state: GameState,
  objectiveId: string,
  status: "active" | "completed" | "failed" | "missed"
): ToolResult {
  if (!state.mission) return { ok: false, message: "No active mission." };
  const objectives = state.mission.objectives.map((o) =>
    o.id === objectiveId ? { ...o, status } : o
  );
  return {
    ok: true,
    message: `Objective ${objectiveId} → ${status}.`,
    state: {
      ...state,
      mission: { ...state.mission, objectives },
    },
  };
}

export function toolSetFlag(state: GameState, flag: string): ToolResult {
  if (!state.mission) return { ok: false, message: "No active mission." };
  if (state.mission.flags.includes(flag)) {
    return { ok: true, message: `Flag already set: ${flag}`, state };
  }
  return {
    ok: true,
    message: `Flag set: ${flag}`,
    state: {
      ...state,
      mission: {
        ...state.mission,
        flags: [...state.mission.flags, flag],
      },
    },
  };
}

export function toolMissionStatus(state: GameState): ToolResult {
  if (!state.ship || !state.mission) {
    return { ok: false, message: "No active mission yet." };
  }
  const objs = state.mission.objectives
    .map((o) => `- [${o.status}] (${o.kind}) ${o.title}`)
    .join("\n");
  const text = [
    shipStatusSummary(state.ship),
    "",
    `Location: ${state.mission.location}`,
    `Mission: ${state.mission.title} (${state.mission.status})`,
    `Difficulty: ${state.difficulty}`,
    "",
    "Objectives:",
    objs,
    "",
    state.mission.knownIntel.length
      ? `Known intel:\n- ${state.mission.knownIntel.join("\n- ")}`
      : "Known intel: limited",
  ].join("\n");

  return { ok: true, message: text, data: { text } };
}

export function toolHint(state: GameState): ToolResult {
  if (!hintsAllowed(state.difficulty)) {
    return {
      ok: false,
      message: "Hints are unavailable on Hardcore difficulty.",
    };
  }
  const risky = state.turn?.options.find((o) => o.risk === "trap" || o.risk === "high");
  const safer = state.turn?.options.find((o) => o.risk === "low" || o.risk === "medium");
  const hint = safer
    ? `Consider option ${safer.id} carefully — it appears more measured. ${
        risky ? `Option ${risky.id} carries greater peril.` : ""
      }`
    : "Gather more sensor data before committing to irreversible action.";
  return { ok: true, message: hint };
}

export function toolRecap(state: GameState): ToolResult {
  const recent = state.log
    .filter((e) => e.kind === "narration" || e.kind === "player" || e.kind === "roll")
    .slice(-8)
    .map((e) => `• ${e.text}`)
    .join("\n");
  const text =
    recent ||
    "The voyage has only just begun. Your log is still waiting for its first entry.";
  return { ok: true, message: text };
}

export function changeDifficulty(
  state: GameState,
  difficulty: Difficulty
): ToolResult {
  return {
    ok: true,
    message: `Difficulty set to ${difficulty}.`,
    state: { ...state, difficulty },
  };
}
