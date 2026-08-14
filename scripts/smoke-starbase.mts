/**
 * Quick smoke for starbase refit / recruitment pure rules.
 * Run: npx tsx scripts/smoke-starbase.mts
 */
import {
  initStarbaseSession,
  hireRecruit,
  healCrewAtStarbase,
  transferCrewMember,
  deepStructuralRefit,
  refitHull,
  stationClassFromRep,
  budgetsForStation,
  formatRecruitLine,
  repairSystemAtStarbase,
  refitShields,
} from "../packages/game-core/src/campaign.ts";
import type { Ship, UniverseState } from "../packages/game-core/src/types.ts";

const ship = {
  id: "s1",
  name: "USS Test",
  registryNumber: "NCC-1",
  className: "Intrepid",
  era: "24th",
  stardate: "48000.1",
  description: "",
  capabilities: [],
  integrity: 40,
  maxIntegrity: 100,
  shieldIntegrity: 10,
  maxShieldIntegrity: 100,
  shieldGridOnline: false,
  shieldRechargeTurns: 1,
  systems: {
    shields: "damaged",
    torpedoes: "ok",
    warp: "destroyed",
    communications: "ok",
    sensors: "damaged",
    lifeSupport: "ok",
  },
  crew: [
    { id: "c1", name: "Janeway", role: "Captain", status: "active" },
    {
      id: "c2",
      name: "Kim",
      role: "Operations Officer",
      status: "injured",
      injuryTurnsRemaining: 2,
    },
  ],
  scars: [],
} as Ship;

const universe = {
  stardate: "48000.1",
  globalTurn: 10,
  factionReputation: {
    federation: 40,
    klingon: 0,
    romulan: -5,
    cardassian: 0,
    borg: -20,
    independent: 0,
    other: 0,
  },
  knownLocations: [],
  galacticFlags: [],
  lastTickTurn: 0,
  activeCrises: [],
} as UniverseState;

console.log("station", stationClassFromRep(40), budgetsForStation("fleet_yards"));
const sess = initStarbaseSession(ship, { universe });
console.log("session", {
  class: sess.stationClass,
  recruitBudget: sess.recruitBudget,
  systemRepairBudget: sess.systemRepairBudget,
  medicalBudget: sess.medicalBudget,
  offers: sess.recruitOffers.map((c) => formatRecruitLine(c)),
});

const deep = deepStructuralRefit(ship, sess);
console.log("deep", deep.ok, deep.message);
let s = deep.ship || ship;
let se = deep.session;

// After deep refit, hull slot is used — standard refit should fail
const hullAgain = refitHull(s, se);
console.log("hull-after-deep", hullAgain.ok, hullAgain.message);

const heal = healCrewAtStarbase(s, se, "c2");
console.log("heal", heal.ok, heal.message);
s = heal.ship || s;
se = heal.session;

// Fresh session for hire/transfer without deep-refit consuming system budget
const sess2 = initStarbaseSession(s, { universe });
const repair = repairSystemAtStarbase(s, sess2, "warp");
console.log("repair-warp", repair.ok, repair.message);
s = repair.ship || s;
se = repair.session;

const shields = refitShields(s, se);
console.log("shields", shields.ok, shields.message);
s = shields.ship || s;
se = shields.session;

if (se.recruitOffers[0]) {
  const h = hireRecruit(s, se, se.recruitOffers[0].id);
  console.log("hire", h.ok, h.message);
  s = h.ship || s;
  se = h.session;
}

const t = transferCrewMember(s, se, "c1");
console.log("transfer", t.ok, t.message);

// Outpost budgets
const lowU = {
  ...universe,
  factionReputation: { ...universe.factionReputation, federation: -10 },
};
const outpost = initStarbaseSession(ship, { universe: lowU });
console.log("outpost", {
  class: outpost.stationClass,
  recruitBudget: outpost.recruitBudget,
  systemRepairBudget: outpost.systemRepairBudget,
});

console.log("OK");
