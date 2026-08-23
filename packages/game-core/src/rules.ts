import {
  DICE_THRESHOLDS,
  type DamageKind,
  type Difficulty,
  type Ship,
  type ShipSystems,
  type SystemStatus,
} from "./types.js";

export function successThreshold(
  difficulty: Difficulty,
  actionModifier = 0
): number {
  return Math.min(20, Math.max(2, DICE_THRESHOLDS[difficulty] + actionModifier));
}

export function evaluateD20(
  roll: number,
  difficulty: Difficulty,
  actionModifier = 0
): {
  success: boolean;
  critical: "none" | "success" | "failure";
  threshold: number;
} {
  const threshold = successThreshold(difficulty, actionModifier);
  const critFailMax = difficulty === "hardcore" ? 3 : 1;

  if (roll === 20) {
    return { success: true, critical: "success", threshold };
  }
  if (roll <= critFailMax) {
    return { success: false, critical: "failure", threshold };
  }
  return {
    success: roll >= threshold,
    critical: "none",
    threshold,
  };
}

export function rollD20(rng: () => number = Math.random): number {
  return Math.floor(rng() * 20) + 1;
}

export function clampIntegrity(value: number, max = 100): number {
  return Math.max(0, Math.min(max, value));
}

/**
 * Normalize a Starfleet registry string to "NCC-#####" / "NX-##" form.
 * Pulls a number from free text when possible.
 */
export function normalizeRegistryNumber(
  raw: string | undefined | null,
  fallbackSeed = 0
): string {
  const s = String(raw || "").trim().toUpperCase();
  // Already prefixed
  const prefixed = s.match(/\b(NCC|NX|NAR|NAR)[-\s]?(\d{1,6}(?:-\w)?)\b/);
  if (prefixed) {
    const prefix = prefixed[1] === "NAR" ? "NAR" : prefixed[1];
    return `${prefix}-${prefixed[2].replace(/\s+/g, "")}`;
  }
  // Bare digits
  const digits = s.match(/\b(\d{2,6})\b/);
  if (digits) return `NCC-${digits[1]}`;
  // Deterministic fallback from seed
  const n = 10000 + (Math.abs(fallbackSeed) % 80000);
  return `NCC-${n}`;
}

/** Ensure shield fields + registry exist on older saves */
export function normalizeShip(ship: Ship): Ship {
  const maxHull = ship.maxIntegrity ?? 100;
  const hull = clampIntegrity(
    typeof ship.integrity === "number" ? ship.integrity : maxHull,
    maxHull
  );
  // Prefer explicit registry; else parse from name ("USS Foo NCC-1234")
  const fromName = String(ship.name || "").match(
    /\b((?:NCC|NX)[-\s]?\d{1,6}(?:-\w)?)\b/i
  );
  const registryNumber = normalizeRegistryNumber(
    ship.registryNumber || fromName?.[1],
    // stable-ish seed from name
    [...String(ship.name || ship.id || "ship")].reduce(
      (a, c) => a + c.charCodeAt(0),
      0
    )
  );
  const maxShield =
    typeof ship.maxShieldIntegrity === "number" && ship.maxShieldIntegrity > 0
      ? ship.maxShieldIntegrity
      : maxHull;
  let shield =
    typeof ship.shieldIntegrity === "number" ? ship.shieldIntegrity : maxShield;
  shield = clampIntegrity(shield, maxShield);

  const systems = { ...ship.systems };
  // If shield hardware destroyed, grid cannot hold charge
  if (systems.shields === "destroyed") {
    shield = 0;
  }

  let shieldGridOnline =
    typeof ship.shieldGridOnline === "boolean"
      ? ship.shieldGridOnline
      : shield > 0 && systems.shields !== "destroyed";
  let shieldRechargeTurns =
    typeof ship.shieldRechargeTurns === "number"
      ? Math.max(0, ship.shieldRechargeTurns)
      : 0;

  if (systems.shields === "destroyed") {
    shieldGridOnline = false;
    shieldRechargeTurns = 0;
    shield = 0;
  } else if (shield <= 0 && shieldGridOnline) {
    // Collapsed but still marked online — start recharge
    shieldGridOnline = false;
    if (shieldRechargeTurns <= 0) shieldRechargeTurns = 2;
  }

  return {
    ...ship,
    registryNumber,
    integrity: hull,
    maxIntegrity: maxHull,
    shieldIntegrity: shield,
    maxShieldIntegrity: maxShield,
    shieldGridOnline,
    shieldRechargeTurns,
    systems,
    scars: Array.isArray(ship.scars) ? ship.scars : [],
  };
}

