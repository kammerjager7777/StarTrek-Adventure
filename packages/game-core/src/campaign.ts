/**
 * Campaign layer pure rules — skills, crew lifecycle, universe ticks.
 * No I/O. Code is the referee; LLM never invents these numbers.
 *
 * Phase 0 factories (types live in types.ts):
 *   emptySkillVector, emptyUniverse, normalizeCrewMember,
 *   computeShipSkills, createCampaignProfile
 */

import type {
  CampaignLogEntry,
  CampaignProfile,
  CrewMember,
  CrewStatus,
  Faction,
  Mission,
  MissionType,
  OptionRisk,
  RecruitQuality,
  Ship,
  ShipSkills,
  SkillDimension,
  SkillVector,
  StarbaseSession,
  StationClass,
  SystemStatus,
  UniverseState,
} from "./types.js";
import { normalizeShip, systemLabel } from "./rules.js";
import { interpretCaptainName } from "./names.js";

export const SKILL_DIMENSIONS: SkillDimension[] = [
  "tactical",
  "science",
  "diplomacy",
  "piloting",
  "engineering",
  "medical",
  "command",
];

export const FACTIONS: Faction[] = [
  "federation",
  "klingon",
  "romulan",
  "cardassian",
  "borg",
  "independent",
  "other",
];

export function emptySkillVector(fill = 0): SkillVector {
  return {
    tactical: fill,
    science: fill,
    diplomacy: fill,
    piloting: fill,
    engineering: fill,
    medical: fill,
    command: fill,
  };
}

