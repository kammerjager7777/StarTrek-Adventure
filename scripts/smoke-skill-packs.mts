/**
 * Phase 7 skill packs — narrator stays consistent with the campaign referee.
 * Run: npm run test:skillpacks
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baselineSkillsForRole } from "../packages/game-core/src/campaign.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

function pack(name: string): string {
  return readFileSync(path.join(ROOT, "content/skills", name), "utf8");
}

const core = pack("core-gm.md");
assert(/never invent/i.test(core), "core-gm: never invent");
assert(/skill numbers/i.test(core), "core-gm: skill numbers");
assert(/deaths/i.test(core), "core-gm: deaths");
assert(/reputation/i.test(core), "core-gm: reputation");
assert(/mechanicalResults/i.test(core), "core-gm: mechanicalResults");
assert(/living crew/i.test(core), "core-gm: living crew");
assert(/remember when/i.test(core), "core-gm: remember when");

const play = pack("play-json.md");
assert(/reputationDeltas/.test(play), "play-json: reputationDeltas");
assert(/crewStatusUpdates/.test(play), "play-json: crewStatusUpdates");
assert(/proposals only/i.test(play), "play-json: proposals only");
assert(/short and in-character/i.test(play), "play-json: advice short/in-character");

const setup = pack("setup-content.md");
assert(/factionReputation|galacticFlags/.test(setup), "setup: standing / flags");
assert(/must respect/i.test(setup), "setup: missions respect universe");
assert(/role-appropriate/i.test(setup), "setup: role-appropriate baselines");
assert(/baselineSkillsForRole/.test(setup), "setup: host assigns baselines");

const stages = pack("stages.md");
assert(/starbase/i.test(stages), "stages: starbase hub");
assert(/Choose next mission/.test(stages), "stages: choose next mission");
assert(/Advice/.test(stages), "stages: advice flow");
assert(/playTurnCount/.test(stages), "stages: advice is not a play turn");

const advice = pack("crew-advice.md");
assert(/short and in-character/i.test(advice), "crew-advice: short/in-character");
assert(/Do not invent skill numbers/.test(advice), "crew-advice: no invented numbers");

const tac = baselineSkillsForRole("Tactical Officer");
const sci = baselineSkillsForRole("Science Officer");
assert(tac.tactical > tac.science, "tactical baseline favors tactical");
assert(sci.science > sci.tactical, "science baseline favors science");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nskill packs ok");