/**
 * Infer damage type from the player's order / scene text.
 * Phasers/lasers stress shields hard; torpedoes & collisions prefer kinetic vs hull
 * when shields are weak.
 */
export function classifyDamageKind(text: string): DamageKind {
  const t = String(text || "").toLowerCase();
  // Only true internal/boarding bypasses the grid — do NOT match generic "fire"
  if (
    /\b(board(ing)?|boarding party|intruder|hand-?to-?hand|melee|sabotage|internal explosion|core overload|plasma conduit|breach from inside|transporter room fight)\b/.test(
      t
    )
  ) {
    return /\b(board|intruder|hand|melee|transporter room)\b/.test(t)
      ? "boarding"
      : "internal";
  }
  if (/torpedo|photon|quantum|missile|warhead/.test(t)) return "torpedo";
  if (/ram|collision|collide|asteroid|debris|impact|crash|docking/.test(t)) {
    return "collision";
  }
  if (/phaser|beam|disruptor|energy weapon|pulse cannon/.test(t)) return "phaser";
  if (/laser|cutting beam|mining laser/.test(t)) return "laser";
  if (/weapon|barrage|volley|attack|combat|skirmish|raid|exchange|under fire|return fire/.test(t)) {
    return "general";
  }
  // Default combat setbacks still hit the shield grid first
  return "general";
}

type DamageProfile = {
  /** Multiplier applied to damage taken by the shield grid */
  shieldMult: number;
  /**
   * Max hull bleed-through fraction when shields are nearly gone.
   * Full shields ≈ almost no hull damage; empty shields ≈ this value as overflow risk.
   */
  maxBleed: number;
  /** Bypass shields entirely */
  bypassShields: boolean;
};

function damageProfile(kind: DamageKind): DamageProfile {
  switch (kind) {
    case "phaser":
    case "laser":
      // Energy weapons hammer the grid; little hull until shields fail
      return { shieldMult: 1.4, maxBleed: 0.25, bypassShields: false };
    case "torpedo":
      // Shields are good vs warheads — less grid drain, low bleed
      return { shieldMult: 0.75, maxBleed: 0.12, bypassShields: false };
    case "collision":
      return { shieldMult: 0.7, maxBleed: 0.18, bypassShields: false };
    case "boarding":
    case "internal":
      return { shieldMult: 0, maxBleed: 1, bypassShields: true };
    default:
      return { shieldMult: 1.1, maxBleed: 0.2, bypassShields: false };
  }
}

export type CombatDamageResult = {
  ship: Ship;
  destroyed: boolean;
  abandonSuggested: boolean;
  hullDamage: number;
  shieldDamage: number;
  shieldsCollapsed: boolean;
  systemHit: { key: keyof ShipSystems; from: SystemStatus; to: SystemStatus } | null;
  events: string[];
};

/**
 * Apply combat damage through shields then hull, with system damage rolls.
 * Shield hardware can only be damaged/destroyed when the grid is down or
 * collapses on this hit.
 */
