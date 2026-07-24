/**
 * GamemasterAgent (Narrator)
 * Setup: state machine + **AI-generated** Trek-aligned content (ships, missions, greetings).
 * Playing / freeform / debrief: **LLM only** — no mock narration fallbacks.
 * Code remains referee for dice, integrity, and tool application.
 */

import { randomUUID } from "node:crypto";
import type {
  Difficulty,
  GameState,
  MissionType,
  OptionRisk,
  TurnOption,
} from "../../../packages/game-core/src/index.js";
import { tracedTool } from "../debug/sessionDebugLog.js";
import {
  generateDebriefNarration,
  generateFreeformScene,
  generateOpeningScene,
  generatePlayScene,
  isLlmConfigured,
  type LlmScene,
  type MechanicalResults,
} from "./llmGamemaster.js";
import {
  formatShipChoices,
  generateCustomShip,
  generateDifficultyPrompt,
  generateMissionBrief,
  generateMissionOffers,
  generateMissionTypePrompt,
  generateOpeningGreeting,
  generateShipOffers,
  generateTutorialBeat,
  generateWelcomeAndTutorialOffer,
  missionFromOffer,
  shipOfferToShip,
  type SetupMissionOffer,
  type SetupShipOffer,
} from "./setupContent.js";

function numbered(options: string[]): TurnOption[] {
  return options.map((text, i) => ({
    id: i + 1,
    text,
    risk: i === options.length - 1 ? "trap" : i === options.length - 2 ? "high" : "medium",
  }));
}

function pushLog(state: GameState, kind: GameState["log"][0]["kind"], text: string): GameState {
  return {
    ...state,
    log: [
      ...state.log,
      { at: new Date().toISOString(), phase: state.phase, kind, text },
    ],
  };
}

/** Title-case names: "picard" → "Picard", "jean-luc picard" → "Jean-Luc Picard" */
function capitalizeName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          if (!part) return part;
          // Preserve all-caps short tokens (II, III) if already uppercase multi-letter roman-ish
          if (/^[IVXLCDM]+$/i.test(part) && part.length <= 5 && part === part.toUpperCase()) {
            return part.toUpperCase();
          }
          // O'brien / o'brien → O'Brien
          if (part.includes("'")) {
            return part
              .split("'")
              .map((p, i) =>
                p
                  ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
                  : p
              )
              .join("'");
          }
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join("-")
    )
    .join(" ");
}

/** Ensure custom Starfleet vessels use the USS registry prefix. */
function ensureUssShipName(raw: string): string {
  let name = capitalizeName(raw);
  // Strip a leading USS so we never double-prefix ("uss uss enterprise")
  name = name.replace(/^U\.?S\.?S\.?\s+/i, "").trim();
  if (!name) name = "Unnamed";
  return `USS ${name}`;
}

/** Resolve "1" / "2" into the full multiple-choice label for mission logs. */
export function resolveChoiceLabel(
  input: string,
  choices: TurnOption[] | null | undefined
): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Client often sends "1. Full option text" already — keep it as-is
  // so we never re-map the number onto a *later* choice list.
  if (/^\d+\.\s+\S/.test(trimmed)) {
    return trimmed;
  }

  const id = parseChoice(trimmed, choices);
  if (id != null && choices?.length) {
    const opt = choices.find((c) => c.id === id);
    if (opt?.text) {
      return `${opt.id}. ${opt.text}`;
    }
  }
  return trimmed;
}

function logPlayerChoice(
  state: GameState,
  input: string,
  choices: TurnOption[] | null | undefined = state.pendingChoices
): GameState {
  return pushLog(state, "player", resolveChoiceLabel(input, choices));
}

