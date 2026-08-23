/**
 * Tool registry — mechanical effects only.
 * Future: ImagineAgent / voice register here without changing GM core.
 */

import {
  applyCombatDamage,
  applyCrewDeath,
  applyCrewInjury,
  applyIntegrityDamage,
  applyReputation,
  canCrewDie,
  classifyDamageKind,
  computeShipSkills,
  divertPowerToShields,
  evaluateD20,
  hintsAllowed,
  normalizeCrewMember,
  normalizeShip,
  rollD20,
  setSystem,
  shipStatusSummary,
  systemLabel,
  tickCrewService,
  type DamageKind,
  type Difficulty,
  type Faction,
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
  note: string,
  kind?: DamageKind | string
): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  const damageKind: DamageKind =
    kind &&
    ["phaser", "laser", "torpedo", "collision", "boarding", "internal", "general"].includes(
      String(kind)
    )
      ? (kind as DamageKind)
      : classifyDamageKind(note);

  const combat = applyCombatDamage(state.ship, amount, damageKind);
  let ship = combat.ship;
  // Scars are lasting damage records only — never log the captain's order text.
  // System hits already add scars inside applyCombatDamage; add a structural scar
  // only for serious hull trauma or destruction.
  if (combat.hullDamage >= 15 || combat.destroyed) {
    const structural = combat.destroyed
      ? "Hull integrity lost — vessel combat-ineffective"
      : `Severe hull trauma (−${combat.hullDamage})`;
    // Avoid duplicate consecutive structural notes
    const last = ship.scars[ship.scars.length - 1];
    if (last !== structural) {
      ship = {
        ...ship,
        scars: [...ship.scars, structural].slice(-12),
      };
    }
  }

  let next: GameState = { ...state, ship };

  if (combat.destroyed && next.mission) {
    const objectives = next.mission.objectives.map((o) => {
      if (o.status !== "active") return o;
      return {
        ...o,
        status: o.kind === "main" ? ("failed" as const) : ("missed" as const),
      };
    });
    next = {
      ...next,
      phase: "debrief",
      mission: {
        ...next.mission,
        status: "failed",
        objectives,
      },
      status: "completed",
      debrief: `Hull integrity collapsed to zero. ${note}`,
      pendingQuestion:
        "=== Mission Failed ===\n\nHull integrity collapsed to zero. " +
        `${note}\n\nReview the debrief, then start a new mission when ready.`,
      pendingChoices: [
        { id: 1, text: "New mission", risk: "low" },
        { id: 2, text: "Review ship status", risk: "low" },
      ],
    };
  }

  const n = normalizeShip(next.ship!);
  const bits = [
    `Hull ${n.integrity}/${n.maxIntegrity}`,
    n.shieldGridOnline
      ? `Shields ${n.shieldIntegrity}/${n.maxShieldIntegrity}`
      : n.systems.shields === "destroyed"
        ? "Shields DESTROYED"
        : `Shields OFFLINE (recharge ${n.shieldRechargeTurns})`,
  ];
  if (combat.events.length) bits.push(...combat.events);
  if (combat.abandonSuggested) bits.push("Abandon ship should be considered.");
  if (combat.destroyed) bits.push("Mission failure.");

  return {
    ok: true,
    message: bits.join(" · "),
    state: next,
    data: {
      destroyed: combat.destroyed,
      abandonSuggested: combat.abandonSuggested,
      integrity: n.integrity,
      shieldIntegrity: n.shieldIntegrity,
      shieldGridOnline: n.shieldGridOnline,
      hullDamage: combat.hullDamage,
      shieldDamage: combat.shieldDamage,
      systemHit: combat.systemHit,
      damageKind,
      events: combat.events,
    },
  };
}

export function toolDivertPowerToShields(state: GameState): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  const result = divertPowerToShields(state.ship);
  return {
    ok: result.ok,
    message: result.message,
    state: { ...state, ship: result.ship },
    data: {
      shieldIntegrity: result.ship.shieldIntegrity,
      shieldGridOnline: result.ship.shieldGridOnline,
      shieldRechargeTurns: result.ship.shieldRechargeTurns,
    },
  };
}

export function toolSetSystem(
  state: GameState,
  system: keyof ShipSystems,
  status: "ok" | "damaged" | "destroyed"
): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  let ship = normalizeShip(state.ship);
  // Shield hardware only when grid is down / collapsing
  if (
    system === "shields" &&
    status !== "ok" &&
    ship.shieldGridOnline &&
    ship.shieldIntegrity > 0
  ) {
    return {
      ok: false,
      message:
        "Shield emitters are protected while the grid is still holding. They can only be damaged once shields fall.",
      state,
    };
  }
  const systems = setSystem(ship.systems, system, status);
  // Only record a scar when status worsens to damaged/destroyed (not repairs to ok)
  const scar =
    status === "destroyed"
      ? `${systemLabel(system)} destroyed`
      : status === "damaged"
        ? `${systemLabel(system)} damaged`
        : null;
  const already =
    scar &&
    ship.scars.some((s) => s.toLowerCase() === scar.toLowerCase());
  ship = {
    ...ship,
    systems,
    scars:
      scar && !already ? [...ship.scars, scar].slice(-12) : ship.scars,
  };
  if (system === "shields" && status === "destroyed") {
    ship = {
      ...ship,
      shieldIntegrity: 0,
      shieldGridOnline: false,
      shieldRechargeTurns: 0,
    };
  }
  if (system === "shields" && status === "ok" && !ship.shieldGridOnline) {
    // Repair restores grid online with partial charge
    ship = {
      ...ship,
      shieldGridOnline: true,
      shieldRechargeTurns: 0,
      shieldIntegrity: Math.max(ship.shieldIntegrity, 25),
    };
  }
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