export function applyCombatDamage(
  rawShip: Ship,
  amount: number,
  kind: DamageKind = "general",
  rng: () => number = Math.random
): CombatDamageResult {
  let ship = normalizeShip(rawShip);
  const events: string[] = [];
  const profile = damageProfile(kind);
  const incoming = Math.max(0, Math.round(amount));

  let hullDamage = 0;
  let shieldDamage = 0;
  let shieldsCollapsed = false;
  const shieldBefore = ship.shieldIntegrity;
  const shieldsWereUp =
    ship.shieldGridOnline &&
    ship.shieldIntegrity > 0 &&
    ship.systems.shields !== "destroyed" &&
    !profile.bypassShields;

  if (incoming <= 0) {
    return {
      ship,
      destroyed: ship.integrity <= 0,
      abandonSuggested: ship.integrity > 0 && ship.integrity <= 15,
      hullDamage: 0,
      shieldDamage: 0,
      shieldsCollapsed: false,
      systemHit: null,
      events,
    };
  }

  if (shieldsWereUp) {
    // --- Shields first ---
    // Almost all external damage hits the grid. Hull only takes:
    //   1) small bleed-through that grows as shields weaken, and
    //   2) overflow when this hit collapses the grid.
    const shieldPct = ship.shieldIntegrity / Math.max(1, ship.maxShieldIntegrity);
    // Full shields: ~0–5% bleed. At 0%: up to maxBleed. No free hull damage at 100%.
    const bleedRatio =
      shieldPct >= 0.99
        ? 0
        : Math.min(profile.maxBleed, profile.maxBleed * (1 - shieldPct) * (1 - shieldPct));

    const rawToShields = Math.max(
      1,
      Math.round(incoming * profile.shieldMult * (1 - bleedRatio * 0.5))
    );
    const newShield = clampIntegrity(
      ship.shieldIntegrity - rawToShields,
      ship.maxShieldIntegrity
    );
    shieldDamage = ship.shieldIntegrity - newShield;
    ship = { ...ship, shieldIntegrity: newShield };

    let bleed = Math.round(incoming * bleedRatio);
    let overflow = 0;
    if (newShield <= 0) {
      // Anything the grid couldn't absorb spills to hull
      overflow = Math.max(0, rawToShields - shieldBefore);
      shieldsCollapsed = true;
      ship = {
        ...ship,
        shieldIntegrity: 0,
        shieldGridOnline: false,
        shieldRechargeTurns: Math.max(
          ship.shieldRechargeTurns,
          2 + (rng() < 0.4 ? 1 : 0)
        ),
      };
      events.push(
        `Shield grid collapsed — recharging (${ship.shieldRechargeTurns} turns).`
      );
    }

    hullDamage = bleed + overflow;
    if (shieldDamage > 0) {
      events.push(`Shields −${shieldDamage} → ${ship.shieldIntegrity}/${ship.maxShieldIntegrity}.`);
    }
    if (hullDamage > 0 && !shieldsCollapsed) {
      events.push(`Bleed-through to hull −${hullDamage}.`);
    } else if (overflow > 0) {
      events.push(`Shield overflow to hull −${hullDamage}.`);
    }
  } else {
    hullDamage = incoming;
    if (!profile.bypassShields && !ship.shieldGridOnline) {
      events.push("Shields offline — full impact on the hull.");
    } else if (profile.bypassShields) {
      events.push("Internal/boarding damage bypassed the shield grid.");
    }
  }

  if (hullDamage > 0) {
    const newHull = clampIntegrity(
      ship.integrity - hullDamage,
      ship.maxIntegrity
    );
    hullDamage = ship.integrity - newHull;
    ship = { ...ship, integrity: newHull };
  }

  // System damage roll — worse when hull takes a hard hit and shields are weak/down
  let systemHit: CombatDamageResult["systemHit"] = null;
  const shieldFrac =
    ship.maxShieldIntegrity > 0
      ? ship.shieldIntegrity / ship.maxShieldIntegrity
      : 0;
  const systemChance =
    0.08 +
    hullDamage * 0.028 +
    (shieldsWereUp ? (1 - shieldFrac) * 0.12 : 0.22) +
    (shieldsCollapsed ? 0.15 : 0);

  if (hullDamage >= 4 && rng() < Math.min(0.78, systemChance)) {
    const hit = rollSystemDamage(
      ship,
      shieldsCollapsed || shieldBefore <= 0,
      rng
    );
    systemHit = hit;
    if (hit) {
      // One scar per real system wound (not every combat tick)
      const scarNote =
        hit.to === "destroyed"
          ? `${systemLabel(hit.key)} destroyed in combat`
          : `${systemLabel(hit.key)} damaged in combat`;
      const already = ship.scars.some(
        (s) =>
          s.toLowerCase().includes(systemLabel(hit.key).toLowerCase()) &&
          s.toLowerCase().includes(hit.to)
      );
      ship = {
        ...ship,
        systems: setSystem(ship.systems, hit.key, hit.to),
        scars: already ? ship.scars : [...ship.scars, scarNote].slice(-12),
      };
      // Destroyed shield hardware wipes residual charge
      if (hit.key === "shields" && hit.to === "destroyed") {
        ship = {
          ...ship,
          shieldIntegrity: 0,
          shieldGridOnline: false,
          shieldRechargeTurns: 0,
        };
      }
      events.push(`${systemLabel(hit.key)} ${hit.from} → ${hit.to}.`);
    }
  }

  // Damaged shield emitters: slow passive drain when online
  if (
    ship.systems.shields === "damaged" &&
    ship.shieldGridOnline &&
    ship.shieldIntegrity > 0 &&
    rng() < 0.35
  ) {
    const drip = 2 + Math.floor(rng() * 4);
    ship = {
      ...ship,
      shieldIntegrity: clampIntegrity(
        ship.shieldIntegrity - drip,
        ship.maxShieldIntegrity
      ),
    };
    if (ship.shieldIntegrity <= 0) {
      ship = {
        ...ship,
        shieldGridOnline: false,
        shieldRechargeTurns: Math.max(ship.shieldRechargeTurns, 2),
      };
      events.push("Damaged shield emitters failed — grid offline.");
    }
  }

  return {
    ship,
    destroyed: ship.integrity <= 0,
    abandonSuggested: ship.integrity > 0 && ship.integrity <= 15,
    hullDamage,
    shieldDamage,
    shieldsCollapsed,
    systemHit,
    events,
  };
}

