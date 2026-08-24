/**
 * Phase 8 checklist: skills, crew death, advice, universe, profiles.
 * Run: npm run test:phase8
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAdviceToState,
  gateCrewAdvice,
} from "../packages/game-core/src/advice.ts";
import {
  applyReputation,
  baselineSkillsForRole,
  computeShipSkills,
  createCampaignProfile,
  emptySkillVector,
  formatUniverseBrief,
  skillModifierForAction,
  tickUniverse,
} from "../packages/game-core/src/campaign.ts";
import type {
  CrewMember,
  GameState,
  Ship,
  Turn,
} from "../packages/game-core/src/types.ts";
import { toolApplyCrewDeath } from "../server/src/tools/registry.ts";
import {
  createProfileFromShip,
  deleteProfile,
  loadProfile,
  updateProfileFromRun,
} from "../server/src/store/profileStore.ts";
import { deleteSave, readSave, writeSave } from "../server/src/store/saveStore.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = "phase8-smoke@example.com";

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

function officer(
  id: string,
  name: string,
  role: string,
  extra: Partial<CrewMember> = {}
): CrewMember {
  return {
    id,
    name,
    role,
    status: "active",
    skills: baselineSkillsForRole(role),
    ...extra,
  };
}

function makeShip(crew: CrewMember[]): Ship {
  return {
    id: "s8",
    name: "USS Phase Eight",
    registryNumber: "NCC-P8",
    className: "Galaxy",
    era: "24th",
    stardate: "47457.1",
    description: "smoke",
    capabilities: [],
    integrity: 90,
    maxIntegrity: 100,
    shieldIntegrity: 80,
    maxShieldIntegrity: 100,
    shieldGridOnline: true,
    shieldRechargeTurns: 0,
    systems: { ...systems },
    crew,
    scars: [],
  };
}

const tac = officer("c-tac", "Worf", "Tactical Officer");
const sci = officer("c-sci", "Data", "Science Officer");
const med = officer("c-med", "Crusher", "Chief Medical Officer");

// 1. New profile → baseline skills
const profile = createCampaignProfile({
  captainName: "Picard",
  ship: makeShip([tac, sci, med]),
  ownerEmail: email,
});
assert(profile.crew.every((c) => c.skills), "new profile crew have skills");
assert(
  (profile.crew.find((c) => c.id === "c-tac")?.skills?.tactical || 0) >= 50,
  "tactical officer baseline tactical is high"
);
assert(
  (profile.crew.find((c) => c.id === "c-sci")?.skills?.science || 0) >= 50,
  "science officer baseline science is high"
);
assert(
  profile.skills.total.tactical > profile.skills.base.tactical,
  "living crew contribute to ship skill totals"
);

// 2. Crew death removes skill contribution + scar/flag
const now = new Date().toISOString();
const playing: GameState = {
  runId: randomUUID(),
  createdAt: now,
  updatedAt: now,
  status: "active",
  phase: "playing",
  playerName: "Picard",
  ownerEmail: email,
  difficulty: "medium",
  missionType: "battle",
  ship: { ...profile.ship, skills: profile.skills },
  mission: {
    id: "m8",
    title: "Checklist",
    type: "battle",
    difficulty: "medium",
    background: "",
    brief: "",
    location: "Neutral Zone",
    objectives: [],
    status: "active",
    knownIntel: [],
    flags: [],
    playTurnCount: 4,
  },
  turn: {
    sceneId: "s",
    narration: "Red alert.",
    crewDialogue: [],
    options: [],
    viewscreenPrompt: "",
    lastRoll: { die: 11, threshold: 10, success: true, critical: "none", reason: "ok" },
  } as Turn,
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
  universe: profile.universe,
  profileId: profile.id,
};

const beforeTac = playing.ship!.skills!.total.tactical;
const killed = toolApplyCrewDeath(playing, "c-tac", "hull breach");
assert(killed.ok, "toolApplyCrewDeath succeeds with remaining officers");
assert(
  killed.state?.ship?.crew.find((c) => c.id === "c-tac")?.status === "dead",
  "dead officer marked KIA"
);
assert(
  (killed.state?.ship?.skills?.total.tactical || 0) < beforeTac,
  "KIA removes tactical contribution"
);
assert(
  (killed.state?.ship?.scars || []).some((s) => /Worf/.test(s) && /KIA/.test(s)),
  "death adds a KIA scar"
);
assert(
  killed.state?.mission?.flags.includes("crew_casualty") &&
    killed.state?.mission?.flags.some((f) => /crew_loss_/.test(f)),
  "death sets crew_loss flag"
);

// 3. Skill modifiers affect dice thresholds
const strong = skillModifierForAction(
  { ...emptySkillVector(70), tactical: 80 },
  "Fire phasers at the raider",
  "high"
);
const weak = skillModifierForAction(
  { ...emptySkillVector(20), tactical: 20 },
  "Fire phasers at the raider",
  "high"
);
assert(strong < weak, `strong tactical eases DC vs weak (${strong} < ${weak})`);

// 4. Advice does not advance playTurnCount or dice
const adviceState = applyAdviceToState(
  playing,
  sci,
  {
    narration: "Data tilts his head.",
    advice: "The probability of success increases if we scan first, Captain.",
    suggestedOption: { text: "Full sensor sweep", risk: "low" },
  },
  "Scan?"
);
assert(adviceState.mission?.playTurnCount === 4, "advice does not increment playTurnCount");
assert(adviceState.turn?.lastRoll?.die === 11, "advice does not roll dice");
assert(gateCrewAdvice(playing, "c-tac").ok === true, "active officer may advise");

// 5. Universe ticks after N turns and on debrief-like tick
const ticked = tickUniverse(profile.universe, 5, [], () => 0.99);
assert(Number(ticked.stardate) > Number(profile.universe.stardate), "tick after 5 turns advances stardate");
assert(ticked.lastTickTurn === 5, "lastTickTurn records the tick");
const debriefTick = tickUniverse(ticked, 3, ["saved_colony"], () => 0.99);
assert(debriefTick.lastTickTurn === 8, "debrief-style tick advances lastTickTurn further");

// 6. Reputation changes affect subsequent mission offers
const hostile = applyReputation(profile.universe, { klingon: -45 });
const flagged = tickUniverse(hostile, 5, [], () => 0.99);
assert(flagged.galacticFlags.includes("klingon_hostility"), "low Klingon standing sets hostility");
const brief = formatUniverseBrief(flagged);
assert(/klingon/i.test(brief) && /hostile/i.test(brief), "mission briefing copy follows standing");
const allied = formatUniverseBrief(applyReputation(profile.universe, { federation: 40 }));
assert(/diplomatic|relief/i.test(allied), "high Federation standing prefers diplomatic / relief");

// 7. Save/load profile restores ship + living crew + skills + universe
const persisted = await createProfileFromShip("Picard", makeShip([tac, sci, med]), email);
const runId = randomUUID();
const mid: GameState = {
  ...playing,
  runId,
  profileId: persisted.id,
  ship: {
    ...persisted.ship,
    integrity: 61,
    crew: persisted.crew,
    skills: persisted.skills,
  },
  universe: applyReputation(persisted.universe, { romulan: -12 }),
  phase: "playing",
  status: "active",
};
await writeSave(mid);
const afterSave = await updateProfileFromRun(mid, { clearActiveRun: false });
assert(afterSave?.activeRunId === runId, "mid-mission profile keeps activeRunId");
const reloaded = await loadProfile(persisted.id, email);
assert(reloaded?.ship.name === "USS Phase Eight", "reload restores ship");
assert(
  reloaded?.crew.filter((c) => (c.status || "active") !== "dead").length === 3,
  "reload restores living crew"
);
assert(
  reloaded?.skills.total.tactical === persisted.skills.total.tactical,
  "reload restores skill totals"
);
assert(
  reloaded?.universe.factionReputation.romulan ===
    mid.universe!.factionReputation.romulan,
  "reload restores universe standing"
);

// 8. Mid-mission resume still works when activeRunId present
const resumed = await readSave(reloaded!.activeRunId!, email);
assert(resumed?.phase === "playing", "activeRunId load resumes playing");
assert(resumed?.runId === runId, "resumed save matches activeRunId");
assert(resumed?.ship?.integrity === 61, "resumed hull matches mid-mission save");

// 9. LLM must not invent mechanical numbers (pack contract)
const core = readFileSync(path.join(ROOT, "content/skills/core-gm.md"), "utf8");
assert(/never invent/i.test(core) && /skill numbers/i.test(core), "core-gm forbids invented numbers");
assert(/mechanicalResults/i.test(core), "core-gm treats mechanicalResults as truth");

await deleteSave(runId, email);
await deleteProfile(persisted.id, email);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nPhase 8 checklist: all assertions passed");