export function toolApplyCrewDeath(
  state: GameState,
  memberId: string,
  cause: string
): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  const ship = normalizeShip(state.ship);
  const roster = ship.crew || [];
  const target = roster.find((c) => c.id === memberId);
  if (!target) {
    return { ok: false, message: "Crew member not found.", state };
  }
  if (target.status === "dead") {
    return { ok: false, message: "Crew member not found or already dead.", state };
  }

  const living = roster.filter(
    (c) => c.status !== "dead" && c.status !== "transferred"
  );
  const isLastLiving = living.length <= 1;
  if (isLastLiving) {
    if ((target.status || "active") === "active") {
      const inj = toolSetCrewStatus(
        state,
        memberId,
        "injured",
        cause || "combat trauma"
      );
      return {
        ...inj,
        ok: true,
        message: `${target.name} is critically injured — the last officer on the roster cannot be lost.`,
        data: { ...(inj.data || {}), lastOfficerProtected: true, memberId },
      };
    }
    return {
      ok: false,
      message: "Cannot lose the last remaining officer.",
      state,
    };
  }

  const { crew, dead, skillDelta } = applyCrewDeath(roster, memberId, cause);
  if (!dead) {
    return { ok: false, message: "Crew member not found or already dead.", state };
  }
  const skills = computeShipSkills({ ...ship, crew }, crew);
  const scar = `${dead.name} (${dead.role}) — KIA: ${cause}`;
  const nextShip = {
    ...ship,
    crew,
    skills,
    scars: [...ship.scars, scar].slice(-12),
  };
  let mission = state.mission;
  if (mission) {
    const flag = `crew_loss_${String(dead.role || "officer")
      .toLowerCase()
      .replace(/\s+/g, "_")}`;
    mission = {
      ...mission,
      flags: mission.flags.includes(flag)
        ? mission.flags
        : [...mission.flags, flag, "crew_casualty"],
    };
  }
  return {
    ok: true,
    message: `${dead.name} has been killed in action (${cause}).`,
    state: { ...state, ship: nextShip, mission },
    data: {
      memberId,
      name: dead.name,
      role: dead.role,
      cause,
      skillDelta,
    },
  };
}

export function toolSetCrewStatus(
  state: GameState,
  memberId: string,
  status: "active" | "injured" | "dead" | "transferred",
  cause?: string
): ToolResult {
  if (!state.ship) return { ok: false, message: "No ship selected." };
  if (status === "dead") {
    return toolApplyCrewDeath(state, memberId, cause || "combat trauma");
  }
  let ship = normalizeShip(state.ship);
  let crew = (ship.crew || []).map((c) => normalizeCrewMember(c, ship.stardate));
  if (status === "injured") {
    crew = applyCrewInjury(crew, memberId, 2);
  } else {
    crew = crew.map((c) =>
      c.id === memberId
        ? {
            ...c,
            status,
            injuryTurnsRemaining: undefined,
            deathCause: status === "transferred" ? c.deathCause : undefined,
          }
        : c
    );
  }
  const skills = computeShipSkills({ ...ship, crew }, crew);
  ship = { ...ship, crew, skills };
  return {
    ok: true,
    message: `Crew ${memberId} → ${status}.`,
    state: { ...state, ship },
  };
}

export function toolUpdateReputation(
  state: GameState,
  deltas: Partial<Record<Faction, number>>
): ToolResult {
  if (!state.universe) {
    return { ok: false, message: "No universe state on this run.", state };
  }
  // Clamp proposed deltas
  const clamped: Partial<Record<Faction, number>> = {};
  for (const [k, v] of Object.entries(deltas || {})) {
    if (typeof v === "number") {
      clamped[k as Faction] = Math.max(-15, Math.min(15, Math.round(v)));
    }
  }
  const universe = applyReputation(state.universe, clamped);
  return {
    ok: true,
    message: `Reputation updated: ${JSON.stringify(clamped)}`,
    state: { ...state, universe },
    data: { deltas: clamped, factionReputation: universe.factionReputation },
  };
}

export function toolTickCrewService(state: GameState): ToolResult {
  if (!state.ship) return { ok: true, message: "No ship.", state };
  const ship = normalizeShip(state.ship);
  const crew = tickCrewService(ship.crew || []);
  const skills = computeShipSkills({ ...ship, crew }, crew);
  return {
    ok: true,
    message: "Crew service clocks advanced.",
    state: { ...state, ship: { ...ship, crew, skills } },
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