export function clampSkill(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function mergeSkillPartial(
  base: SkillVector,
  gains: Partial<SkillVector> | undefined
): SkillVector {
  const out = { ...base };
  if (!gains) return out;
  for (const k of SKILL_DIMENSIONS) {
    if (typeof gains[k] === "number") {
      out[k] = clampSkill(out[k] + (gains[k] as number));
    }
  }
  return out;
}

export function applySkillXp(
  skills: SkillVector,
  gains: Partial<SkillVector>,
  amount = 1
): SkillVector {
  const scaled: Partial<SkillVector> = {};
  for (const k of SKILL_DIMENSIONS) {
    if (typeof gains[k] === "number") {
      scaled[k] = (gains[k] as number) * amount;
    }
  }
  return mergeSkillPartial(skills, scaled);
}

/** Role-based starting skills for a new officer */
export function baselineSkillsForRole(role: string): SkillVector {
  const r = String(role || "").toLowerCase();
  const s = emptySkillVector(28);
  s.command = 30;
  if (/tactical|security|weapons|phaser|gunnery/.test(r)) {
    s.tactical = 55;
    s.piloting = 35;
    s.command = 40;
  } else if (/science|astro|sensor|research/.test(r)) {
    s.science = 55;
    s.engineering = 35;
    s.medical = 30;
  } else if (/medical|doctor|nurse|counsel/.test(r)) {
    s.medical = 58;
    s.science = 38;
    s.diplomacy = 35;
  } else if (/engineer|ops|operations|transporter/.test(r)) {
    s.engineering = 55;
    s.science = 35;
    s.tactical = 30;
  } else if (/helm|conn|pilot|navigator|flight/.test(r)) {
    s.piloting = 55;
    s.tactical = 40;
    s.engineering = 30;
  } else if (/comm|diplomat|first officer|xo|captain|command/.test(r)) {
    s.command = 52;
    s.diplomacy = 50;
    s.tactical = 35;
  } else {
    s.command = 40;
    s.diplomacy = 35;
  }
  return s;
}

/** Ship class/era baseline (rough) */
export function baselineShipSkills(className: string, era: string): SkillVector {
  const c = String(className || "").toLowerCase();
  const e = String(era || "").toLowerCase();
  const s = emptySkillVector(32);
  if (/defiant|akira|prometheus|sovereign|galaxy|nebula/.test(c)) {
    s.tactical = 42;
    s.engineering = 40;
  }
  if (/intrepid|nova|oberth|science/.test(c)) {
    s.science = 45;
    s.engineering = 38;
  }
  if (/ambassador|excelsior|constitution|nx/.test(c)) {
    s.command = 40;
    s.diplomacy = 38;
  }
  if (/22nd|nx-01|enterprise nx/.test(e) || /22/.test(e)) {
    // Earlier tech — slightly lower baselines
    for (const k of SKILL_DIMENSIONS) s[k] = clampSkill(s[k] - 4);
  }
  if (/25th|32nd/.test(e)) {
    for (const k of SKILL_DIMENSIONS) s[k] = clampSkill(s[k] + 3);
  }
  return s;
}

/** True when this roster slot is the commanding captain — that seat is the player. */
export function isCommandingCaptainRole(role: string): boolean {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return false;
  if (/engineer|security|of\s/.test(r)) return false;
  return /^(the\s+)?(captain|co|c\.o\.|commanding officer|commanding|cmdg\.?\s*officer)$/i.test(
    r
  );
}

export function stripOfficerRankPrefix(name: string): string {
  return String(name || "")
    .replace(
      /^(captain|cmdr\.?|commander|lt\.?\s*cmdr\.?|lt\.?\s*j\.g\.?|lieutenant|ensign|ens\.?)\s+/i,
      ""
    )
    .trim();
}

/**
 * The player occupies the captain's chair. NPC "Captain" slots become XO
 * (or Command Officer if an XO already exists). Rank "Captain" is demoted.
 */
export function sanitizeBridgeCrew(crew: CrewMember[]): CrewMember[] {
  const list = (crew || []).map((c) => {
    const name = stripOfficerRankPrefix(c.name) || c.name;
    const rank = /captain/i.test(String(c.rank || "")) ? "Cmdr." : c.rank;
    return { ...c, name, rank };
  });
  let hasXo = list.some((c) =>
    /first officer|\bxo\b|executive/i.test(String(c.role || ""))
  );
  return list.map((c) => {
    if (!isCommandingCaptainRole(c.role || "")) return c;
    if (!hasXo) {
      hasXo = true;
      return { ...c, role: "First Officer" };
    }
    return { ...c, role: "Command Officer" };
  });
}

export function normalizeCrewMember(
  c: CrewMember,
  stardate = "00000.0"
): CrewMember {
  const status: CrewStatus = c.status || "active";
  return {
    ...c,
    skills: { ...baselineSkillsForRole(c.role), ...(c.skills || {}) },
    serviceTurns: typeof c.serviceTurns === "number" ? c.serviceTurns : 0,
    missionsServed: typeof c.missionsServed === "number" ? c.missionsServed : 0,
    loyalty:
      typeof c.loyalty === "number" ? Math.max(0, Math.min(100, c.loyalty)) : 55,
    status,
    joinedStardate: c.joinedStardate || stardate,
    injuryTurnsRemaining:
      status === "injured"
        ? Math.max(0, c.injuryTurnsRemaining ?? 2)
        : undefined,
  };
}

export function computeShipSkills(
  ship: Ship | null | undefined,
  crew?: CrewMember[] | null
): ShipSkills {
  const s = ship ? normalizeShip(ship) : null;
  const base = baselineShipSkills(s?.className || "", s?.era || "");
  const list = sanitizeBridgeCrew(crew || s?.crew || []).map((c) =>
    normalizeCrewMember(c, s?.stardate)
  );
  const fromCrew = emptySkillVector(0);
  for (const c of list) {
    if (c.status && c.status !== "active") continue;
    const sk = c.skills || baselineSkillsForRole(c.role);
    for (const k of SKILL_DIMENSIONS) {
      // Each officer contributes a fraction of their skill
      fromCrew[k] += Math.round((sk[k] || 0) * 0.12);
    }
  }
  for (const k of SKILL_DIMENSIONS) {
    fromCrew[k] = clampSkill(fromCrew[k]);
  }
  const total = emptySkillVector(0);
  for (const k of SKILL_DIMENSIONS) {
    total[k] = clampSkill(base[k] + fromCrew[k]);
  }
  return { base, fromCrew, total };
}

/**
 * Skill → dice actionModifier (negative = easier for player).
 * Destroyed systems still block via evaluateSystemConstraints.
 */
export function skillModifierForAction(
  skills: SkillVector | ShipSkills | null | undefined,
  actionText: string,
  risk: OptionRisk | string = "medium"
): number {
  const total: SkillVector =
    skills && "total" in skills
      ? (skills as ShipSkills).total
      : (skills as SkillVector) || emptySkillVector(30);
  const t = String(actionText || "").toLowerCase();
  let dim: SkillDimension = "command";
  if (/phaser|torpedo|weapon|fire|tactical|target|combat|board/.test(t)) {
    dim = "tactical";
  } else if (/scan|sensor|probe|science|analyze|research|anomaly/.test(t)) {
    dim = "science";
  } else if (/hail|negotiat|diplomat|treaty|talk|persuade|bluff/.test(t)) {
    dim = "diplomacy";
  } else if (/warp|helm|pilot|evasive|maneuver|course|impulse|flee/.test(t)) {
    dim = "piloting";
  } else if (/repair|engineer|divert|power|shield|fix|core|jefferies/.test(t)) {
    dim = "engineering";
  } else if (/medical|sickbay|triage|rescue|casualty|hypo/.test(t)) {
    dim = "medical";
  } else if (/command|order|coordinate|strategy|plan/.test(t)) {
    dim = "command";
  }
  const score = total[dim] ?? 30;
  // 50 = neutral; each 10 points above/below ≈ 1 DC step
  let mod = Math.round((50 - score) / 12);
  // High risk benefits slightly more from excellence
  if (risk === "high" || risk === "trap") {
    if (score >= 70) mod -= 1;
    if (score <= 30) mod += 1;
  }
  // Cap influence so skill never overrides difficulty entirely
  return Math.max(-4, Math.min(4, mod));
}

export function canCrewDie(
  event: {
    hullDamage: number;
    shieldsCollapsed?: boolean;
    boarding?: boolean;
    lifeSupportDestroyed?: boolean;
    lifeSupportDamaged?: boolean;
  },
  rng: () => number = Math.random
): boolean {
  let p = 0;
  if (event.hullDamage >= 20) p += 0.18;
  else if (event.hullDamage >= 12) p += 0.1;
  else if (event.hullDamage >= 8) p += 0.04;
  if (event.boarding) p += 0.12;
  if (event.lifeSupportDestroyed) p += 0.2;
  else if (event.lifeSupportDamaged) p += 0.06;
  if (event.shieldsCollapsed && event.hullDamage >= 10) p += 0.05;
  if (p <= 0) return false;
  return rng() < Math.min(0.45, p);
}

export function applyCrewDeath(
  crew: CrewMember[],
  memberId: string,
  cause: string
): { crew: CrewMember[]; skillDelta: Partial<SkillVector>; dead: CrewMember | null } {
  let dead: CrewMember | null = null;
  const next = crew.map((c) => {
    if (c.id !== memberId) return c;
    if (c.status === "dead") return c;
    const killed: CrewMember = {
      ...normalizeCrewMember(c),
      status: "dead",
      deathCause: cause,
      injuryTurnsRemaining: undefined,
    };
    dead = killed;
    return killed;
  });
  const skillDelta: Partial<SkillVector> = {};
  const deadMember = dead as CrewMember | null;
  if (deadMember) {
    const sk = deadMember.skills || baselineSkillsForRole(deadMember.role);
    for (const k of SKILL_DIMENSIONS) {
      skillDelta[k] = -Math.round((sk[k] || 0) * 0.12);
    }
  }
  return { crew: next, skillDelta, dead: deadMember };
}

export function applyCrewInjury(
  crew: CrewMember[],
  memberId: string,
  turns = 2
): CrewMember[] {
  return crew.map((c) =>
    c.id === memberId && c.status === "active"
      ? {
          ...c,
          status: "injured" as const,
          injuryTurnsRemaining: Math.max(1, turns),
        }
      : c
  );
}

/** Advance injury recovery; bump serviceTurns for active crew */
export function tickCrewService(crew: CrewMember[]): CrewMember[] {
  return crew.map((c) => {
    const n = normalizeCrewMember(c);
    if (n.status === "dead" || n.status === "transferred") return n;
    if (n.status === "injured") {
      const left = Math.max(0, (n.injuryTurnsRemaining ?? 1) - 1);
      if (left <= 0) {
        return {
          ...n,
          status: "active",
          injuryTurnsRemaining: undefined,
          serviceTurns: (n.serviceTurns || 0) + 1,
        };
      }
      return { ...n, injuryTurnsRemaining: left };
    }
    return { ...n, serviceTurns: (n.serviceTurns || 0) + 1 };
  });
}

export function emptyUniverse(stardate = "47457.1"): UniverseState {
  const rep = {} as Record<Faction, number>;
  for (const f of FACTIONS) rep[f] = f === "federation" ? 5 : 0;
  return {
    stardate,
    globalTurn: 0,
    factionReputation: rep,
    knownLocations: [],
    galacticFlags: [],
    lastTickTurn: 0,
    activeCrises: [],
  };
}

/** Rough stardate from ship era string */
export function stardateForEra(era: string): string {
  const e = String(era || "").toLowerCase();
  if (/22|nx|enterprise era|archer/.test(e)) return "2155.4";
  if (/23|kirk|tos|tmp|disco/.test(e)) return "2268.2";
  if (/25|32/.test(e)) return "2402.1";
  // default TNG/DS9/VOY
  return "47457.1";
}

export function advanceStardate(
  stardate: string,
  steps = 1,
  rng: () => number = Math.random
): string {
  const n = Number.parseFloat(String(stardate).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return stardate;
  // Classic TNG-style fractional advance
  const next = n + steps * (0.1 + rng() * 0.4);
  return next.toFixed(1);
}

export function tickUniverse(
  u: UniverseState,
  playTurnsSinceLast: number,
  flags: string[],
  rng: () => number = Math.random
): UniverseState {
  if (playTurnsSinceLast <= 0) return u;
  let next: UniverseState = {
    ...u,
    factionReputation: { ...u.factionReputation },
    knownLocations: [...u.knownLocations],
    galacticFlags: [...u.galacticFlags],
    activeCrises: [...u.activeCrises],
    stardate: advanceStardate(u.stardate, playTurnsSinceLast, rng),
    globalTurn: u.globalTurn + playTurnsSinceLast,
    lastTickTurn: u.lastTickTurn + playTurnsSinceLast,
  };

  // Mild reputation drift toward 0
  for (const f of FACTIONS) {
    const v = next.factionReputation[f] || 0;
    if (v > 2) next.factionReputation[f] = v - 1;
    else if (v < -2) next.factionReputation[f] = v + 1;
  }

  // Flag-driven crises
  const blob = flags.join(" ").toLowerCase();
  if (/borg|cube/.test(blob) && !next.activeCrises.includes("borg_threat")) {
    next.activeCrises = [...next.activeCrises, "borg_threat"];
  }
  if (
    rng() < 0.08 + Math.min(0.15, playTurnsSinceLast * 0.01) &&
    next.activeCrises.length < 3
  ) {
    const pool = [
      "border_skirmish",
      "supply_disruption",
      "diplomatic_summit",
      "anomaly_surge",
    ];
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!next.activeCrises.includes(pick)) {
      next.activeCrises = [...next.activeCrises, pick];
    }
  }

  const markHostile = (faction: Faction, flag: string, threshold = -40) => {
    if (
      (next.factionReputation[faction] || 0) <= threshold &&
      !next.galacticFlags.includes(flag)
    ) {
      next.galacticFlags = [...next.galacticFlags, flag];
    }
  };
  markHostile("klingon", "klingon_hostility");
  markHostile("romulan", "romulan_hostility");
  markHostile("cardassian", "cardassian_hostility");
  markHostile("borg", "borg_hostility", -20);

  return next;
}

export function reputationDeltaFromFlags(
  flags: string[],
  outcome: "success" | "failed" | "abandoned"
): Partial<Record<Faction, number>> {
  const deltas: Partial<Record<Faction, number>> = {};
  const add = (f: Faction, n: number) => {
    deltas[f] = (deltas[f] || 0) + n;
  };
  const blob = flags.join(" ").toLowerCase();
  if (/klingon/.test(blob)) {
    if (/destroy|kill|attack|fire/.test(blob)) add("klingon", -8);
    if (/ally|treaty|honor|save|aid/.test(blob)) add("klingon", 6);
  }
  if (/romulan/.test(blob)) {
    if (/destroy|expose|attack/.test(blob)) add("romulan", -7);
    if (/treaty|cooperate|aid/.test(blob)) add("romulan", 5);
  }
  if (/borg/.test(blob)) {
    if (/destroy|defeat|repel/.test(blob)) add("borg", -5);
    add("federation", outcome === "success" ? 4 : -2);
  }
  if (/colony|civilian|rescue|saved/.test(blob)) {
    add("federation", outcome === "success" ? 6 : -3);
    add("independent", outcome === "success" ? 4 : -2);
  }
  if (/broke_treaty|war_crime|massacre/.test(blob)) {
    add("federation", -12);
    add("independent", -8);
  }
  if (outcome === "success") add("federation", 2);
  if (outcome === "failed") add("federation", -1);
  // Clamp individual deltas
  for (const f of Object.keys(deltas) as Faction[]) {
    deltas[f] = Math.max(-15, Math.min(15, deltas[f]!));
  }
  return deltas;
}

export function applyReputation(
  u: UniverseState,
  deltas: Partial<Record<Faction, number>> | undefined
): UniverseState {
  if (!deltas) return u;
  const rep = { ...u.factionReputation };
  for (const f of FACTIONS) {
    if (typeof deltas[f] === "number") {
      rep[f] = Math.max(-100, Math.min(100, (rep[f] || 0) + (deltas[f] as number)));
    }
  }
  return { ...u, factionReputation: rep };
}

export function calculateSkillGains(
  mission: Mission | null | undefined,
  outcome: "success" | "failed" | "abandoned",
  playTurnCount: number,
  flags: string[],
  objectives?: { kind?: string; status?: string }[]
): Partial<SkillVector> {
  const gains: Partial<SkillVector> = {};
  const bump = (k: SkillDimension, n: number) => {
    gains[k] = (gains[k] || 0) + n;
  };
  const turns = Math.max(0, playTurnCount || 0);
  bump("command", outcome === "success" ? 3 : 1);
  if (turns >= 6) bump("command", 1);

  const type = mission?.type as MissionType | undefined;
  if (type === "battle") {
    bump("tactical", outcome === "success" ? 5 : 2);
    bump("engineering", 2);
  } else if (type === "science" || type === "exploration") {
    bump("science", outcome === "success" ? 5 : 2);
    bump("piloting", 1);
  } else if (type === "search_rescue") {
    bump("medical", outcome === "success" ? 4 : 2);
    bump("diplomacy", 2);
  } else {
    bump("diplomacy", 2);
    bump("science", 1);
  }

  const objs = objectives || mission?.objectives || [];
  const mainDone = objs.some(
    (o) => o.kind === "main" && o.status === "completed"
  );
  const secondariesDone = objs.filter(
    (o) => o.kind === "secondary" && o.status === "completed"
  ).length;
  if (mainDone) {
    if (type === "battle") bump("tactical", 2);
    else if (type === "science" || type === "exploration") bump("science", 2);
    else if (type === "search_rescue") bump("medical", 1);
    else bump("command", 1);
  }
  if (secondariesDone) bump("command", 1);

  const blob = flags.join(" ").toLowerCase();
  if (/repair|engineering|warp_core|shield/.test(blob)) bump("engineering", 2);
  if (/negotiat|diplomacy|treaty/.test(blob)) bump("diplomacy", 2);
  if (/boarding|combat|phaser|torpedo/.test(blob)) bump("tactical", 1);
  if (outcome === "failed") {
    bump("command", 1);
  }
  return gains;
}

export function newProfileId(): string {
  return `prof_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createCampaignProfile(input: {
  captainName: string;
  ship: Ship;
  universe?: UniverseState;
  id?: string;
  ownerEmail?: string | null;
}): CampaignProfile {
  const now = new Date().toISOString();
  const ship = normalizeShip(input.ship);
  const stardate = ship.stardate || stardateForEra(ship.era);
  const crew = sanitizeBridgeCrew(ship.crew || []).map((c) =>
    normalizeCrewMember(c, stardate)
  );
  const withCrew = { ...ship, crew, stardate };
  const skills = computeShipSkills(withCrew, crew);
  return {
    id: input.id || newProfileId(),
    captainName: interpretCaptainName(input.captainName),
    createdAt: now,
    updatedAt: now,
    ship: { ...withCrew, skills },
    crew,
    skills,
    universe: input.universe || emptyUniverse(stardateForEra(ship.era)),
    campaignLog: [],
    activeRunId: null,
    ownerEmail: input.ownerEmail || null,
  };
}

export function appendCampaignLog(
  profile: CampaignProfile,
  entry: CampaignLogEntry
): CampaignProfile {
  return {
    ...profile,
    updatedAt: new Date().toISOString(),
    campaignLog: [...profile.campaignLog, entry].slice(-40),
  };
}

// ── Starbase refit / recruitment (pure) ─────────────────────────────

const FIRST_NAMES = [
  "Aria",
  "Brennan",
  "Chen",
  "Dax",
  "Ellis",
  "Farah",
  "Garek",
  "Hale",
  "Imani",
  "Joran",
  "Kira",
  "Lira",
  "Marek",
  "Nomi",
  "Orin",
  "Pavel",
  "Quinn",
  "Renn",
  "Soran",
  "Talia",
  "Voss",
  "Wren",
];
const SURNAMES = [
  "Voss",
  "Okoye",
  "Chen",
  "Torres",
  "Singh",
  "Nakamura",
  "Reyes",
  "Kade",
  "Mbeki",
  "Solis",
  "Park",
  "Anders",
  "Volkov",
  "Ibanez",
  "Soren",
];
const SPECIES = [
  "Human",
  "Vulcan",
  "Andorian",
  "Tellarite",
  "Bajoran",
  "Trill",
  "Betazoid",
  "Bolian",
];

const ROLE_TEMPLATES: Array<{ role: string; weight: number }> = [
  { role: "Tactical Officer", weight: 2 },
  { role: "Science Officer", weight: 2 },
  { role: "Chief Engineer", weight: 2 },
  { role: "Helmsman", weight: 1 },
  { role: "Chief Medical Officer", weight: 2 },
  { role: "Operations Officer", weight: 1 },
  { role: "Communications Officer", weight: 1 },
  { role: "Security Chief", weight: 1 },
];

const QUALITY_RANK: Record<RecruitQuality, string[]> = {
  green: ["Ens.", "Ens.", "Lt. j.g."],
  standard: ["Lt. j.g.", "Lt.", "Lt."],
  veteran: ["Lt.", "Lt. Cmdr.", "Lt. Cmdr."],
  elite: ["Lt. Cmdr.", "Cmdr.", "Cmdr."],
};

const QUALITY_SKILL_BIAS: Record<RecruitQuality, number> = {
  green: -8,
  standard: 0,
  veteran: 10,
  elite: 18,
};

const QUALITY_LABEL: Record<RecruitQuality, string> = {
  green: "green",
  standard: "rated",
  veteran: "veteran",
  elite: "elite",
};

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Federation reputation → facility tier (drives budgets + recruit quality). */
export function stationClassFromRep(fedRep: number): StationClass {
  if (fedRep >= 35) return "fleet_yards";
  if (fedRep >= 5) return "starbase";
  return "outpost";
}

export function budgetsForStation(cls: StationClass): {
  systemRepairBudget: number;
  recruitBudget: number;
  medicalBudget: number;
  transferBudget: number;
  slateSize: number;
} {
  switch (cls) {
    case "fleet_yards":
      return {
        systemRepairBudget: 3,
        recruitBudget: 3,
        medicalBudget: 3,
        transferBudget: 2,
        slateSize: 4,
      };
    case "starbase":
      return {
        systemRepairBudget: 2,
        recruitBudget: 2,
        medicalBudget: 2,
        transferBudget: 1,
        slateSize: 3,
      };
    default:
      return {
        systemRepairBudget: 1,
        recruitBudget: 1,
        medicalBudget: 1,
        transferBudget: 1,
        slateSize: 2,
      };
  }
}

/** Roll recruit quality; higher Federation rep unlocks veterans/elites. */
export function rollRecruitQuality(
  fedRep: number,
  rng: () => number = Math.random
): RecruitQuality {
  const r = rng();
  if (fedRep >= 40) {
    if (r < 0.18) return "elite";
    if (r < 0.55) return "veteran";
    if (r < 0.9) return "standard";
    return "green";
  }
  if (fedRep >= 15) {
    if (r < 0.08) return "elite";
    if (r < 0.38) return "veteran";
    if (r < 0.85) return "standard";
    return "green";
  }
  if (fedRep >= 0) {
    if (r < 0.12) return "veteran";
    if (r < 0.7) return "standard";
    return "green";
  }
  // Poor standing — mostly green transfers
  if (r < 0.55) return "green";
  if (r < 0.95) return "standard";
  return "veteran";
}

/** Top skill dimensions as a short string, e.g. "tac 62 · eng 48 · cmd 40" */
export function formatSkillBrief(
  skills: Partial<SkillVector> | undefined,
  n = 3
): string {
  if (!skills) return "—";
  const ranked = SKILL_DIMENSIONS.map((k) => ({
    k: k.slice(0, 3),
    v: skills[k] ?? 0,
  })).sort((a, b) => b.v - a.v);
  return ranked
    .slice(0, n)
    .map((x) => `${x.k} ${x.v}`)
    .join(" · ");
}

/** One-line recruit card for slate / choice labels */
export function formatRecruitLine(c: CrewMember, compact = false): string {
  const q = c.quality || "standard";
  const rank = c.rank ? `${c.rank} ` : "";
  const skills = formatSkillBrief(c.skills as SkillVector | undefined, compact ? 2 : 3);
  if (compact) {
    return `${rank}${c.name} — ${c.role} [${QUALITY_LABEL[q]}]`;
  }
  return `${rank}${c.name} — ${c.role} · ${c.species || "Unknown"} · ${QUALITY_LABEL[q]} · ${skills}`;
}

/** Roles the ship is thin on (missing/dead/injured) */
export function understaffedRoles(crew: CrewMember[]): string[] {
  const active = crew.filter((c) => (c.status || "active") === "active");
  const roles = active.map((c) => String(c.role || "").toLowerCase());
  const need: string[] = [];
  const has = (re: RegExp) => roles.some((r) => re.test(r));
  if (!has(/tactical|security|weapons/)) need.push("Tactical Officer");
  if (!has(/science|astro/)) need.push("Science Officer");
  if (!has(/engineer|ops|operations/)) need.push("Chief Engineer");
  if (!has(/medical|doctor/)) need.push("Chief Medical Officer");
  if (!has(/helm|conn|pilot|navigator/)) need.push("Helmsman");
  if (!has(/comm|diplomat|first officer|xo/)) need.push("Operations Officer");
  // Prefer filling gaps; if full, still offer a weighted generalist
  if (!need.length) need.push(pick(ROLE_TEMPLATES, Math.random).role);
  return need;
}

export function generateRecruitCandidate(
  role: string,
  stardate: string,
  opts?: {
    quality?: RecruitQuality;
    fedRep?: number;
    rng?: () => number;
  }
): CrewMember {
  const rng = opts?.rng || Math.random;
  if (isCommandingCaptainRole(role)) role = "First Officer";
  const quality =
    opts?.quality ||
    rollRecruitQuality(typeof opts?.fedRep === "number" ? opts.fedRep : 0, rng);
  const name = `${pick(FIRST_NAMES, rng)} ${pick(SURNAMES, rng)}`;
  const species = pick(SPECIES, rng);
  const skills = baselineSkillsForRole(role);
  const bias = QUALITY_SKILL_BIAS[quality];
  for (const k of SKILL_DIMENSIONS) {
    skills[k] = clampSkill(
      skills[k] + bias + Math.floor(rng() * 9) - 3
    );
  }
  // Specialty spike on primary dimension
  const primary =
    /tactical|security/.test(role.toLowerCase())
      ? "tactical"
      : /science/.test(role.toLowerCase())
        ? "science"
        : /medical|doctor/.test(role.toLowerCase())
          ? "medical"
          : /engineer|ops/.test(role.toLowerCase())
            ? "engineering"
            : /helm|conn|pilot/.test(role.toLowerCase())
              ? "piloting"
              : /comm|diplomat|command|xo/.test(role.toLowerCase())
                ? "diplomacy"
                : "command";
  skills[primary] = clampSkill(skills[primary] + 4 + Math.floor(rng() * 5));

  const rank = pick(QUALITY_RANK[quality], rng);
  const missionsPrior =
    quality === "elite"
      ? 8 + Math.floor(rng() * 12)
      : quality === "veteran"
        ? 3 + Math.floor(rng() * 6)
        : quality === "standard"
          ? Math.floor(rng() * 3)
          : 0;
  const loyaltyBase =
    quality === "elite" ? 62 : quality === "veteran" ? 55 : quality === "green" ? 42 : 50;
  const id = `crew_${Date.now().toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`;
  const flavor =
    quality === "elite"
      ? "Decorated transfer — high clearance, sharp instincts."
      : quality === "veteran"
        ? "Seasoned officer with prior deep-space tours."
        : quality === "green"
          ? "Recent Academy graduate — eager, untested."
          : "Rated officer awaiting reassignment.";

  return normalizeCrewMember(
    {
      id,
      name,
      role,
      rank,
      quality,
      species,
      personality: `${species} ${QUALITY_LABEL[quality]} — ${flavor}`,
      bio: `Starfleet ${QUALITY_LABEL[quality]} transfer. Specialty: ${role}. Prior missions: ${missionsPrior}.`,
      skills,
      loyalty: loyaltyBase + Math.floor(rng() * 16),
      status: "active",
      serviceTurns: missionsPrior * 4,
      missionsServed: missionsPrior,
      joinedStardate: stardate,
      portraitStatus: "none",
      imageUrl: null,
    },
    stardate
  );
}

export type InitStarbaseOpts = {
  systemRepairBudget?: number;
  recruitBudget?: number;
  medicalBudget?: number;
  transferBudget?: number;
  universe?: UniverseState | null;
  rng?: () => number;
};

export function initStarbaseSession(
  ship: Ship | null | undefined,
  opts?: InitStarbaseOpts
): StarbaseSession {
  const s = ship ? normalizeShip(ship) : null;
  const stardate = s?.stardate || opts?.universe?.stardate || "47457.1";
  const crew = s?.crew || [];
  const fedRep = opts?.universe?.factionReputation?.federation ?? 0;
  const stationClass = stationClassFromRep(fedRep);
  const defaults = budgetsForStation(stationClass);
  // Extra billet if ship has KIA or is severely understaffed
  const deadCount = crew.filter((c) => c.status === "dead").length;
  const activeCount = crew.filter(
    (c) => (c.status || "active") === "active"
  ).length;
  const need = understaffedRoles(crew);
  let recruitBudget =
    opts?.recruitBudget ?? defaults.recruitBudget + (deadCount > 0 ? 1 : 0);
  if (activeCount <= 3) recruitBudget = Math.max(recruitBudget, 2);
  recruitBudget = Math.min(4, recruitBudget);

  const systemRepairBudget =
    opts?.systemRepairBudget ?? defaults.systemRepairBudget;
  const medicalBudget = opts?.medicalBudget ?? defaults.medicalBudget;
  const transferBudget = opts?.transferBudget ?? defaults.transferBudget;
  const slateSize = Math.min(4, Math.max(defaults.slateSize, recruitBudget + 1));
  const rng = opts?.rng || Math.random;

  const offers: CrewMember[] = [];
  const usedRoles = new Set<string>();
  // Priority: understaffed roles first, then generalist variety
  const roleQueue = [
    ...need,
    ...ROLE_TEMPLATES.map((r) => r.role).sort(() => rng() - 0.5),
  ];
  for (const role of roleQueue) {
    if (offers.length >= slateSize) break;
    if (usedRoles.has(role) && offers.length >= need.length) continue;
    usedRoles.add(role);
    offers.push(
      generateRecruitCandidate(role, stardate, { fedRep, rng })
    );
  }
  while (offers.length < Math.min(2, slateSize)) {
    const role = pick(
      ROLE_TEMPLATES.map((r) => r.role),
      rng
    );
    offers.push(generateRecruitCandidate(role, stardate, { fedRep, rng }));
  }

  return {
    hullRefitUsed: false,
    shieldRefitUsed: false,
    systemsRepaired: [],
    systemRepairBudget,
    recruitOffers: offers.slice(0, slateSize),
    recruitBudget,
    recruitsHired: 0,
    medicalUsed: 0,
    medicalBudget,
    transfersUsed: 0,
    transferBudget,
    deepRefitUsed: false,
    stationClass,
    ready: true,
  };
}

export type RefitResult = {
  ok: boolean;
  message: string;
  ship: Ship | null;
  session: StarbaseSession;
};

/** Project ship skill totals if this recruit joins (for UI preview). */
export function projectHireSkills(
  ship: Ship,
  recruit: CrewMember
): ShipSkills {
  const s = normalizeShip(ship);
  const crew = [
    ...(s.crew || []).filter(
      (c) => c.status !== "dead" && c.status !== "transferred"
    ),
    { ...recruit, status: "active" as const },
  ];
  return computeShipSkills({ ...s, crew }, crew);
}

export function refitHull(
  ship: Ship,
  session: StarbaseSession
): RefitResult {
  const s = normalizeShip(ship);
  if (session.hullRefitUsed) {
    return {
      ok: false,
      message: "Starbase has already completed a hull refit this visit.",
      ship: s,
      session,
    };
  }
  if (s.integrity >= s.maxIntegrity) {
    return {
      ok: false,
      message: "Hull plating is already at full integrity.",
      ship: s,
      session,
    };
  }
  // Fleet yards restore more plating per visit
  const maxGain =
    session.stationClass === "fleet_yards"
      ? 55
      : session.stationClass === "starbase"
        ? 40
        : 28;
  const before = s.integrity;
  const gain = Math.min(maxGain, s.maxIntegrity - s.integrity);
  const fixed = {
    ...s,
    integrity: Math.min(s.maxIntegrity, s.integrity + gain),
  };
  return {
    ok: true,
    message: `Hull refit complete: ${before} → ${fixed.integrity}/${fixed.maxIntegrity} (+${gain}).`,
    ship: fixed,
    session: { ...session, hullRefitUsed: true },
  };
}

/**
 * Structural deep-refit: large hull restore when heavily damaged.
 * Consumes the hull refit slot and counts as one system repair.
 */
export function deepStructuralRefit(
  ship: Ship,
  session: StarbaseSession
): RefitResult {
  const s = normalizeShip(ship);
  if (session.deepRefitUsed || session.hullRefitUsed) {
    return {
      ok: false,
      message: "Structural deep-refit already used (or standard hull refit taken).",
      ship: s,
      session,
    };
  }
  if (session.systemsRepaired.length >= session.systemRepairBudget) {
    return {
      ok: false,
      message: "No repair bay slots left for a deep structural refit.",
      ship: s,
      session,
    };
  }
  const ratio = s.maxIntegrity > 0 ? s.integrity / s.maxIntegrity : 1;
  if (ratio > 0.55) {
    return {
      ok: false,
      message:
        "Hull is not damaged enough for deep structural work — use a standard hull refit.",
      ship: s,
      session,
    };
  }
  const before = s.integrity;
  const target = Math.min(
    s.maxIntegrity,
    Math.max(
      s.integrity + 50,
      Math.round(s.maxIntegrity * (session.stationClass === "fleet_yards" ? 0.9 : 0.75))
    )
  );
  const fixed = { ...s, integrity: target };
  return {
    ok: true,
    message: `Deep structural refit: hull ${before} → ${fixed.integrity}/${fixed.maxIntegrity}. Yard teams will need the rest of the visit for other work.`,
    ship: fixed,
    session: {
      ...session,
      deepRefitUsed: true,
      hullRefitUsed: true,
      systemsRepaired: [...session.systemsRepaired, "__deep_refit__"],
    },
  };
}

export function refitShields(
  ship: Ship,
  session: StarbaseSession
): RefitResult {
  const s = normalizeShip(ship);
  if (session.shieldRefitUsed) {
    return {
      ok: false,
      message: "Shield grid already recharged this visit.",
      ship: s,
      session,
    };
  }
  if (s.systems.shields === "destroyed") {
    return {
      ok: false,
      message:
        "Shield emitters are destroyed — schedule a system repair before recharging the grid.",
      ship: s,
      session,
    };
  }
  const maxS = s.maxShieldIntegrity;
  const next = {
    ...s,
    shieldIntegrity: maxS,
    shieldGridOnline: true,
    shieldRechargeTurns: 0,
  };
  return {
    ok: true,
    message: `Shield grid restored to ${maxS}/${maxS} and brought online.`,
    ship: next,
    session: { ...session, shieldRefitUsed: true },
  };
}

export function repairSystemAtStarbase(
  ship: Ship,
  session: StarbaseSession,
  systemKey: keyof import("./types.js").ShipSystems
): RefitResult {
  const s = normalizeShip(ship);
  if (session.systemsRepaired.length >= session.systemRepairBudget) {
    return {
      ok: false,
      message: `Repair budget exhausted (${session.systemRepairBudget} system(s) this visit).`,
      ship: s,
      session,
    };
  }
  if (session.systemsRepaired.includes(systemKey)) {
    return {
      ok: false,
      message: `${systemLabel(systemKey)} was already serviced this visit.`,
      ship: s,
      session,
    };
  }
  const cur = s.systems[systemKey];
  if (cur === "ok") {
    return {
      ok: false,
      message: `${systemLabel(systemKey)} is already nominal.`,
      ship: s,
      session,
    };
  }
  // Fleet yards can jump destroyed → ok in one visit; others step down
  let to: SystemStatus;
  if (cur === "destroyed") {
    to = session.stationClass === "fleet_yards" ? "ok" : "damaged";
  } else {
    to = "ok";
  }
  let systems = { ...s.systems, [systemKey]: to };
  let next: Ship = { ...s, systems };
  if (systemKey === "shields" && to === "ok") {
    next = {
      ...next,
      shieldGridOnline: true,
      shieldRechargeTurns: 0,
      shieldIntegrity: Math.max(next.shieldIntegrity, 40),
    };
  }
  if (systemKey === "shields" && to === "damaged") {
    next = {
      ...next,
      shieldGridOnline: true,
      shieldRechargeTurns: 0,
      shieldIntegrity: Math.max(next.shieldIntegrity, 20),
    };
  }
  const skills = computeShipSkills(next, next.crew);
  next = { ...next, skills };
  return {
    ok: true,
    message: `${systemLabel(systemKey)} ${cur} → ${to} (starbase repair).`,
    ship: next,
    session: {
      ...session,
      systemsRepaired: [...session.systemsRepaired, systemKey],
    },
  };
}

/** Sickbay: clear one injured officer immediately. */
export function healCrewAtStarbase(
  ship: Ship,
  session: StarbaseSession,
  memberId: string
): RefitResult & { healed?: CrewMember } {
  const s = normalizeShip(ship);
  if (session.medicalUsed >= session.medicalBudget) {
    return {
      ok: false,
      message: `Sickbay capacity full this visit (${session.medicalBudget}).`,
      ship: s,
      session,
    };
  }
  const target = (s.crew || []).find((c) => c.id === memberId);
  if (!target) {
    return {
      ok: false,
      message: "No officer with that id on the roster.",
      ship: s,
      session,
    };
  }
  if (target.status !== "injured") {
    return {
      ok: false,
      message: `${target.name} is not in sickbay (status: ${target.status || "active"}).`,
      ship: s,
      session,
    };
  }
  const healed: CrewMember = {
    ...normalizeCrewMember(target, s.stardate),
    status: "active",
    injuryTurnsRemaining: undefined,
  };
  const crew = (s.crew || []).map((c) => (c.id === memberId ? healed : c));
  const skills = computeShipSkills({ ...s, crew }, crew);
  return {
    ok: true,
    message: `Sickbay cleared ${healed.rank ? healed.rank + " " : ""}${healed.name} for full duty.`,
    ship: { ...s, crew, skills },
    session: { ...session, medicalUsed: session.medicalUsed + 1 },
    healed,
  };
}

/** Transfer an officer off the bridge roster (frees a billet). */
export function transferCrewMember(
  ship: Ship,
  session: StarbaseSession,
  memberId: string
): RefitResult & { transferred?: CrewMember } {
  const s = normalizeShip(ship);
  if (session.transfersUsed >= session.transferBudget) {
    return {
      ok: false,
      message: `Transfer orders exhausted this visit (${session.transferBudget}).`,
      ship: s,
      session,
    };
  }
  const target = (s.crew || []).find((c) => c.id === memberId);
  if (!target) {
    return {
      ok: false,
      message: "No officer with that id on the roster.",
      ship: s,
      session,
    };
  }
  if (target.status === "dead" || target.status === "transferred") {
    return {
      ok: false,
      message: `${target.name} cannot be transferred (${target.status}).`,
      ship: s,
      session,
    };
  }
  // Don't strip the last active officer
  const active = (s.crew || []).filter(
    (c) => (c.status || "active") === "active" && c.id !== memberId
  );
  if (active.length < 1 && (target.status || "active") === "active") {
    return {
      ok: false,
      message: "Cannot transfer the last active bridge officer.",
      ship: s,
      session,
    };
  }
  const transferred: CrewMember = {
    ...normalizeCrewMember(target, s.stardate),
    status: "transferred",
    injuryTurnsRemaining: undefined,
  };
  const crew = (s.crew || []).map((c) =>
    c.id === memberId ? transferred : c
  );
  const skills = computeShipSkills({ ...s, crew }, crew);
  return {
    ok: true,
    message: `${transferred.name} transferred off the ${s.name}. Billet open.`,
    ship: { ...s, crew, skills },
    session: { ...session, transfersUsed: session.transfersUsed + 1 },
    transferred,
  };
}

export function hireRecruit(
  ship: Ship,
  session: StarbaseSession,
  recruitId: string
): RefitResult & { hired?: CrewMember } {
  const s = normalizeShip(ship);
  if (session.recruitsHired >= session.recruitBudget) {
    return {
      ok: false,
      message: `Recruitment billets full this visit (${session.recruitBudget}).`,
      ship: s,
      session,
    };
  }
  const offer = session.recruitOffers.find((c) => c.id === recruitId);
  if (!offer) {
    return {
      ok: false,
      message: "That candidate is no longer available.",
      ship: s,
      session,
    };
  }
  const active = (s.crew || []).filter(
    (c) => (c.status || "active") === "active" || c.status === "injured"
  );
  // Soft cap: max 8 living officers on roster
  if (active.length >= 8) {
    return {
      ok: false,
      message: "Bridge roster is full (8 officers). Transfer someone first.",
      ship: s,
      session,
    };
  }
  const hired = normalizeCrewMember(
    { ...offer, status: "active" },
    s.stardate
  );
  const crew = [...(s.crew || []), hired];
  const beforeSkills = computeShipSkills(s, s.crew);
  const skills = computeShipSkills({ ...s, crew }, crew);
  const next = { ...s, crew, skills };
  const delta = skillDeltaLine(beforeSkills.total, skills.total);
  const q = offer.quality ? QUALITY_LABEL[offer.quality] : "rated";
  return {
    ok: true,
    message: `Commissioned ${offer.rank ? offer.rank + " " : ""}${offer.name} as ${offer.role} (${q}). ${delta} Welcome aboard.`,
    ship: next,
    session: {
      ...session,
      recruitsHired: session.recruitsHired + 1,
      recruitOffers: session.recruitOffers.filter((c) => c.id !== recruitId),
    },
    hired,
  };
}

function skillDeltaLine(before: SkillVector, after: SkillVector): string {
  const parts: string[] = [];
  for (const k of SKILL_DIMENSIONS) {
    const d = after[k] - before[k];
    if (d !== 0) parts.push(`${k.slice(0, 3)} ${d > 0 ? "+" : ""}${d}`);
  }
  return parts.length ? `Ship skills: ${parts.join(", ")}.` : "";
}

/** Normalize older starbase sessions missing new budget fields. */
export function normalizeStarbaseSession(
  session: StarbaseSession | null | undefined,
  universe?: UniverseState | null
): StarbaseSession | null {
  if (!session) return null;
  const fedRep = universe?.factionReputation?.federation ?? 0;
  const cls = session.stationClass || stationClassFromRep(fedRep);
  const defaults = budgetsForStation(cls);
  return {
    hullRefitUsed: !!session.hullRefitUsed,
    shieldRefitUsed: !!session.shieldRefitUsed,
    systemsRepaired: session.systemsRepaired || [],
    systemRepairBudget:
      typeof session.systemRepairBudget === "number"
        ? session.systemRepairBudget
        : defaults.systemRepairBudget,
    recruitOffers: session.recruitOffers || [],
    recruitBudget:
      typeof session.recruitBudget === "number"
        ? session.recruitBudget
        : defaults.recruitBudget,
    recruitsHired: session.recruitsHired || 0,
    medicalUsed: session.medicalUsed || 0,
    medicalBudget:
      typeof session.medicalBudget === "number"
        ? session.medicalBudget
        : defaults.medicalBudget,
    transfersUsed: session.transfersUsed || 0,
    transferBudget:
      typeof session.transferBudget === "number"
        ? session.transferBudget
        : defaults.transferBudget,
    deepRefitUsed: !!session.deepRefitUsed,
    stationClass: cls,
    ready: session.ready !== false,
  };
}


