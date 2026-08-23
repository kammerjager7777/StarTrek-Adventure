/**
 * Phase 2 crew lifecycle smoke (death, injury, service, hire).
 * Run: npm run test:crew
 */
import {
  applyCrewDeath,
  applyCrewInjury,
  canCrewDie,
  computeShipSkills,
  hireRecruit,
  initStarbaseSession,
  tickCrewService,
} from "../packages/game-core/src/campaign.ts";
import type { GameState, Ship } from "../packages/game-core/src/types.ts";
import {
  toolApplyCrewDeath,
  toolSetCrewStatus,
  toolTickCrewService,
} from "../server/src/tools/registry.ts";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

const systems = {
  shields: "ok",
  torpedoes: "ok",
  warp: "ok",
  communications: "ok",
  sensors: "ok",
  lifeSupport: "ok",
} as const;

function makeShip(crew: Ship["crew"]): Ship {
  return {
    id: "s1",
    name: "USS Lifecycle",
    registryNumber: "NCC-L1",
    className: "Intrepid",
    era: "24th",
    stardate: "48000.1",
    description: "",
    capabilities: [],
    integrity: 80,
    maxIntegrity: 100,
    shieldIntegrity: 40,
    maxShieldIntegrity: 100,
    shieldGridOnline: true,
    shieldRechargeTurns: 0,
    systems: { ...systems },
    crew,
    scars: [],
  };
}

function makeState(ship: Ship): GameState {
  const now = new Date().toISOString();
  return {
    runId: "run-crew",
    createdAt: now,
    updatedAt: now,
    status: "active",
    phase: "playing",
    playerName: "Janeway",
    ownerEmail: "crew-smoke@example.com",
    difficulty: "medium",
    missionType: "battle",
    ship,
    mission: {
      id: "m1",
      title: "Skirmish",
      type: "battle",
      difficulty: "medium",
      background: "",
      brief: "",
      location: "Badlands",
      objectives: [],
      status: "active",
      knownIntel: [],
      flags: [],
      playTurnCount: 3,
    },
    turn: null,
    log: [],
    settings: {
      speechOn: false,
      imagesOn: false,
      tutorialCompleted: true,
      voiceMode: "off",
      viewscreenEnabled: false,
    },
    viewscreen: { playlist: [], activeIndex: -1, generating: false, lastError: null },
    pendingQuestion: null,
    pendingChoices: null,
    setupNotes: [],
    missionOffers: null,
    debrief: null,
  };
}

const tuvok = {
  id: "c-tac",
  name: "Tuvok",
  role: "Tactical Officer",
  status: "active" as const,
  serviceTurns: 4,
};
const kim = {
  id: "c-ops",
  name: "Kim",
  role: "Operations Officer",
  status: "active" as const,
  serviceTurns: 2,
};
const paris = {
  id: "c-helm",
  name: "Paris",
  role: "Helmsman",
  status: "active" as const,
  serviceTurns: 1,
};

assert(
  canCrewDie({ hullDamage: 3 }) === false,
  "canCrewDie is false on tiny hull hits"
);
assert(
  canCrewDie({ hullDamage: 20, lifeSupportDestroyed: true }, () => 0) === true,
  "canCrewDie is true at p>0 when rng is 0"
);
assert(
  canCrewDie({ hullDamage: 20, lifeSupportDestroyed: true }, () => 0.99) === false,
  "canCrewDie respects rng miss"
);

const beforeSkills = computeShipSkills(makeShip([tuvok, kim, paris]));
const { crew: afterDeath, dead, skillDelta } = applyCrewDeath(
  [tuvok, kim, paris],
  "c-tac",
  "hull breach"
);
assert(dead?.name === "Tuvok" && dead.status === "dead", "applyCrewDeath marks KIA");
assert(typeof skillDelta.tactical === "number" && skillDelta.tactical < 0, "death yields tactical skill delta");
const afterSkills = computeShipSkills(makeShip(afterDeath), afterDeath);
assert(
  afterSkills.fromCrew.tactical < beforeSkills.fromCrew.tactical,
  "dead officer no longer contributes to ship skills"
);

const injured = applyCrewInjury([tuvok, kim], "c-ops", 2);
assert(
  injured.find((c) => c.id === "c-ops")?.status === "injured",
  "applyCrewInjury sets injured"
);
const ticked = tickCrewService(injured);
assert(
  ticked.find((c) => c.id === "c-tac")!.serviceTurns === 5,
  "tickCrewService increments active serviceTurns"
);
assert(
  ticked.find((c) => c.id === "c-ops")?.injuryTurnsRemaining === 1,
  "tickCrewService counts down injury"
);
const recovered = tickCrewService(ticked);
assert(
  recovered.find((c) => c.id === "c-ops")?.status === "active",
  "injury recovers to active"
);

const state = makeState(makeShip([tuvok, kim, paris]));
const deathTool = toolApplyCrewDeath(state, "c-tac", "boarding action");
assert(deathTool.ok, "toolApplyCrewDeath succeeds with a spare roster");
assert(
  deathTool.state?.ship?.crew.find((c) => c.id === "c-tac")?.status === "dead",
  "tool marks officer dead"
);
assert(
  (deathTool.state?.ship?.scars || []).some((s) => /Tuvok/.test(s)),
  "death adds a scar"
);
assert(
  deathTool.state?.mission?.flags.some((f) => f.startsWith("crew_loss_")),
  "death sets crew_loss_<role> flag"
);

const solo = makeState(makeShip([{ ...tuvok }]));
const last = toolApplyCrewDeath(solo, "c-tac", "core breach");
assert(last.ok, "last officer is not rejected outright");
assert(
  last.state?.ship?.crew.find((c) => c.id === "c-tac")?.status === "injured",
  "last living officer is injured instead of killed"
);
assert(
  last.data?.lastOfficerProtected === true,
  "tool reports lastOfficerProtected"
);

const svc = toolTickCrewService(makeState(makeShip([tuvok])));
assert(
  svc.state?.ship?.crew[0].serviceTurns === 5,
  "toolTickCrewService advances serviceTurns"
);

const inj = toolSetCrewStatus(makeState(makeShip([tuvok, kim])), "c-ops", "injured");
assert(
  inj.state?.ship?.crew.find((c) => c.id === "c-ops")?.status === "injured",
  "toolSetCrewStatus injured works"
);

const universe = {
  stardate: "48000.1",
  globalTurn: 8,
  factionReputation: {
    federation: 10,
    klingon: 0,
    romulan: 0,
    cardassian: 0,
    borg: 0,
    independent: 0,
    other: 0,
  },
  knownLocations: [],
  galacticFlags: [],
  lastTickTurn: 0,
  activeCrises: [],
};
const sess = initStarbaseSession(makeShip([tuvok]), { universe });
assert(sess.recruitOffers.length >= 1, "starbase offers replacement officers");
const hire = hireRecruit(makeShip([tuvok]), sess, sess.recruitOffers[0].id);
assert(hire.ok && hire.hired, "hireRecruit adds a replacement");
assert(
  hire.hired?.status === "active" &&
    hire.hired?.skills &&
    typeof hire.hired.skills.tactical === "number" &&
    typeof hire.hired.serviceTurns === "number",
  "hired officer has baseline skills and service clock"
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 2 crew lifecycle: all assertions passed");