/**
 * Shield system may only be hit when grid is down / collapsing.
 * Other systems: prefer ones still ok, then escalate damaged → destroyed.
 */
function rollSystemDamage(
  ship: Ship,
  allowShieldHardware: boolean,
  rng: () => number
): CombatDamageResult["systemHit"] {
  const keys = (
    Object.keys(ship.systems) as (keyof ShipSystems)[]
  ).filter((k) => {
    if (ship.systems[k] === "destroyed") return false;
    if (k === "shields" && !allowShieldHardware) return false;
    return true;
  });
  if (!keys.length) return null;

  // Weight life support / warp slightly lower unless heavy damage
  const pick = keys[Math.floor(rng() * keys.length)];
  const from = ship.systems[pick];
  let to: SystemStatus = "damaged";
  if (from === "damaged") {
    // Second hit often finishes the system
    to = rng() < 0.55 ? "destroyed" : "damaged";
    if (to === "damaged") return null; // no change
  } else if (from === "ok") {
    // Rare instant destroy on brutal hits
    to = rng() < 0.12 ? "destroyed" : "damaged";
  }
  return { key: pick, from, to };
}

/** Advance shield recharge at the start of a play beat */
export function tickShieldRecharge(rawShip: Ship): {
  ship: Ship;
  restored: boolean;
  note: string | null;
} {
  let ship = normalizeShip(rawShip);
  if (ship.systems.shields === "destroyed") {
    return {
      ship: {
        ...ship,
        shieldIntegrity: 0,
        shieldGridOnline: false,
        shieldRechargeTurns: 0,
      },
      restored: false,
      note: null,
    };
  }
  if (ship.shieldGridOnline) {
    // Very slow passive recharge while online — must not erase combat drain
    if (ship.shieldIntegrity < ship.maxShieldIntegrity) {
      const rate = ship.systems.shields === "damaged" ? 1 : 2;
      ship = {
        ...ship,
        shieldIntegrity: clampIntegrity(
          ship.shieldIntegrity + rate,
          ship.maxShieldIntegrity
        ),
      };
    }
    return { ship, restored: false, note: null };
  }

  // Offline — count down
  if (ship.shieldRechargeTurns > 0) {
    const left = ship.shieldRechargeTurns - 1;
    if (left <= 0) {
      const restore = ship.systems.shields === "damaged" ? 18 : 30;
      ship = {
        ...ship,
        shieldRechargeTurns: 0,
        shieldGridOnline: true,
        shieldIntegrity: clampIntegrity(restore, ship.maxShieldIntegrity),
      };
      return {
        ship,
        restored: true,
        note: `Shield grid back online at ${ship.shieldIntegrity}% capacity.`,
      };
    }
    ship = { ...ship, shieldRechargeTurns: left };
    return {
      ship,
      restored: false,
      note: `Shield grid recharging… ${left} turn${left === 1 ? "" : "s"} remaining.`,
    };
  }

  // Offline with 0 turns but still empty — restore
  const restore = ship.systems.shields === "damaged" ? 18 : 30;
  ship = {
    ...ship,
    shieldGridOnline: true,
    shieldIntegrity: clampIntegrity(
      Math.max(ship.shieldIntegrity, restore),
      ship.maxShieldIntegrity
    ),
  };
  return {
    ship,
    restored: true,
    note: `Shield grid back online at ${ship.shieldIntegrity}% capacity.`,
  };
}

