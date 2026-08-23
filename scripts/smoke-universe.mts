/**
 * Phase 4 universe ticks, standing, and hostility flags.
 * Run: npm run test:universe
 */
import {
  applyReputation,
  emptyUniverse,
  reputationDeltaFromFlags,
  stardateForEra,
  tickUniverse,
} from "../packages/game-core/src/campaign.ts";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

const u0 = emptyUniverse("47457.1");
assert(u0.factionReputation.federation === 5, "Federation starts at +5");
assert(u0.factionReputation.klingon === 0, "Klingon starts at 0");
assert(u0.lastTickTurn === 0, "lastTickTurn starts at 0");

assert(stardateForEra("23rd century Kirk") === "2268.2", "23rd-century stardate");
assert(stardateForEra("TNG") === "47457.1", "24th-century default stardate");

const ticked = tickUniverse(u0, 5, [], () => 0.99);
assert(Number(ticked.stardate) > Number(u0.stardate), "tick advances stardate");
assert(ticked.globalTurn === 5, "tick adds globalTurn");
assert(ticked.lastTickTurn === 5, "lastTickTurn tracks since");

const klingonHot = applyReputation(emptyUniverse(), { klingon: -45 });
const afterTick = tickUniverse(klingonHot, 5, ["destroyed_klingon_ship"], () => 0.99);
assert(
  afterTick.galacticFlags.includes("klingon_hostility"),
  "low Klingon standing sets hostility flag"
);

const borgHot = tickUniverse(
  applyReputation(emptyUniverse(), { borg: -25 }),
  5,
  ["borg cube"],
  () => 0.99
);
assert(borgHot.activeCrises.includes("borg_threat"), "borg flags seed borg_threat crisis");
assert(borgHot.galacticFlags.includes("borg_hostility"), "low Borg standing sets hostility");

const deltas = reputationDeltaFromFlags(
  ["destroyed_klingon_ship", "saved_colony"],
  "success"
);
assert((deltas.klingon || 0) < 0, "destroying Klingons hurts Klingon standing");
assert((deltas.federation || 0) > 0, "saving a colony helps Federation standing");

const clamped = applyReputation(emptyUniverse(), { federation: 200, klingon: -200 });
assert(clamped.factionReputation.federation === 100, "reputation clamps at 100");
assert(clamped.factionReputation.klingon === -100, "reputation clamps at -100");

const rngSeq = [0.0, 0.0];
let i = 0;
const rng = () => rngSeq[Math.min(i++, rngSeq.length - 1)];
const crisis = tickUniverse(emptyUniverse(), 8, [], rng);
assert(crisis.activeCrises.length >= 1, "random galactic event can fire");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 4 universe: all assertions passed");
