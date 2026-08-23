/**
 * Phase 3 skill baselines, XP, and dice modifiers.
 * Run: npm run test:skills
 */
import {
  applySkillXp,
  baselineSkillsForRole,
  baselineShipSkills,
  calculateSkillGains,
  computeShipSkills,
  emptySkillVector,
  skillModifierForAction,
} from "../packages/game-core/src/campaign.ts";
import { evaluateSystemConstraints } from "../packages/game-core/src/rules.ts";
import type { Mission, Ship } from "../packages/game-core/src/types.ts";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

const tac = baselineSkillsForRole("Tactical Officer");
assert(tac.tactical >= 50, `tactical officer baseline tactical high (${tac.tactical})`);
assert(tac.science < tac.tactical, "tactical officer science < tactical");

const sci = baselineSkillsForRole("Science Officer");
assert(sci.science >= 50, "science officer baseline science high");

const defiant = baselineShipSkills("Defiant", "24th");
const oberth = baselineShipSkills("Oberth", "24th");
assert(defiant.tactical > oberth.tactical, "Defiant base tactical > Oberth");
assert(oberth.science >= defiant.science, "Oberth science at least Defiant");

const ship = {
  id: "s",
  name: "USS Skill",
  registryNumber: "NCC-S",
  className: "Defiant",
  era: "24th",
  stardate: "48000.1",
  description: "",
  capabilities: [],
  integrity: 100,
  maxIntegrity: 100,
  shieldIntegrity: 100,
  maxShieldIntegrity: 100,
  shieldGridOnline: true,
  shieldRechargeTurns: 0,
  systems: {
    shields: "ok",
    torpedoes: "ok",
    warp: "ok",
    communications: "ok",
    sensors: "ok",
    lifeSupport: "ok",
  },
  crew: [
    { id: "t", name: "Tuvok", role: "Tactical Officer", status: "active" },
    { id: "s", name: "Kim", role: "Science Officer", status: "active" },
  ],
  scars: [],
} as Ship;

const skills = computeShipSkills(ship);
assert(skills.total.tactical > skills.base.tactical, "crew adds to ship tactical");
assert(
  Object.values(skills.total).every((n) => n >= 0 && n <= 100),
  "totals clamped 0–100"
);

const fireMod = skillModifierForAction(skills, "Fire phasers at the raider", "high");
const weak = emptySkillVector(20);
const weakMod = skillModifierForAction(weak, "Fire phasers at the raider", "high");
assert(fireMod <= 0, `strong tactical does not raise DC (mod ${fireMod})`);
assert(weakMod > fireMod, `weak tactical is harder than strong (${weakMod} > ${fireMod})`);
assert(fireMod >= -4 && fireMod <= 4, "skill mod clamped ±4");

const blocked = evaluateSystemConstraints("Emergency warp jump", {
  ...ship.systems,
  warp: "destroyed",
});
assert(
  blocked.some((c) => c.severity === "blocked"),
  "destroyed warp still blocks regardless of skill"
);

const mission: Mission = {
  id: "m",
  title: "Test",
  type: "battle",
  difficulty: "medium",
  background: "",
  brief: "",
  location: "here",
  objectives: [
    { id: "o1", title: "Win", description: "", kind: "main", status: "completed" },
    { id: "o2", title: "Save", description: "", kind: "secondary", status: "completed" },
  ],
  status: "success",
  knownIntel: [],
  flags: ["boarding", "repair"],
  playTurnCount: 8,
};
const gains = calculateSkillGains(
  mission,
  "success",
  8,
  mission.flags,
  mission.objectives
);
assert((gains.tactical || 0) >= 7, `battle + main complete tactical XP (${gains.tactical})`);
assert((gains.command || 0) >= 4, "command XP from success, turns, secondary");
assert((gains.engineering || 0) >= 4, "engineering XP from battle + repair flag");

const capped = applySkillXp(emptySkillVector(98), { tactical: 10 }, 1);
assert(capped.tactical === 100, "applySkillXp clamps to 100");

const deadCrewSkills = computeShipSkills({
  ...ship,
  crew: [
    { id: "t", name: "Tuvok", role: "Tactical Officer", status: "dead" },
    { id: "s", name: "Kim", role: "Science Officer", status: "active" },
  ],
});
assert(
  deadCrewSkills.fromCrew.tactical < skills.fromCrew.tactical,
  "dead tactical officer does not contribute"
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 3 skills: all assertions passed");