/** Divert power to shields (player order or meta). */
export function divertPowerToShields(rawShip: Ship): {
  ship: Ship;
  ok: boolean;
  message: string;
} {
  let ship = normalizeShip(rawShip);
  if (ship.systems.shields === "destroyed") {
    return {
      ship,
      ok: false,
      message: "Shield emitters are destroyed — cannot divert power to the grid.",
    };
  }
  if (!ship.shieldGridOnline) {
    // Speed up recharge by one turn and add a little juice when it comes up
    const left = Math.max(0, ship.shieldRechargeTurns - 1);
    if (left <= 0) {
      const restore = ship.systems.shields === "damaged" ? 22 : 35;
      ship = {
        ...ship,
        shieldRechargeTurns: 0,
        shieldGridOnline: true,
        shieldIntegrity: clampIntegrity(restore, ship.maxShieldIntegrity),
      };
      return {
        ship,
        ok: true,
        message: `Emergency power forces the shield grid online at ${ship.shieldIntegrity}%.`,
      };
    }
    ship = { ...ship, shieldRechargeTurns: left };
    return {
      ship,
      ok: true,
      message: `Power diverted to shield restart — ${left} turn${left === 1 ? "" : "s"} until grid online.`,
    };
  }
  const boost = ship.systems.shields === "damaged" ? 12 : 20;
  const before = ship.shieldIntegrity;
  ship = {
    ...ship,
    shieldIntegrity: clampIntegrity(
      ship.shieldIntegrity + boost,
      ship.maxShieldIntegrity
    ),
  };
  const gained = ship.shieldIntegrity - before;
  return {
    ship,
    ok: true,
    message:
      gained > 0
        ? `Power diverted to shields (+${gained} to ${ship.shieldIntegrity}/${ship.maxShieldIntegrity}).`
        : "Shields already at maximum capacity.",
  };
}

/** Legacy helper — applies general hull-focused damage through combat pipeline */
export function applyIntegrityDamage(
  ship: Ship,
  amount: number
): { ship: Ship; destroyed: boolean; abandonSuggested: boolean } {
  const result = applyCombatDamage(ship, amount, "general");
  return {
    ship: result.ship,
    destroyed: result.destroyed,
    abandonSuggested: result.abandonSuggested,
  };
}

export function setSystem(
  systems: ShipSystems,
  key: keyof ShipSystems,
  status: SystemStatus
): ShipSystems {
  return { ...systems, [key]: status };
}

export function systemLabel(key: keyof ShipSystems): string {
  const labels: Record<keyof ShipSystems, string> = {
    shields: "Shield array",
    torpedoes: "Photon torpedo launcher",
    warp: "Warp nacelles",
    communications: "Communications",
    sensors: "Sensors",
    lifeSupport: "Life support",
  };
  return labels[key];
}

