/**
 * Phase 6 starbase hub: refit, recruitment, campaign log, choice labels.
 * Run: npm run test:starbase
 */
import {
  deepStructuralRefit,
  formatCampaignLog,
  healCrewAtStarbase,
  hireRecruit,
  initStarbaseSession,
  refitHull,
  refitShields,
  repairSystemAtStarbase,
  starbaseHubChoices,
  stationClassFromRep,
  transferCrewMember,
} from "../packages/game-core/src/campaign.ts";
import type { CampaignLogEntry, Ship, UniverseState } from "../packages/game-core/src/types.ts";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

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

assert(stationClassFromRep(40) === "fleet_yards", "rep 40 is fleet yards");
assert(stationClassFromRep(4) === "outpost", "rep 4 is outpost");

const sess = initStarbaseSession(ship, { universe });
assert(sess.stationClass === "fleet_yards", "session uses fleet yards");
assert(sess.recruitOffers.length >= 2, "slate has recruits");

const labels = starbaseHubChoices({ ship, starbase: sess, campaignLog: [] });
assert(labels.some((l) => /view campaign log/i.test(l)), "hub offers campaign log");
assert(labels.some((l) => /choose next mission/i.test(l)), "hub offers next mission");
assert(labels.some((l) => /save and stand down/i.test(l)), "hub offers stand down");
assert(labels.some((l) => /refit hull/i.test(l)), "hub offers hull refit");
assert(labels.some((l) => /^hire:/i.test(l)), "hub offers hire");
assert(
  !labels.some((l) => /^transfer:/i.test(l)),
  "first dock does not offer transfers"
);

const emptyLog = formatCampaignLog([]);
assert(/no prior missions/i.test(emptyLog), "empty log message");

const entries: CampaignLogEntry[] = [
  {
    missionId: "m1",
    title: "Skirmish",
    stardate: "48001.2",
    outcome: "success",
    keyFlags: ["saved_colony"],
    casualties: [],
    skillGains: { tactical: 4 },
    reputationDeltas: { federation: 5 },
  },
];
assert(formatCampaignLog(entries).includes("Skirmish"), "log includes title");
const laterLabels = starbaseHubChoices({
  ship,
  starbase: sess,
  campaignLog: entries,
});
assert(
  laterLabels.some((l) => /^transfer:/i.test(l)),
  "after a mission, hub may offer transfers"
);

const deep = deepStructuralRefit(ship, sess);
assert(deep.ok, "deep structural refit allowed on heavy damage");
let s = deep.ship || ship;
let se = deep.session;
const hullAgain = refitHull(s, se);
assert(hullAgain.ok === false, "hull slot consumed after deep refit");

const heal = healCrewAtStarbase(s, se, "c2");
assert(heal.ok, "sickbay heals injured officer");
s = heal.ship || s;
se = heal.session;

const sess2 = initStarbaseSession(s, { universe });
const repair = repairSystemAtStarbase(s, sess2, "warp");
assert(repair.ok, "fleet yards can repair destroyed warp");
s = repair.ship || s;
se = repair.session;

const shields = refitShields(s, se);
assert(shields.ok, "shield recharge works when emitters not destroyed");
s = shields.ship || s;
se = shields.session;

if (se.recruitOffers[0]) {
  const h = hireRecruit(s, se, se.recruitOffers[0].id);
  assert(h.ok, "hire recruit succeeds");
  s = h.ship || s;
  se = h.session;
}

const t = transferCrewMember(s, se, "c1");
assert(typeof t.ok === "boolean", "transfer returns a result");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 6 starbase hub: all assertions passed");
