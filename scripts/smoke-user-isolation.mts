/**
 * Smoke: two emails never see each other's saves/profiles.
 * Run: npx tsx scripts/smoke-user-isolation.mts
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeSave, readSave, listSaves, deleteSave } from "../server/src/store/saveStore.ts";
import {
  createProfileFromShip,
  listProfiles,
  readProfile,
  deleteProfile,
} from "../server/src/store/profileStore.ts";
import type { GameState, Ship } from "../packages/game-core/src/types.ts";
import { userDataRoot } from "../server/src/auth/userData.ts";

const alice = "alice@example.com";
const bob = "bob@example.com";

const ship = {
  id: "ship1",
  name: "USS Isolation",
  registryNumber: "NCC-ISO",
  className: "Intrepid",
  era: "24th",
  stardate: "48000.1",
  description: "test",
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
  crew: [{ id: "c1", name: "Tuvok", role: "Tactical Officer", status: "active" }],
  scars: [],
} as Ship;

function makeState(email: string, playerName: string): GameState {
  const now = new Date().toISOString();
  return {
    runId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "active",
    phase: "playing",
    playerName,
    ownerEmail: email,
    difficulty: "medium",
    missionType: "exploration",
    ship,
    mission: null,
    turn: null,
    log: [],
    settings: {
      speechOn: false,
      imagesOn: true,
      tutorialCompleted: true,
      voiceMode: "off",
      viewscreenEnabled: false,
    },
    viewscreen: { playlist: [], activeIndex: -1, generating: false, lastError: null },
    pendingQuestion: "Test",
    pendingChoices: null,
    setupNotes: [],
    missionOffers: null,
    debrief: null,
  };
}

const aliceState = makeState(alice, "Alice");
const bobState = makeState(bob, "Bob");

await writeSave(aliceState);
await writeSave(bobState);

const aliceList = await listSaves(alice);
const bobList = await listSaves(bob);
console.log("alice saves", aliceList.map((g) => g.playerName));
console.log("bob saves", bobList.map((g) => g.playerName));

if (aliceList.some((g) => g.runId === bobState.runId)) {
  throw new Error("Alice can see Bob's run");
}
if (bobList.some((g) => g.runId === aliceState.runId)) {
  throw new Error("Bob can see Alice's run");
}

const cross = await readSave(aliceState.runId, bob);
if (cross) throw new Error("Bob read Alice's save");

const own = await readSave(aliceState.runId, alice);
if (!own) throw new Error("Alice cannot read own save");

const aProf = await createProfileFromShip("Alice", ship, alice);
const bProf = await createProfileFromShip("Bob", ship, bob);
const aProfiles = await listProfiles(alice);
const bProfiles = await listProfiles(bob);
if (aProfiles.some((p) => p.id === bProf.id)) throw new Error("Alice sees Bob profile");
if (bProfiles.some((p) => p.id === aProf.id)) throw new Error("Bob sees Alice profile");
if (await readProfile(aProf.id, bob)) throw new Error("Bob read Alice profile");

// Paths exist under user dirs
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../data");
const aliceDir = userDataRoot(alice);
const bobDir = userDataRoot(bob);
await fs.access(path.join(aliceDir, "saves", `${aliceState.runId}.json`));
await fs.access(path.join(bobDir, "saves", `${bobState.runId}.json`));
console.log("paths ok", { aliceDir: path.relative(root, aliceDir), bobDir: path.relative(root, bobDir) });

// Cleanup
await deleteSave(aliceState.runId, alice);
await deleteSave(bobState.runId, bob);
await deleteProfile(aProf.id, alice);
await deleteProfile(bProf.id, bob);

console.log("OK — user isolation holds");
