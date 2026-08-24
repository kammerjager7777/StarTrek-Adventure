/**
 * Phase 5 crew-advice referee (no LLM, no dice, no playTurnCount).
 * Run: npm run test:advice
 */
import {
  applyAdviceToState,
  buildAdviceSnapshot,
  gateCrewAdvice,
  mergeSuggestedOption,
  parseAdviceScene,
} from "../packages/game-core/src/advice.ts";
import type { CrewMember, GameState, Ship, Turn } from "../packages/game-core/src/types.ts";

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

const worf: CrewMember = {
  id: "c-tac",
  name: "Worf",
  role: "Tactical Officer",
  status: "active",
  personality: "Honorable, blunt",
  skills: { tactical: 70 },
  loyalty: 80,
  serviceTurns: 6,
};
const data: CrewMember = {
  id: "c-ops",
  name: "Data",
  role: "Operations Officer",
  status: "active",
  personality: "Curious, precise",
};
const yar: CrewMember = {
  id: "c-sec",
  name: "Yar",
  role: "Security Chief",
  status: "dead",
  deathCause: "armus",
};

function makeTurn(): Turn {
  return {
    sceneId: "scene-1",
    narration: "A Klingon bird-of-prey decloaks off the bow.",
    crewDialogue: [{ speaker: "Data", line: "They are charging weapons." }],
    options: [
      { id: 1, text: "Raise shields", risk: "low" },
      { id: 2, text: "Hail them", risk: "medium" },
      { id: 3, text: "Target disruptors", risk: "high" },
    ],
    lastRoll: {
      die: 12,
      threshold: 10,
      success: true,
      critical: "none",
      reason: "prior",
    },
  };
}

function makeShip(crew: CrewMember[]): Ship {
  return {
    id: "s1",
    name: "USS Advice",
    registryNumber: "NCC-A1",
    className: "Galaxy",
    era: "24th",
    stardate: "47457.1",
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
    scars: ["port nacelle scoring"],
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const now = new Date().toISOString();
  const turn = makeTurn();
  return {
    runId: "run-advice",
    createdAt: now,
    updatedAt: now,
    status: "active",
    phase: "playing",
    playerName: "Picard",
    ownerEmail: "advice-smoke@example.com",
    difficulty: "medium",
    missionType: "battle",
    ship: makeShip([worf, data, yar]),
    mission: {
      id: "m1",
      title: "Skirmish",
      type: "battle",
      difficulty: "medium",
      background: "",
      brief: "",
      location: "Neutral Zone",
      objectives: [],
      status: "active",
      knownIntel: ["Bird-of-prey decloaked"],
      flags: ["klingon_contact"],
      playTurnCount: 0,
    },
    turn,
    log: [],
    settings: {
      speechOn: false,
      imagesOn: false,
      tutorialCompleted: true,
      voiceMode: "off",
      viewscreenEnabled: false,
    },
    viewscreen: { playlist: [], activeIndex: -1, generating: false, lastError: null },
    pendingQuestion: turn.narration,
    pendingChoices: turn.options,
    setupNotes: [],
    missionOffers: null,
    debrief: null,
    ...overrides,
  };
}

assert(gateCrewAdvice(makeState(), "missing").ok === false, "unknown officer is refused");
assert(
  gateCrewAdvice(makeState(), "c-sec").error?.includes("dead"),
  "dead officer cannot advise"
);
assert(gateCrewAdvice(makeState(), "c-tac").ok === true, "active officer may advise at turn 0");

const first = applyAdviceToState(
  makeState(),
  worf,
  {
    narration: "Worf studies the tactical board.",
    advice: "Raise shields and stand ready to fire, Captain.",
    suggestedOption: { text: "Lock phasers, hold fire", risk: "medium" },
  },
  "Should we fire?"
);

assert(first.mission?.playTurnCount === 0, "advice does not increment playTurnCount");
assert(first.turn?.lastRoll?.die === 12, "advice does not touch lastRoll / dice");
assert(first.lastAdvice?.memberId === "c-tac", "lastAdvice cache set");
assert(first.lastAdvice?.question === "Should we fire?", "question stored on lastAdvice");
assert(first.adviceCooldowns?.["c-tac"] === 0, "cooldown recorded at turn 0");
assert(
  first.turn?.crewDialogue?.some((l) => l.speaker === "Worf"),
  "officer line appended to crewDialogue"
);
assert(
  first.pendingChoices?.some((o) => o.text === "Lock phasers, hold fire"),
  "suggested option merged into choices"
);
assert(
  (first.pendingChoices?.length || 0) === 4,
  "suggested option is an extra choice, not a replacement"
);

const blocked = gateCrewAdvice(first, "c-tac");
assert(blocked.ok === false, "same officer cannot advise twice on turn 0");
assert(gateCrewAdvice(first, "c-ops").ok === true, "other officer can still advise this turn");

const later = gateCrewAdvice(
  { ...first, mission: { ...first.mission!, playTurnCount: 1 } },
  "c-tac"
);
assert(later.ok === true, "same officer can advise again after a play turn");

const snap = buildAdviceSnapshot(makeState(), worf, "Open fire?");
assert(snap.scars.includes("port nacelle scoring"), "snapshot includes ship scars");
assert(
  snap.deaths.some((d) => d.name === "Yar"),
  "snapshot includes recorded deaths"
);
assert(snap.question === "Open fire?", "snapshot passes the captain's question");
assert(
  snap.situation.mission?.knownIntel?.includes("Bird-of-prey decloaked"),
  "snapshot includes knownIntel"
);

const parsed = parseAdviceScene(
  '{"narration":"A nod.","advice":"Hold fire.","suggestedOption":{"text":"Wait","risk":"low"}}',
  "Worf"
);
assert(parsed.advice === "Hold fire.", "parseAdviceScene reads advice");
assert(parsed.suggestedOption?.risk === "low", "parseAdviceScene reads risk");

const raw = parseAdviceScene("We should hail them, Captain.", "Worf");
assert(raw.advice.includes("hail"), "parseAdviceScene falls back to raw text");

const dup = mergeSuggestedOption(
  [{ id: 1, text: "Hail them", risk: "low" }],
  { text: "hail them", risk: "medium" }
);
assert(dup?.length === 1, "duplicate suggested option is skipped");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nPhase 5 crew advice: all assertions passed");