export async function advanceSetup(
  state: GameState,
  playerText: string
): Promise<GameState> {
  const input = playerText.trim();
  let next = { ...state };

  switch (state.phase) {
    case "boot":
    case "ask_name": {
      if (state.phase === "boot") {
        const greeting = await setupCall("opening greeting", () =>
          generateOpeningGreeting(next)
        );
        next = {
          ...next,
          phase: "ask_name",
          pendingQuestion: greeting,
          pendingChoices: null,
        };
        return pushLog(next, "narration", next.pendingQuestion!);
      }
      if (!input) {
        next.pendingQuestion =
          "I must know how to address you. What is your name, Captain?";
        return next;
      }
      const captainName = capitalizeName(input);
      next.playerName = captainName;
      const welcome = await setupCall("welcome", () =>
        generateWelcomeAndTutorialOffer(next, captainName)
      );
      next.phase = "tutorial_offer";
      next.pendingQuestion = welcome.narration;
      next.pendingChoices = numbered(welcome.choices);
      return logPlayerChoice(next, captainName, state.pendingChoices);
    }

    case "tutorial_offer": {
      const choice = parseChoice(input, next.pendingChoices);
      if (choice === 1) {
        next.settings = { ...next.settings, tutorialCompleted: false };
        const beat = await setupCall("tutorial", () =>
          generateTutorialBeat(next)
        );
        next.phase = "tutorial";
        next.pendingQuestion = beat.narration;
        next.pendingChoices = numbered(beat.choices);
        next.turn = {
          sceneId: "tutorial-1",
          narration: beat.narration,
          crewDialogue: [beat.crewLine],
          options: next.pendingChoices,
          viewscreenPrompt: beat.viewscreenPrompt,
        };
      } else if (choice === 2) {
        next = await goShipSelect(next);
      } else {
        next.pendingQuestion = "Please select option 1 or 2.";
      }
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "tutorial": {
      const choice = parseChoice(input, next.pendingChoices);
      if (!choice) {
        next.pendingQuestion = "Select a single numbered option (1 or 2).";
        return next;
      }
      next.settings = { ...next.settings, tutorialCompleted: true };
      if (choice === 2) {
        next = pushLog(
          next,
          "system",
          "Tutorial note: that was the riskier path. In a real mission, a d20 might decide the outcome — and failure can cost ship integrity."
        );
      } else {
        next = pushLog(
          next,
          "system",
          "Tutorial note: careful scanning is often the wiser first move. Dice still matter when stakes rise."
        );
      }
      next = await goShipSelect(next);
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "ship_select": {
      const ships = (next.setupShips || []) as SetupShipOffer[];
      const choice = parseChoice(input, next.pendingChoices);
      if (choice && choice >= 1 && choice <= ships.length) {
        next.ship = shipOfferToShip(ships[choice - 1]);
        next.setupShips = null;
        next = await goMissionType(next);
      } else if (choice === ships.length + 1 || /custom/i.test(input)) {
        next.phase = "ship_custom";
        next.setupNotes = [];
        next.setupShips = null;
        next.pendingQuestion =
          "A custom vessel, then. What shall we name her, Captain?";
        next.pendingChoices = null;
      } else {
        next.pendingQuestion =
          "Select a numbered ship, or choose the custom option.";
      }
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "ship_custom": {
      if (next.setupNotes.length === 0) {
        if (!input) {
          next.pendingQuestion = "What is your ship's name?";
          return next;
        }
        const shipName = ensureUssShipName(input);
        next.setupNotes = [shipName];
        next.pendingQuestion =
          "Select a ship class, or type another class name:";
        next.pendingChoices = numbered([
          "Galaxy class",
          "Intrepid class",
          "Constitution class",
          "Shepard class",
          "Other (type the class name)",
        ]);
        return logPlayerChoice(next, shipName, state.pendingChoices);
      }
      if (next.setupNotes.length === 1) {
        const classes = [
          "Galaxy class",
          "Intrepid class",
          "Constitution class",
          "Shepard class",
        ];
        const choice = parseChoice(input, next.pendingChoices);
        let className = input.trim();
        if (choice && choice <= 4) className = classes[choice - 1];
        else if (choice === 5) {
          next.pendingQuestion =
            "Type the class name for your vessel (e.g. Sovereign class).";
          next.pendingChoices = null;
          next.setupNotes = [...next.setupNotes, "__await_class__"];
          return logPlayerChoice(next, input, state.pendingChoices);
        }
        next.setupNotes = [...next.setupNotes, className];
        next.ship = await setupCall("custom ship", () =>
          generateCustomShip(next, next.setupNotes[0], className)
        );
        next = await goMissionType(next);
        return logPlayerChoice(next, input, state.pendingChoices);
      }
      // Free-typed class after selecting "Other"
      if (
        next.setupNotes.length === 2 &&
        next.setupNotes[1] === "__await_class__"
      ) {
        if (!input) {
          next.pendingQuestion = "Type the class name for your vessel.";
          return next;
        }
        const className = capitalizeName(input);
        next.setupNotes = [next.setupNotes[0], className];
        next.ship = await setupCall("custom ship", () =>
          generateCustomShip(next, next.setupNotes[0], className)
        );
        next = await goMissionType(next);
        return logPlayerChoice(next, className, state.pendingChoices);
      }
      return next;
    }

    case "mission_type": {
      const map: Record<number, MissionType> = {
        1: "science",
        2: "exploration",
        3: "search_rescue",
        4: "battle",
        5: "expanded",
      };
      const choice = parseChoice(input, next.pendingChoices);
      if (!choice || !map[choice]) {
        next.pendingQuestion = "Select a mission type by number.";
        return next;
      }
      next.missionType = map[choice];
      if (next.missionType === "expanded") {
        next.difficulty = "hardcore";
        next = await offerMissions(next);
      } else {
        next = await goDifficulty(next);
      }
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "difficulty": {
      const map: Record<number, Difficulty> = {
        1: "easy",
        2: "medium",
        3: "hard",
        4: "hardcore",
      };
      const choice = parseChoice(input, next.pendingChoices);
      if (!choice || !map[choice]) {
        next.pendingQuestion = "Select difficulty 1–4.";
        return next;
      }
      next.difficulty = map[choice];
      next = await offerMissions(next);
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "mission_offer": {
      if (/more/i.test(input)) {
        next = await offerMissions(next, true);
        return logPlayerChoice(next, input, state.pendingChoices);
      }
      const choice = parseChoice(input, next.pendingChoices);
      const offers = (next.missionOffers || []) as SetupMissionOffer[];
      if (!choice || choice < 1 || choice > offers.length) {
        next.pendingQuestion =
          "Select a mission by number, or type 'more' for new options.";
        return next;
      }
      const pick = offers[choice - 1];
      next.mission = missionFromOffer(
        toSetupMissionOffer(pick),
        next.difficulty || "medium"
      );
      next = await goMissionBrief(next);
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "mission_brief": {
      const choice = parseChoice(input, next.pendingChoices);
      if (choice === 2) {
        next = await offerMissions(next);
        return logPlayerChoice(next, input, state.pendingChoices);
      }
      if (choice === 1) {
        next = await startPlaying(next);
        return logPlayerChoice(next, input, state.pendingChoices);
      }
      next.pendingQuestion = "Select 1 to begin or 2 to return to the list.";
      return next;
    }

    case "playing": {
      // Handled by orchestrator play path
      return next;
    }

    case "debrief":
    case "post_mission": {
      const choice = parseChoice(input, next.pendingChoices);
      if (choice === 1 || /new mission/i.test(input)) {
        next.mission = null;
        next.turn = null;
        next.debrief = null;
        next.missionOffers = null;
        next.status = "active";
        if (next.ship) {
          const maxShield =
            next.ship.maxShieldIntegrity ?? next.ship.maxIntegrity;
          next.ship = {
            ...next.ship,
            integrity: Math.min(
              next.ship.maxIntegrity,
              next.ship.integrity + 25
            ),
            maxShieldIntegrity: maxShield,
            shieldIntegrity: Math.min(
              maxShield,
              (next.ship.shieldIntegrity ?? 0) + 30
            ),
            shieldGridOnline:
              next.ship.systems.shields !== "destroyed"
                ? true
                : false,
            shieldRechargeTurns: 0,
          };
        }
        next = await goMissionType(next);
      }
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    default:
      return next;
  }
}

/** Normalize a stored mission offer into a full SetupMissionOffer. */
function toSetupMissionOffer(
  pick: NonNullable<GameState["missionOffers"]>[number]
): SetupMissionOffer {
  return {
    id: pick.id,
    title: pick.title,
    summary: pick.summary,
    type: pick.type,
    location: pick.location || "Uncharted space",
    background: pick.background || pick.summary,
    main: pick.main || "Complete the primary Starfleet objective",
    secondaries:
      pick.secondaries && pick.secondaries.length
        ? pick.secondaries
        : ["Support allied vessels and uphold Federation principles"],
  };
}

async function setupCall<T>(purpose: string, fn: () => Promise<T>): Promise<T> {
  requireLlm();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LlmNarratorError) throw err;
    throw new LlmNarratorError(
      `Narrator failed to generate ${purpose}.`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function goShipSelect(state: GameState): Promise<GameState> {
  const { narration, ships } = await setupCall("ship offers", () =>
    generateShipOffers(state)
  );
  const formatted = formatShipChoices(ships, narration);
  return {
    ...state,
    phase: "ship_select",
    setupShips: ships,
    pendingQuestion: formatted.text,
    pendingChoices: formatted.choices,
    // Drop tutorial (or any prior) scene — no bridge crew until a ship is chosen
    turn: null,
  };
}

async function goMissionType(state: GameState): Promise<GameState> {
  const { narration, choices } = await setupCall("mission type prompt", () =>
    generateMissionTypePrompt(state)
  );
  return {
    ...state,
    phase: "mission_type",
    pendingQuestion: narration,
    pendingChoices: numbered(choices),
    turn: null,
  };
}

async function goDifficulty(state: GameState): Promise<GameState> {
  const { narration, choices } = await setupCall("difficulty prompt", () =>
    generateDifficultyPrompt(state)
  );
  return {
    ...state,
    phase: "difficulty",
    pendingQuestion: narration,
    pendingChoices: numbered(choices),
    turn: null,
  };
}

async function offerMissions(
  state: GameState,
  reshuffle = false
): Promise<GameState> {
  const { narration, offers } = await setupCall("mission offers", () =>
    generateMissionOffers(state, reshuffle)
  );
  return {
    ...state,
    phase: "mission_offer",
    missionOffers: offers,
    pendingQuestion: narration,
    pendingChoices: numbered(offers.map((o) => o.title)),
    turn: null,
  };
}

async function goMissionBrief(state: GameState): Promise<GameState> {
  const { narration, choices } = await setupCall("mission brief", () =>
    generateMissionBrief(state)
  );
  return {
    ...state,
    phase: "mission_brief",
    pendingQuestion: narration,
    pendingChoices: numbered(choices),
    turn: null,
  };
}

/** Thrown when the Narrator LLM cannot produce a scene — never fall back to mock text. */
export class LlmNarratorError extends Error {
  status = 503;
  reason: string;
  detail?: string;

  constructor(reason: string, detail?: string) {
    super(reason);
    this.name = "LlmNarratorError";
    this.reason = reason;
    this.detail = detail;
  }
}

function requireLlm(): void {
  if (!isLlmConfigured()) {
    throw new LlmNarratorError(
      "Narrator LLM is not configured.",
      "Set a valid XAI_API_KEY in .env and restart the server."
    );
  }
}

async function requireScene(
  scene: LlmScene | null,
  purpose: string
): Promise<LlmScene> {
  if (!scene || !scene.usedLlm || !scene.narration?.trim()) {
    throw new LlmNarratorError(
      `Narrator failed to generate ${purpose}.`,
      "The LLM returned no usable scene. Check API credits, model access, and debug logs."
    );
  }
  return scene;
}

async function startPlaying(state: GameState): Promise<GameState> {
  requireLlm();
  let next: GameState = {
    ...state,
    phase: "playing",
  };

  const scene = await requireScene(
    await generateOpeningScene(next),
    "mission opening"
  );
  next = applySceneSideEffects(next, scene);

  next = {
    ...next,
    pendingQuestion: scene.narration,
    pendingChoices: scene.options,
    turn: {
      sceneId: randomUUID(),
      narration: scene.narration,
      crewDialogue: scene.crewDialogue,
      options: scene.options,
      viewscreenPrompt: scene.viewscreenPrompt,
    },
  };
  return next;
}

/**
 * Resolve a play turn:
 * - Numbered option → dice/integrity referee + LLM scene
 * - Free text (question or custom order) → LLM freeform
 * - No mock narration — LLM required
 */
export async function resolvePlayTurn(
  state: GameState,
  playerText: string
): Promise<GameState> {
  requireLlm();
  const input = playerText.trim();
  if (!input) {
    return {
      ...state,
      pendingQuestion:
        state.pendingQuestion ||
        "The bridge is waiting, Captain. Choose a numbered option or type a question/order.",
    };
  }

  const choice = parseChoice(
    input,
    state.turn?.options || state.pendingChoices
  );

  // Free-text path: questions or custom orders (not a listed option)
  if (!choice) {
    return resolveFreeformTurn(state, input);
  }

  const option = (state.turn?.options || []).find((o) => o.id === choice);
  let next = logPlayerChoice(state, input, state.turn?.options || state.pendingChoices);
  next = bumpPlayTurn(next);

  const mechanical = await applyMechanics(
    next,
    option?.text || input,
    option?.risk || "medium"
  );
  next = mechanical.state;

  // Ship destroyed mid-resolution
  if (next.phase === "debrief") {
    return await finishMission(next, false, mechanical.results);
  }

  const scene = await requireScene(
    await generatePlayScene(next, mechanical.results),
    "play turn"
  );

  return finalizePlayScene(next, scene, mechanical.results);
}

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.includes("?")) return true;
  return /^(who|what|where|when|why|how|can |could |would |should |is |are |am |do |does |did |will |have |has |tell me|status|report|explain|describe|any intel|sensors)\b/i.test(
    t
  );
}

async function resolveFreeformTurn(
  state: GameState,
  input: string
): Promise<GameState> {
  let next = pushLog(state, "player", input);
  const isQuestion = looksLikeQuestion(input);

  let mechanical: MechanicsOutcome | null = null;

  // Custom orders (not questions) get light referee mechanics + count as a play turn
  if (!isQuestion) {
    next = bumpPlayTurn(next);
    mechanical = await applyMechanics(next, input, "medium");
    next = mechanical.state;
    if (next.phase === "debrief") {
      return await finishMission(next, false, mechanical.results);
    }
  } else {
    // Record a no-op mechanical snapshot for the LLM
    mechanical = {
      state: next,
      results: {
        playerAction: input,
        risk: "low",
        roll: null,
        integrityBefore: next.ship?.integrity ?? 100,
        integrityAfter: next.ship?.integrity ?? 100,
        integrityDelta: 0,
        systemChanges: [],
        flagsAdded: [],
        notes: [
          "Free-text QUESTION — no dice; answer with known ship intel only.",
        ],
      },
    };
  }

  let scene = await requireScene(
    await generateFreeformScene(next, input, mechanical?.results ?? null),
    "freeform reply"
  );

  // Prefer keeping prior options if freeform question returned unusable options
  if (
    isQuestion &&
    scene.options.length < 3 &&
    (next.turn?.options?.length || 0) >= 3
  ) {
    scene = { ...scene, options: next.turn!.options! };
  }

  // Questions should not end the mission via freeform
  if (isQuestion) {
    scene = { ...scene, endMission: null };
  }

  return finalizePlayScene(
    next,
    scene,
    mechanical?.results ?? {
      playerAction: input,
      risk: "low",
      roll: null,
      integrityBefore: next.ship?.integrity ?? 100,
      integrityAfter: next.ship?.integrity ?? 100,
      integrityDelta: 0,
      systemChanges: [],
      flagsAdded: [],
      notes: [],
    }
  );
}

/** Count only real play actions after mission start (not Accept). */
function bumpPlayTurn(state: GameState): GameState {
  if (!state.mission) return state;
  return {
    ...state,
    mission: {
      ...state.mission,
      playTurnCount: (state.mission.playTurnCount || 0) + 1,
    },
  };
}

/**
 * Prevent the LLM (or old turn-count hack) from ending the mission too early.
 * - success: need enough play, or main already completed
 * - failed: allow if ship is badly hurt, else need a few turns
 * - never auto-success just because a crit rolled
 */
function clampEndMission(
  requested: LlmScene["endMission"],
  state: GameState
): LlmScene["endMission"] {
  if (!requested) return null;
  const turns = state.mission?.playTurnCount ?? 0;
  const integrity = state.ship?.integrity ?? 100;
  const main = state.mission?.objectives.find((o) => o.kind === "main");
  const mainDone = main?.status === "completed";
  const mainFailed = main?.status === "failed";

  if (requested === "success") {
    if (mainDone) return "success";
    // Require a real mission arc before declaring victory
    if (turns < 6) return null;
    return "success";
  }

  if (requested === "failed") {
    if (mainFailed || integrity <= 0) return "failed";
    if (integrity <= 15 && turns >= 3) return "failed";
    if (turns < 5) return null;
    return "failed";
  }

  return null;
}

async function finalizePlayScene(
  state: GameState,
  scene: LlmScene,
  mechanical: MechanicalResults
): Promise<GameState> {
  let next = applySceneSideEffects(state, scene);

  // Safety valve only — very long missions, never a short auto-win
  const turns = next.mission?.playTurnCount ?? 0;
  const safetyEnd =
    turns >= 20 ? ("success" as const) : null;

  const endMission =
    clampEndMission(scene.endMission, next) || safetyEnd;

  if (endMission === "success" || endMission === "failed") {
    if (endMission === "success" && next.mission) {
      next.mission = {
        ...next.mission,
        status: "success",
        objectives: next.mission.objectives.map((o) =>
          o.kind === "main" && o.status === "active"
            ? { ...o, status: "completed" }
            : o
        ),
      };
    }
    if (endMission === "failed" && next.mission) {
      next.mission = { ...next.mission, status: "failed" };
    }
    return finishMission(next, endMission === "success", mechanical);
  }

  next.turn = {
    sceneId: randomUUID(),
    narration: scene.narration,
    crewDialogue: scene.crewDialogue,
    options: scene.options,
    viewscreenPrompt: scene.viewscreenPrompt,
    lastRoll: next.turn?.lastRoll,
  };
  next.pendingQuestion = scene.narration;
  next.pendingChoices = scene.options;
  next = pushLog(next, "narration", scene.narration);
  return next;
}

type MechanicsOutcome = {
  state: GameState;
  results: MechanicalResults;
};

async function applyMechanics(
  state: GameState,
  playerAction: string,
  risk: OptionRisk | string
): Promise<MechanicsOutcome> {
  const {
    toolRollD20,
    toolUpdateIntegrity,
    toolSetSystem,
    toolDivertPowerToShields,
  } = await import("../tools/registry.js");
  const {
    classifyDamageKind,
    evaluateSystemConstraints,
    normalizeShip,
    tickShieldRecharge,
  } = await import("../../../packages/game-core/src/index.js");

  let next = state;
  const systemChanges: string[] = [];
  const flagsAdded: string[] = [];
  const notes: string[] = [];
  let rollData: MechanicalResults["roll"] = null;

  // Normalize ship + tick shield recharge at the start of every mechanical beat
  if (next.ship) {
    let ship = normalizeShip(next.ship);
    const tick = tickShieldRecharge(ship);
    ship = tick.ship;
    next = { ...next, ship };
    if (tick.note) notes.push(tick.note);
  }

  // Divert power to shields (explicit order)
  if (
    next.ship &&
    /divert.*(?:power|energy).*shield|reinforce (?:the )?shield|emergency shield|power to (?:the )?shield/i.test(
      playerAction
    )
  ) {
    const div = toolDivertPowerToShields(next);
    if (div.state) next = div.state;
    notes.push(div.message);
  }

  // System constraints change dice difficulty / block impossible orders
  const constraints = next.ship
    ? evaluateSystemConstraints(playerAction, next.ship.systems)
    : [];
  const blocked = constraints.filter((c) => c.severity === "blocked");
  const impaired = constraints.filter((c) => c.severity === "impaired");
  for (const c of constraints) notes.push(c.note);

  let effectiveRisk = risk;
  let actionModifier = 0;
  if (blocked.length) {
    // Order depends on destroyed systems — treat as trap-level failure risk
    effectiveRisk = "trap";
    actionModifier = 4;
    notes.push(
      "Order relies on destroyed systems — attempt is desperate and likely to fail."
    );
    flagsAdded.push("system_blocked_order");
  } else if (impaired.length) {
    actionModifier += impaired.length * 2;
    if (risk === "low") effectiveRisk = "medium";
    else if (risk === "medium") effectiveRisk = "high";
    notes.push("Damaged systems raise the difficulty of this action.");
  }

  // Life support damaged: everything is harder
  if (next.ship?.systems.lifeSupport === "damaged") {
    actionModifier += 1;
    notes.push("Life support strain is fraying crew performance.");
  } else if (next.ship?.systems.lifeSupport === "destroyed") {
    actionModifier += 3;
    notes.push("Life support offline — the crew is fighting for air and time.");
    flagsAdded.push("life_support_critical");
  }

  let integrityDelta = 0;
  const damageKind = classifyDamageKind(playerAction);

  if (effectiveRisk === "low") {
    notes.push(
      "Measured approach: sensors improve the picture; low immediate risk."
    );
    if (next.mission && next.ship?.systems.sensors !== "destroyed") {
      next = {
        ...next,
        mission: {
          ...next.mission,
          knownIntel: [
            ...next.mission.knownIntel,
            next.ship?.systems.sensors === "damaged"
              ? "Partial sensor map (arrays damaged)"
              : "Detailed sensor map acquired",
          ],
        },
      };
    } else if (next.ship?.systems.sensors === "destroyed") {
      notes.push("Sensors offline — no new intel from this scan.");
    }
  } else if (effectiveRisk === "medium") {
    const roll = tracedTool(
      next.runId,
      next.phase,
      "roll_d20",
      { reason: playerAction, actionModifier, risk: effectiveRisk },
      toolRollD20(next, playerAction, actionModifier)
    );
    if (roll.state) next = roll.state;
    rollData = next.turn?.lastRoll ? { ...next.turn.lastRoll } : null;
    if (roll.data?.success) {
      notes.push("d20 success on a moderate action.");
    } else {
      notes.push("d20 failure on a moderate action — minor setback.");
      integrityDelta = 5 + (impaired.length ? 3 : 0);
    }
  } else if (effectiveRisk === "high") {
    const roll = tracedTool(
      next.runId,
      next.phase,
      "roll_d20",
      { reason: playerAction, actionModifier: actionModifier + 2, risk: effectiveRisk },
      toolRollD20(next, playerAction, actionModifier + 2)
    );
    if (roll.state) next = roll.state;
    rollData = next.turn?.lastRoll ? { ...next.turn.lastRoll } : null;
    const critical = roll.data?.critical;
    if (critical === "success") {
      notes.push("Critical success on high-risk action.");
      notes.push("force_success");
    } else if (critical === "failure") {
      notes.push("Critical failure on high-risk action.");
      integrityDelta = 25;
      flagsAdded.push("critical_failure_event");
    } else if (roll.data?.success) {
      notes.push("High-risk action succeeded.");
      // Even success in combat can graze the ship
      if (/fire|attack|torpedo|phaser|combat|engage|volley/.test(playerAction.toLowerCase())) {
        integrityDelta = 4;
      }
    } else {
      notes.push("High-risk action failed.");
      integrityDelta = 15 + impaired.length * 2;
    }
  } else {
    // trap
    const roll = tracedTool(
      next.runId,
      next.phase,
      "roll_d20",
      { reason: playerAction, actionModifier: actionModifier + 3, risk: effectiveRisk },
      toolRollD20(next, playerAction, actionModifier + 3)
    );
    if (roll.state) next = roll.state;
    rollData = next.turn?.lastRoll ? { ...next.turn.lastRoll } : null;
    notes.push("Trap/risky impulse path resolved by dice.");
    integrityDelta = roll.data?.success ? 10 : 20 + impaired.length * 3;
    flagsAdded.push("chose_trap_option");
    if (blocked.length) {
      integrityDelta += 5;
      notes.push("Destroyed systems made the attempt even more punishing.");
    }
  }

  const integrityBefore = next.ship?.integrity ?? 100;
  const shieldsBefore = next.ship?.shieldIntegrity ?? 100;

  if (integrityDelta > 0 && next.ship) {
    const dmg = tracedTool(
      next.runId,
      next.phase,
      "update_ship_integrity",
      {
        amount: integrityDelta,
        note: playerAction.slice(0, 80),
        kind: damageKind,
      },
      toolUpdateIntegrity(
        next,
        integrityDelta,
        playerAction.slice(0, 80),
        damageKind
      )
    );
    if (dmg.state) next = dmg.state;
    if (Array.isArray(dmg.data?.events)) {
      for (const e of dmg.data.events as string[]) notes.push(e);
    }
    if (dmg.data?.systemHit) {
      const hit = dmg.data.systemHit as {
        key: string;
        from: string;
        to: string;
      };
      systemChanges.push(`${hit.key} → ${hit.to}`);
    }
  }

  // Extra system stress if life support / warp already damaged and we took hull hits
  if (
    next.ship &&
    integrityDelta >= 15 &&
    next.ship.systems.warp === "damaged" &&
    Math.random() < 0.35
  ) {
    const sys = toolSetSystem(next, "warp", "destroyed");
    if (sys.state) {
      next = sys.state;
      systemChanges.push("warp → destroyed");
      notes.push("Warp nacelles fail completely under the strain.");
    }
  }

  for (const flag of flagsAdded) {
    tracedTool(
      next.runId,
      next.phase,
      "set_mission_flag",
      { flag },
      { ok: true, message: `Flag set: ${flag}` }
    );
    if (next.mission) {
      next = {
        ...next,
        mission: {
          ...next.mission,
          flags: [...new Set([...next.mission.flags, flag])],
        },
      };
    }
  }

  const integrityAfter = next.ship?.integrity ?? integrityBefore;
  const shieldsAfter = next.ship?.shieldIntegrity ?? shieldsBefore;
  if (shieldsBefore !== shieldsAfter) {
    notes.push(
      `Shields ${shieldsBefore} → ${shieldsAfter}` +
        (next.ship && !next.ship.shieldGridOnline ? " (grid offline)" : "")
    );
  } else if (integrityDelta > 0 && integrityAfter < integrityBefore) {
    // Hull moved but shields didn't — explain why (bypass / offline / already empty)
    if (next.ship && !next.ship.shieldGridOnline) {
      notes.push("Hull took the hit with shields offline.");
    }
  }

  return {
    state: next,
    results: {
      playerAction,
      risk: effectiveRisk,
      roll: rollData,
      integrityBefore,
      integrityAfter,
      integrityDelta: integrityBefore - integrityAfter,
      systemChanges,
      flagsAdded,
      notes,
    },
  };
}

function applySceneSideEffects(state: GameState, scene: LlmScene): GameState {
  let next = state;
  if (!next.mission) return next;

  let knownIntel = [...next.mission.knownIntel];
  for (const intel of scene.newIntel) {
    if (!knownIntel.includes(intel)) knownIntel.push(intel);
  }

  let flags = [...next.mission.flags];
  for (const flag of scene.setFlags) {
    if (!flags.includes(flag)) {
      flags.push(flag);
      tracedTool(
        next.runId,
        next.phase,
        "set_mission_flag",
        { flag, source: "llm" },
        { ok: true, message: `Flag set: ${flag}` }
      );
    }
  }

  let objectives = next.mission.objectives.map((o) => {
    const update = scene.objectiveUpdates.find((u) => u.id === o.id);
    return update ? { ...o, status: update.status } : o;
  });

  next = {
    ...next,
    mission: {
      ...next.mission,
      knownIntel,
      flags,
      objectives,
    },
  };
  return next;
}

async function finishMission(
  state: GameState,
  success: boolean,
  mechanical?: MechanicalResults
): Promise<GameState> {
  requireLlm();
  let next = { ...state, phase: "debrief" as const, status: "completed" as const };
  if (next.mission) {
    // Finalize objectives so the bridge never shows [active] after the mission ends
    const objectives = next.mission.objectives.map((o) => {
      if (o.status !== "active") return o;
      if (success) {
        // Main goals complete on success; secondaries left incomplete stay "missed"
        return {
          ...o,
          status: o.kind === "main" ? ("completed" as const) : ("missed" as const),
        };
      }
      // Failure: open main goals failed; open secondaries missed
      return {
        ...o,
        status: o.kind === "main" ? ("failed" as const) : ("missed" as const),
      };
    });
    next.mission = {
      ...next.mission,
      status: success ? "success" : "failed",
      objectives,
    };
  }

  const llmDebrief = await generateDebriefNarration(next, success);
  if (!llmDebrief?.trim()) {
    throw new LlmNarratorError(
      "Narrator failed to generate mission debrief.",
      "The LLM returned no debrief text."
    );
  }

  const debrief = [
    success ? "=== Mission Successful ===" : "=== Mission Failed ===",
    "",
    llmDebrief.trim(),
    "",
    buildDebriefStats(next),
    "",
    "Select an option to continue.",
  ].join("\n");

  next.debrief = debrief;
  next.pendingQuestion = debrief;
  next.pendingChoices = numbered(["New mission", "Remain on debrief"]);
  next.turn = {
    sceneId: randomUUID(),
    narration: debrief,
    crewDialogue: [
      {
        speaker: next.ship?.crew[0]?.name || "First Officer",
        line: success
          ? "Mission archived, Captain. The crew awaits your next command."
          : "We did what we could, Captain. The log will remember this day.",
      },
    ],
    options: next.pendingChoices,
    viewscreenPrompt: success
      ? "Quiet stars from orbit after a hard-fought mission"
      : "Damaged starship drifting, emergency lights, solemn mood",
    lastRoll: next.turn?.lastRoll ?? mechanical?.roll ?? undefined,
  };
  return pushLog(next, "debrief", debrief);
}

function buildDebriefStats(state: GameState): string {
  const ship = state.ship;
  const mission = state.mission;
  const objs =
    mission?.objectives
      .map((o) => `- [${o.status}] ${o.title}`)
      .join("\n") || "n/a";
  return [
    mission ? `Mission: ${mission.title}` : "",
    ship
      ? `Ship: ${ship.name}${ship.registryNumber ? ` ${ship.registryNumber}` : ""} — hull ${ship.integrity}/${ship.maxIntegrity}; shields ${ship.shieldIntegrity ?? "?"}/${ship.maxShieldIntegrity ?? "?"} (${ship.shieldGridOnline === false ? "offline" : "online"})`
      : "",
    ship?.scars.length
      ? `Damage log: ${ship.scars.join("; ")}`
      : "Damage log: none recorded",
    "",
    "Objectives:",
    objs,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseChoice(
  input: string,
  choices: TurnOption[] | null | undefined
): number | null {
  const m = input.match(/^(\d+)\b/);
  if (m) {
    const n = Number(m[1]);
    if (!choices || choices.some((c) => c.id === n)) return n;
    if (!choices) return n;
  }
  if (choices) {
    const found = choices.find(
      (c) => c.text.toLowerCase() === input.toLowerCase()
    );
    if (found) return found.id;
  }
  return null;
}
