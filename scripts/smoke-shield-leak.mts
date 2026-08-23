/**
 * Shield leak + damaged-emitter cap smoke.
 * Run: npm run test:shields
 */
import {
  applyCombatDamage,
  DAMAGED_SHIELD_MAX_FACTOR,
  divertPowerToShields,
  effectiveShieldMax,
  normalizeShip,
  tickShieldRecharge,
} from "../packages/game-core/src/rules.ts";
import type { Ship } from "../packages/game-core/src/types.ts";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

function baseShip(over: Partial<Ship> = {}): Ship {
  return normalizeShip({
    id: "s",
    name: "USS Leak",
    registryNumber: "NCC-L",
    className: "Intrepid",
    era: "24th",
    stardate: "48000.1",
    description: "",
    capabilities: [],
    integrity: 100,
    maxIntegrity: 100,
    shieldIntegrity: 75,
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
    crew: [],
    scars: [],
    ...over,
  });
}

const at75 = applyCombatDamage(baseShip({ shieldIntegrity: 75 }), 20, "phaser", () => 0);
assert(at75.hullDamage >= 4, `75% shields leak hull (got ${at75.hullDamage})`);
assert(at75.shieldDamage > 0, "75% shields still absorb grid damage");
assert(!at75.shieldsCollapsed, "75% phaser 20 does not always collapse");

const atFull = applyCombatDamage(baseShip({ shieldIntegrity: 100 }), 20, "phaser", () => 0);
assert(
  atFull.hullDamage < at75.hullDamage,
  `full shields leak less than 75% (${atFull.hullDamage} < ${at75.hullDamage})`
);

const at25 = applyCombatDamage(baseShip({ shieldIntegrity: 25 }), 20, "phaser", () => 0);
assert(
  at25.hullDamage > at75.hullDamage,
  `25% shields leak more than 75% (${at25.hullDamage} > ${at75.hullDamage})`
);

const damaged = normalizeShip(
  baseShip({
    systems: {
      shields: "damaged",
      torpedoes: "ok",
      warp: "ok",
      communications: "ok",
      sensors: "ok",
      lifeSupport: "ok",
    },
    shieldIntegrity: 100,
  })
);
assert(
  effectiveShieldMax(damaged) === Math.round(100 * DAMAGED_SHIELD_MAX_FACTOR),
  "damaged emitters cap at 65%"
);
assert(
  damaged.shieldIntegrity <= effectiveShieldMax(damaged),
  "normalize clamps charge to damaged cap"
);

const collapse = applyCombatDamage(
  baseShip({
    shieldIntegrity: 8,
    systems: {
      shields: "damaged",
      torpedoes: "ok",
      warp: "ok",
      communications: "ok",
      sensors: "ok",
      lifeSupport: "ok",
    },
  }),
  40,
  "phaser",
  () => 0.99
);
assert(collapse.shieldsCollapsed, "weak damaged grid can collapse");
assert(
  collapse.ship.shieldRechargeTurns >= 4,
  `damaged collapse recharge is longer (got ${collapse.ship.shieldRechargeTurns})`
);

let ticking = {
  ...baseShip({
    shieldGridOnline: false,
    shieldIntegrity: 0,
    shieldRechargeTurns: 5,
    systems: {
      shields: "damaged",
      torpedoes: "ok",
      warp: "ok",
      communications: "ok",
      sensors: "ok",
      lifeSupport: "ok",
    },
  }),
};
let restored = false;
for (let i = 0; i < 6; i++) {
  const t = tickShieldRecharge(ticking);
  ticking = t.ship;
  if (t.restored) {
    restored = true;
    break;
  }
}
assert(restored, "damaged grid eventually restores");
assert(
  ticking.shieldIntegrity <= effectiveShieldMax(ticking),
  "restore respects damaged cap"
);

const boost = divertPowerToShields(
  baseShip({
    shieldIntegrity: 50,
    systems: {
      shields: "damaged",
      torpedoes: "ok",
      warp: "ok",
      communications: "ok",
      sensors: "ok",
      lifeSupport: "ok",
    },
  })
);
assert(
  boost.ship.shieldIntegrity <= effectiveShieldMax(boost.ship),
  "divert cannot exceed damaged cap"
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nShield leak / damaged cap: all assertions passed");
