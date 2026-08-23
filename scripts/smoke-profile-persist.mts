/**
 * Phase 1 profile persistence smoke (no HTTP / no LLM).
 * Run: npm run test:profiles
 */
import { randomUUID } from "node:crypto";
import {
  createProfileFromShip,
  deleteProfile,
  listProfiles,
  loadProfile,
  saveProfile,
  updateProfileFromRun,
} from "../server/src/store/profileStore.ts";
import { deleteSave, writeSave } from "../server/src/store/saveStore.ts";
import { createProfile } from "../server/src/orchestrator/gameOrchestrator.ts";
import type { GameState, Mission, Ship } from "../packages/game-core/src/types.ts";

const email = "phase1-smoke@example.com";
let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log("ok ", msg);
    return;
  }
  failed++;
  console.error("FAIL", msg);
}

const ship: Ship = {
  id: "ship-p1",
  name: "USS Phase One",
  registryNumber: "NCC-P1",
  className: "Intrepid",
  era: "24th",
  stardate: "48000.1",
  description: "smoke",
  capabilities: ["sensors"],
  integrity: 88,
  maxIntegrity: 100,
  shieldIntegrity: 70,
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
    { id: "c1", name: "Tuvok", role: "Tactical Officer", status: "active" },
  ],
  scars: ["port nacelle scoring"],
};

const created = await createProfileFromShip("Janeway", ship, email);
assert(created.captainName === "Janeway", "createProfileFromShip sets captain");
assert(created.ownerEmail === email, "profile stamped with ownerEmail");
assert(created.campaignLog.length === 0, "new profile has empty campaign log");
assert(created.ship.name === "USS Phase One", "profile stores ship");
assert(created.crew.length === 1, "profile stores crew");

const loaded = await loadProfile(created.id, email);
assert(loaded?.id === created.id, "loadProfile (spec alias) round-trips");
await saveProfile({ ...loaded!, captainName: "Kathryn Janeway" });
const renamed = await loadProfile(created.id, email);
assert(renamed?.captainName === "Kathryn Janeway", "saveProfile persists update");

const listed = await listProfiles(email);
assert(
  listed.some((p) => p.id === created.id && p.shipName.includes("Phase One")),
  "listProfiles includes the new captain/ship"
);

const mission: Mission = {
  id: "m1",
  title: "Smoke Rescue",
  type: "search_rescue",
  difficulty: "medium",
  background: "test",
  brief: "test",
  location: "Badlands",
  objectives: [
    {
      id: "o1",
      title: "Save colonists",
      description: "",
      kind: "main",
      status: "completed",
    },
  ],
  status: "success",
  knownIntel: [],
  flags: ["saved_colony"],
  playTurnCount: 6,
};

const now = new Date().toISOString();
const run: GameState = {
  runId: randomUUID(),
  createdAt: now,
  updatedAt: now,
  status: "completed",
  phase: "debrief",
  playerName: "Kathryn Janeway",
  ownerEmail: email,
  difficulty: "medium",
  missionType: "search_rescue",
  ship: { ...ship, integrity: 72 },
  mission,
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
  debrief: "ok",
  profileId: created.id,
  universe: created.universe,
};

const merged = await updateProfileFromRun(run, { outcome: "success", clearActiveRun: true });
assert(merged?.campaignLog.length === 1, "updateProfileFromRun appends campaign log");
assert(merged?.campaignLog[0].title === "Smoke Rescue", "log entry uses mission title");
assert(merged?.campaignLog[0].outcome === "success", "log entry records success");
assert(merged?.activeRunId == null, "clearActiveRun nulls activeRunId");
assert(merged?.ship.integrity === 72, "profile ship hull matches run");
assert(
  (merged?.crew[0].missionsServed || 0) >= 1,
  "living crew missionsServed incremented"
);

const viaApi = await createProfile(email, {
  captainName: "Chakotay",
  ship: { ...ship, id: "ship-p1b", name: "USS Voyager", registryNumber: "NCC-74656" },
});
assert(viaApi?.captainName === "Chakotay", "createProfile orchestrator path works");
assert(viaApi?.ship.name === "USS Voyager", "createProfile stores ship name");

const fromRunId = randomUUID();
const orphanRun: GameState = {
  ...run,
  runId: fromRunId,
  profileId: null,
  playerName: "Paris",
  status: "active",
  phase: "playing",
  ship: { ...ship, name: "Delta Flyer" },
};
await writeSave(orphanRun);
const fromRun = await createProfile(email, { runId: fromRunId });
assert(fromRun?.captainName === "Paris", "createProfile from runId uses playerName");
assert(fromRun?.activeRunId === fromRunId, "createProfile from active run sets activeRunId");
assert(fromRun?.ship.name === "Delta Flyer", "createProfile from runId copies ship");

const missing = await createProfile(email, { captainName: "No Ship" });
assert(missing === null, "createProfile without ship/runId returns null");

await deleteSave(fromRunId, email);
await deleteProfile(created.id, email);
await deleteProfile(viaApi!.id, email);
await deleteProfile(fromRun!.id, email);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 1 profile persistence: all assertions passed");