/** Systems required (keywords) for certain orders */
export function systemsRequiredForAction(
  text: string
): (keyof ShipSystems)[] {
  const t = String(text || "").toLowerCase();
  const need: (keyof ShipSystems)[] = [];
  if (/warp|flee|outrun|high warp|emergency jump|escape velocity/.test(t)) {
    need.push("warp");
  }
  if (/torpedo|photon|quantum salvo|spread pattern/.test(t)) {
    need.push("torpedoes");
  }
  if (/phaser|beam|target lock|fire weapons|weapons free/.test(t)) {
    // weapons use torpedoes system as stand-in for weapons bank health
    // plus sensors for lock
    if (/torpedo/.test(t)) need.push("torpedoes");
    need.push("sensors");
  }
  if (/scan|sensor|probe|analyze|long.?range|detect/.test(t)) {
    need.push("sensors");
  }
  if (/hail|comm|negotiate|open a channel|transmit|distress/.test(t)) {
    need.push("communications");
  }
  if (/shield|raise shields|reinforce deflector|divert.*shield/.test(t)) {
    need.push("shields");
  }
  return [...new Set(need)];
}

export type SystemConstraint = {
  key: keyof ShipSystems;
  status: SystemStatus;
  severity: "blocked" | "impaired";
  note: string;
};

export function evaluateSystemConstraints(
  text: string,
  systems: ShipSystems
): SystemConstraint[] {
  const required = systemsRequiredForAction(text);
  const out: SystemConstraint[] = [];
  for (const key of required) {
    const status = systems[key];
    if (status === "destroyed") {
      out.push({
        key,
        status,
        severity: "blocked",
        note: `${systemLabel(key)} is offline (destroyed) — this order cannot be executed as written.`,
      });
    } else if (status === "damaged") {
      out.push({
        key,
        status,
        severity: "impaired",
        note: `${systemLabel(key)} is damaged — success is harder and failure more costly.`,
      });
    }
  }
  return out;
}

export function shipSystemsBrief(ship: Ship): string {
  const s = normalizeShip(ship);
  return (Object.entries(s.systems) as [keyof ShipSystems, SystemStatus][])
    .map(([k, v]) => `${systemLabel(k)}: ${v}`)
    .join("; ");
}

export function shipStatusSummary(ship: Ship): string {
  const s = normalizeShip(ship);
  const damaged = (
    Object.entries(s.systems) as [keyof ShipSystems, SystemStatus][]
  )
    .filter(([, st]) => st !== "ok")
    .map(([k, st]) => `${systemLabel(k)}: ${st}`)
    .join("; ");

  const shieldLine = s.shieldGridOnline
    ? `Shields: ${s.shieldIntegrity}/${s.maxShieldIntegrity} (online)`
    : s.systems.shields === "destroyed"
      ? "Shields: DESTROYED"
      : `Shields: OFFLINE — recharging (${s.shieldRechargeTurns} turn${
          s.shieldRechargeTurns === 1 ? "" : "s"
        })`;

  return [
    `${s.name} ${s.registryNumber} (${s.className}) — Stardate ${s.stardate}`,
    `Hull: ${s.integrity}/${s.maxIntegrity}`,
    shieldLine,
    damaged ? `Damage: ${damaged}` : "Systems: all nominal",
    s.scars.length ? `Scars: ${s.scars.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function hintsAllowed(difficulty: Difficulty | null): boolean {
  return difficulty !== "hardcore";
}

export function metaCommandList(difficulty: Difficulty | null): string[] {
  const base = [
    "mission status",
    "recap",
    "divert power to shields",
    "change difficulty",
    "restart",
    "new mission",
    "enemy status",
  ];
  if (hintsAllowed(difficulty)) base.splice(1, 0, "hint");
  return base;
}

/**
 * Phase 0.2 campaign helpers live in `campaign.ts` so this file’s combat,
 * dice, shields, and system logic stay untouched. Do not add stubs here —
 * `index.ts` already re-exports both modules and duplicate names would clash.
 *
 *   computeShipSkills(ship, crew) → ShipSkills
 *   applySkillXp(skills, gains, amount) → SkillVector
 *   skillModifierForAction(skills, actionText, risk) → number
 *   canCrewDie(event, rng) → boolean
 *   applyCrewDeath(crew, memberId, cause) → { crew, skillDelta, dead }
 *   tickUniverse(universe, playTurnsSinceLast, flags, rng) → UniverseState
 *   reputationDeltaFromFlags(flags, outcome) → Partial<Record<Faction, number>>
 */
