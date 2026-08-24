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
import {
  applyReputation,
  capitalizeName,
  formatCampaignLog,
  interpretCaptainName,
  starbaseHubChoices,
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
  fallbackMissionOffers,
  formatShipChoices,
  generateCustomShip,
  generateMissionBrief,
  generateMissionOffers,
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

function wantsReturnToDock(input: string): boolean {
  return /return to (starbase|dock|hub)|back to (the )?(starbase|dock|hub)/i.test(
    input
  );
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
      const captainName = interpretCaptainName(input);
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
        next = await dockAtStarbase(
          next,
          "Ship commissioned. Choose your next mission when ready."
        );
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
        next = await dockAtStarbase(
          next,
          "Ship commissioned. Choose your next mission when ready."
        );
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
        next = await dockAtStarbase(
          next,
          "Ship commissioned. Choose your next mission when ready."
        );
        return logPlayerChoice(next, className, state.pendingChoices);
      }
      return next;
    }

    case "mission_type": {
      if (wantsReturnToDock(input)) {
        return logPlayerChoice(
          await hydrateStarbase(next, "Returned to dock."),
          input,
          state.pendingChoices
        );
      }
      const map: Record<number, MissionType> = {
        1: "science",
        2: "exploration",
        3: "search_rescue",
        4: "battle",
        5: "expanded",
      };
      const choice = parseChoice(input, next.pendingChoices);
      const fromText = parseMissionTypeInput(input);
      if ((!choice || !map[choice]) && !fromText) {
        next.pendingQuestion = "Select a mission type by number.";
        return next;
      }
      next.missionType = (choice && map[choice] ? map[choice] : fromText)!;
      if (next.missionType === "expanded") {
        next.difficulty = "hardcore";
        next = await offerMissions(next);
      } else {
        next = await goDifficulty(next);
      }
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "difficulty": {
      if (wantsReturnToDock(input)) {
        return logPlayerChoice(
          await hydrateStarbase(next, "Returned to dock."),
          input,
          state.pendingChoices
        );
      }
      const map: Record<number, Difficulty> = {
        1: "easy",
        2: "medium",
        3: "hard",
        4: "hardcore",
      };
      const choice = parseChoice(input, next.pendingChoices);
      const fromText = parseDifficultyInput(input);
      if ((!choice || !map[choice]) && !fromText) {
        next.pendingQuestion = "Select difficulty 1–4.";
        return next;
      }
      next.difficulty = (choice && map[choice] ? map[choice] : fromText)!;
      next = await offerMissions(next);
      return logPlayerChoice(next, input, state.pendingChoices);
    }

    case "mission_offer": {
      if (wantsReturnToDock(input)) {
        return logPlayerChoice(
          await hydrateStarbase(next, "Returned to dock."),
          input,
          state.pendingChoices
        );
      }
      if (/more/i.test(input)) {
        next = await offerMissions(next, true);
        return logPlayerChoice(next, input, state.pendingChoices);
      }
      const typeChange = input.match(
        /^type:\s*(.+)$/i
      );
      if (typeChange) {
        const nextType = parseMissionTypeInput(typeChange[1]);
        if (!nextType) {
          next.pendingQuestion = "Unknown assignment type.";
          return next;
        }
        next.missionType = nextType;
        if (nextType === "expanded") next.difficulty = "hardcore";
        next = await offerMissions(next, true);
        return logPlayerChoice(next, input, state.pendingChoices);
      }
      const diffChange = input.match(/^difficulty:\s*(.+)$/i);
      if (diffChange) {
        const nextDiff = parseDifficultyInput(diffChange[1]);
        if (!nextDiff) {
          next.pendingQuestion = "Unknown difficulty.";
          return next;
        }
        next.difficulty = nextDiff;
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
      if (wantsReturnToDock(input)) {
        return logPlayerChoice(
          await hydrateStarbase(next, "Returned to dock."),
          input,
          state.pendingChoices
        );
      }
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
    case "starbase": {
      return handleStarbase(next, input, state);
    }

    case "post_mission":
      // Save & stand down is terminal for this run — Continue your story starts a new one.
      return next;

    default:
      return next;
  }
}

async function handleStarbase(
  state: GameState,
  input: string,
  prev: GameState
): Promise<GameState> {
  let next = await attachCampaignLog(await ensureStarbaseSession(state));
  const choice = parseChoice(input, next.pendingChoices);
  const text = input.trim().toLowerCase();
  const session = next.starbase!;
  const labels = starbaseChoiceLabels(next);

  // Resolve by choice id or keyword
  const pickLabel =
    choice && labels[choice - 1] ? labels[choice - 1].toLowerCase() : text;

  // Choose next mission
  if (
    /choose next mission|begin another|new mission|next mission/i.test(pickLabel) ||
    /choose next mission|begin another|new mission|next mission/i.test(text)
  ) {
    return leaveStarbaseForMission(next, input, prev);
  }

  // View campaign log (no budgets, no play turn)
  if (/view campaign log|campaign log/i.test(pickLabel) || /campaign log/i.test(text)) {
    const logText = formatCampaignLog(next.campaignLog);
    return paintStarbase(next, logText, prev, input);
  }

  // Save & stand down
  if (
    /save and stand|stand down|save &|exit|quit/i.test(pickLabel) ||
    /save|stand down|exit|quit/i.test(text)
  ) {
    try {
      const { updateProfileFromRun } = await import("../store/profileStore.js");
      await updateProfileFromRun(next, { clearActiveRun: true });
    } catch {
      /* ignore */
    }
    next = {
      ...next,
      status: "completed",
      phase: "post_mission",
      starbase: null,
      pendingQuestion:
        "Campaign saved, Captain. Your ship and crew wait at starbase. Use Continue on the home screen to resume.",
      pendingChoices: numbered(["Acknowledged"]),
    };
    return logPlayerChoice(next, input, prev.pendingChoices);
  }

  // Deep structural refit (heavy damage)
  if (
    /deep (structural )?refit|structural deep|yard deep/i.test(pickLabel) ||
    /deep (structural )?refit|structural deep/i.test(text)
  ) {
    const { deepStructuralRefit } = await import(
      "../../../packages/game-core/src/index.js"
    );
    if (!next.ship) return paintStarbase(next, "No ship docked.", prev, input);
    const r = deepStructuralRefit(next.ship, session);
    next = {
      ...next,
      ship: r.ship || next.ship,
      starbase: r.session,
    };
    return paintStarbase(next, r.message, prev, input);
  }

  // Hull refit
  if (/refit hull|hull refit|repair hull/i.test(pickLabel) || /refit hull|repair hull/i.test(text)) {
    const { refitHull } = await import("../../../packages/game-core/src/index.js");
    if (!next.ship) return paintStarbase(next, "No ship docked.", prev, input);
    const r = refitHull(next.ship, session);
    next = {
      ...next,
      ship: r.ship || next.ship,
      starbase: r.session,
    };
    return paintStarbase(next, r.message, prev, input);
  }

  // Shield refit
  if (
    /refit shield|shield recharge|restore shield|recharge shield/i.test(pickLabel) ||
    /refit shield|shield recharge|restore shield/i.test(text)
  ) {
    const { refitShields } = await import(
      "../../../packages/game-core/src/index.js"
    );
    if (!next.ship) return paintStarbase(next, "No ship docked.", prev, input);
    const r = refitShields(next.ship, session);
    next = {
      ...next,
      ship: r.ship || next.ship,
      starbase: r.session,
    };
    return paintStarbase(next, r.message, prev, input);
  }

  // Repair system: "Repair: Shields" or choice text
  const repairMatch =
    pickLabel.match(/repair[:\s]+([a-z\s]+)/i) ||
    text.match(/repair[:\s]+([a-z\s]+)/i);
  if (repairMatch && next.ship) {
    const raw = repairMatch[1].trim().toLowerCase().replace(/\s*\(.*/, "");
    const keyMap: Record<string, keyof import("../../../packages/game-core/src/types.js").ShipSystems> = {
      shields: "shields",
      shield: "shields",
      "shield array": "shields",
      torpedoes: "torpedoes",
      torpedo: "torpedoes",
      warp: "warp",
      nacelles: "warp",
      communications: "communications",
      comms: "communications",
      sensors: "sensors",
      "life support": "lifeSupport",
      lifesupport: "lifeSupport",
    };
    const sysKey = keyMap[raw] || (raw as keyof import("../../../packages/game-core/src/types.js").ShipSystems);
    const { repairSystemAtStarbase } = await import(
      "../../../packages/game-core/src/index.js"
    );
    if (next.ship.systems && sysKey in next.ship.systems) {
      const r = repairSystemAtStarbase(next.ship, session, sysKey);
      next = {
        ...next,
        ship: r.ship || next.ship,
        starbase: r.session,
      };
      return paintStarbase(next, r.message, prev, input);
    }
  }

  // Sickbay: "Heal: Name" / treat injured
  const healMatch =
    pickLabel.match(/(?:heal|treat|sickbay)[:\s]+(.+)/i) ||
    text.match(/(?:heal|treat|sickbay)[:\s]+(.+)/i);
  if (healMatch && next.ship) {
    const who = healMatch[1].trim().toLowerCase().replace(/\s*\(.*/, "");
    const patient = (next.ship.crew || []).find(
      (c) =>
        c.status === "injured" &&
        (c.name.toLowerCase() === who ||
          c.name.toLowerCase().includes(who) ||
          c.id === who)
    );
    const { healCrewAtStarbase } = await import(
      "../../../packages/game-core/src/index.js"
    );
    if (patient) {
      const r = healCrewAtStarbase(next.ship, session, patient.id);
      next = {
        ...next,
        ship: r.ship || next.ship,
        starbase: r.session,
      };
      return paintStarbase(next, r.message, prev, input);
    }
    return paintStarbase(
      next,
      `No injured officer matching "${healMatch[1].trim()}".`,
      prev,
      input
    );
  }

  // Transfer: "Transfer: Name"
  const transferMatch =
    pickLabel.match(/transfer[:\s]+(.+)/i) ||
    text.match(/transfer[:\s]+(.+)/i);
  if (transferMatch && next.ship) {
    const who = transferMatch[1].trim().toLowerCase().replace(/\s*\(.*/, "");
    const officer = (next.ship.crew || []).find(
      (c) =>
        c.status !== "dead" &&
        c.status !== "transferred" &&
        (c.name.toLowerCase() === who ||
          c.name.toLowerCase().includes(who) ||
          c.id === who)
    );
    const { transferCrewMember } = await import(
      "../../../packages/game-core/src/index.js"
    );
    if (officer) {
      const r = transferCrewMember(next.ship, session, officer.id);
      next = {
        ...next,
        ship: r.ship || next.ship,
        starbase: r.session,
      };
      return paintStarbase(next, r.message, prev, input);
    }
    return paintStarbase(
      next,
      `No transferable officer matching "${transferMatch[1].trim()}".`,
      prev,
      input
    );
  }

  // Hire recruit by name or "Hire: Name"
  const hireMatch =
    pickLabel.match(/hire[:\s]+(.+)/i) || text.match(/hire[:\s]+(.+)/i);
  if (hireMatch && next.ship) {
    const who = hireMatch[1].trim().toLowerCase();
    // Strip quality/role suffixes from choice labels
    const whoCore = who.replace(/\s*[—–-].*/, "").replace(/\s*\(.*/, "").trim();
    const offer = session.recruitOffers.find((c) => {
      const n = c.name.toLowerCase();
      return (
        n === whoCore ||
        whoCore.includes(n) ||
        n.includes(whoCore) ||
        c.id === whoCore ||
        who.includes(n)
      );
    });
    const { hireRecruit } = await import(
      "../../../packages/game-core/src/index.js"
    );
    if (offer) {
      const r = hireRecruit(next.ship, session, offer.id);
      next = {
        ...next,
        ship: r.ship || next.ship,
        starbase: r.session,
      };
      return paintStarbase(next, r.message, prev, input);
    }
    return paintStarbase(
      next,
      `No candidate matching "${hireMatch[1].trim()}" on the slate.`,
      prev,
      input
    );
  }

  // Refresh slate / status
  return paintStarbase(next, null, prev, input);
}

async function ensureStarbaseSession(state: GameState): Promise<GameState> {
  const {
    initStarbaseSession,
    normalizeStarbaseSession,
    computeShipSkills,
    normalizeShip,
  } = await import("../../../packages/game-core/src/index.js");

  if (state.starbase?.ready) {
    const starbase = normalizeStarbaseSession(state.starbase, state.universe);
    return {
      ...state,
      phase: "starbase",
      status: "active",
      starbase: starbase || state.starbase,
    };
  }
  let ship = state.ship ? normalizeShip(state.ship) : null;
  if (ship) {
    const skills = computeShipSkills(ship, ship.crew);
    ship = { ...ship, skills };
  }
  const starbase = initStarbaseSession(ship, { universe: state.universe });
  return {
    ...state,
    phase: "starbase",
    status: "active",
    ship,
    starbase,
  };
}

function starbaseChoiceLabels(state: GameState): string[] {
  return starbaseHubChoices(state);
}

async function attachCampaignLog(state: GameState): Promise<GameState> {
  if (state.campaignLog?.length) return state;
  if (!state.profileId || !state.ownerEmail) return state;
  try {
    const { readProfile } = await import("../store/profileStore.js");
    const profile = await readProfile(state.profileId, state.ownerEmail);
    if (profile?.campaignLog?.length) {
      return { ...state, campaignLog: profile.campaignLog };
    }
  } catch {
    /* ignore */
  }
  return state;
}

async function composeStarbaseState(
  state: GameState,
  notice: string | null
): Promise<GameState> {
  const next = await attachCampaignLog(await ensureStarbaseSession(state));
  const labels = starbaseChoiceLabels(next);
  const body = [
    buildStarbaseSummary(next),
    notice ? `\n› ${notice}` : "",
    "",
    "Orders:",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    ...next,
    phase: "starbase",
    status: "active",
    pendingQuestion: body,
    pendingChoices: numbered(labels),
    turn: {
      sceneId: next.turn?.sceneId || randomUUID(),
      narration: body,
      crewDialogue: [],
      options: numbered(labels),
      viewscreenPrompt: "Federation starbase spacedock, ship in repair cradle",
      sfx: notice ? ["power_up2"] : [],
    },
  };
}

async function paintStarbase(
  state: GameState,
  notice: string | null,
  prev: GameState,
  input: string
): Promise<GameState> {
  const composed = await composeStarbaseState(state, notice);
  return logPlayerChoice(composed, input, prev.pendingChoices);
}

/** Rebuild the hub (session, log, choices) without treating it as a player order. */
export async function hydrateStarbase(
  state: GameState,
  notice?: string | null
): Promise<GameState> {
  return composeStarbaseState(state, notice ?? null);
}

async function dockAtStarbase(
  state: GameState,
  notice: string
): Promise<GameState> {
  const next = await ensureCampaignAttached({
    ...state,
    mission: null,
    missionOffers: null,
    debrief: null,
    phase: "starbase",
    status: "active",
  });
  return hydrateStarbase(next, notice);
}

/**
 * After the hub, open the mission board. Keep the dockyard visit;
 * only startPlaying clears it. Default type/difficulty so the board is a list.
 */
export async function beginNextCampaignMission(
  state: GameState
): Promise<GameState> {
  const next: GameState = {
    ...state,
    mission: null,
    turn: null,
    debrief: null,
    missionOffers: null,
    status: "active",
  };
  return goMissionType(next);
}

async function leaveStarbaseForMission(
  state: GameState,
  input: string,
  prev: GameState
): Promise<GameState> {
  let next: GameState = {
    ...state,
    mission: null,
    turn: null,
    debrief: null,
    missionOffers: null,
    status: "active",
  };
  try {
    const { updateProfileFromRun } = await import("../store/profileStore.js");
    await updateProfileFromRun(next, { clearActiveRun: false });
  } catch {
    /* ignore */
  }
  next = await beginNextCampaignMission(next);
  return logPlayerChoice(next, input, prev.pendingChoices);
}

function buildStarbaseSummary(state: GameState): string {
  const ship = state.ship;
  const u = state.universe;
  const session = state.starbase;
  const skills = ship?.skills?.total;
  const living = (ship?.crew || []).filter(
    (c) => (c.status || "active") === "active"
  );
  const dead = (ship?.crew || []).filter((c) => c.status === "dead");
  const injured = (ship?.crew || []).filter((c) => c.status === "injured");
  const transferred = (ship?.crew || []).filter(
    (c) => c.status === "transferred"
  );
  const skillLine = skills
    ? Object.entries(skills)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ")
    : "skills calibrating…";
  const rep = u?.factionReputation
    ? Object.entries(u.factionReputation)
        .filter(([, v]) => Math.abs(v) >= 5)
        .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`)
        .join(", ") || "neutral standing"
    : "unknown";
  const damaged = ship
    ? Object.entries(ship.systems || {})
        .filter(([, v]) => v !== "ok")
        .map(([k, v]) => `${k}:${v}`)
        .join(", ") || "all nominal"
    : "—";
  const stationLabel =
    session?.stationClass === "fleet_yards"
      ? "Fleet Yards (priority facilities)"
      : session?.stationClass === "starbase"
        ? "Starbase (standard yards)"
        : session?.stationClass === "outpost"
          ? "Outpost (limited yards)"
          : "Docking facility";
  const roster =
    living.length || injured.length
      ? [
          ...living.map(
            (c) =>
              `  · ${c.rank ? c.rank + " " : ""}${c.name} — ${c.role} [active]`
          ),
          ...injured.map(
            (c) =>
              `  · ${c.name} — ${c.role} [INJURED${
                c.injuryTurnsRemaining != null
                  ? ` ${c.injuryTurnsRemaining}t`
                  : ""
              }]`
          ),
        ].join("\n")
      : "  (empty roster)";
  const recruits =
    session?.recruitOffers
      ?.map((c, i) => {
        const q = c.quality || "standard";
        const rank = c.rank ? `${c.rank} ` : "";
        const sk = c.skills
          ? Object.entries(c.skills)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .slice(0, 3)
              .map(([k, v]) => `${k.slice(0, 3)} ${v}`)
              .join(" · ")
          : "—";
        return `  ${i + 1}. ${rank}${c.name} — ${c.role} (${c.species || "Unknown"}) [${q}]\n      ${sk}`;
      })
      .join("\n") || "  (none this visit)";
  const budget = session
    ? [
        `Facility: ${stationLabel}`,
        `Refit: hull ${session.hullRefitUsed ? "done" : "open"}${
          session.deepRefitUsed ? " · deep-refit done" : ""
        } · shields ${session.shieldRefitUsed ? "done" : "open"} · systems ${session.systemsRepaired.filter((x) => x !== "__deep_refit__").length}/${session.systemRepairBudget}`,
        `Personnel: recruits ${session.recruitsHired}/${session.recruitBudget} · sickbay ${session.medicalUsed}/${session.medicalBudget} · transfers ${session.transfersUsed}/${session.transferBudget}`,
      ].join("\n")
    : "";

  return [
    "=== Starbase — Campaign Hub ===",
    "",
    ship
      ? `${ship.name} ${ship.registryNumber || ""} — hull ${ship.integrity}/${ship.maxIntegrity} · shields ${ship.shieldIntegrity}/${ship.maxShieldIntegrity}${ship.shieldGridOnline ? "" : " (offline)"}`
      : "No ship docked.",
    `Stardate ${u?.stardate || ship?.stardate || "—"}.`,
    `Crew active: ${living.length}` +
      (injured.length ? ` · injured: ${injured.length}` : "") +
      (dead.length ? ` · KIA: ${dead.map((c) => c.name).join(", ")}` : "") +
      (transferred.length ? ` · transferred: ${transferred.length}` : ""),
    `Systems: ${damaged}`,
    `Ship skills: ${skillLine}`,
    `Reputation: ${rep}`,
    budget,
    "",
    "Bridge roster:",
    roster,
    "",
    "Personnel slate (this visit):",
    recruits,
    "",
    state.debrief ? "Last mission debrief is on file." : "",
    "What are your orders?",
  ]
    .filter((line) => line !== undefined && line !== null)
    .join("\n");
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

const MISSION_TYPE_CHOICES = [
  "Science — technology and problem-solving",
  "Exploration — discovery and diplomacy",
  "Search & Rescue — find and save those in peril",
  "Battle — starship combat and strategy",
  "Expanded — complex multi-skill Hardcore scenario",
];

const DIFFICULTY_CHOICES = [
  "Easy — clearer paths, gentler consequences",
  "Medium — standard Starfleet risk",
  "Hard — costly mistakes",
  "Hardcore — brutal options and traps",
];

function parseMissionTypeInput(input: string): MissionType | null {
  const t = input.toLowerCase();
  if (/science/.test(t)) return "science";
  if (/search/.test(t)) return "search_rescue";
  if (/battle|combat/.test(t)) return "battle";
  if (/expanded|hardcore scenario/.test(t)) return "expanded";
  if (/explor/.test(t)) return "exploration";
  return null;
}

function parseDifficultyInput(input: string): Difficulty | null {
  const t = input.toLowerCase();
  if (/\beasy\b/.test(t)) return "easy";
  if (/\bhardcore\b/.test(t)) return "hardcore";
  if (/\bhard\b/.test(t)) return "hard";
  if (/\bmedium\b/.test(t)) return "medium";
  return null;
}

async function goMissionType(state: GameState): Promise<GameState> {
  return {
    ...state,
    phase: "mission_type",
    pendingQuestion:
      "Select an assignment type, Captain. Starfleet will then compile a matching slate.",
    pendingChoices: numbered(MISSION_TYPE_CHOICES),
    turn: null,
  };
}

async function goDifficulty(state: GameState): Promise<GameState> {
  return {
    ...state,
    phase: "difficulty",
    pendingQuestion: "Select difficulty for this assignment.",
    pendingChoices: numbered(DIFFICULTY_CHOICES),
    turn: null,
  };
}

async function offerMissions(
  state: GameState,
  reshuffle = false
): Promise<GameState> {
  let narration = "";
  let offers: SetupMissionOffer[] = [];
  try {
    const generated = await setupCall("mission offers", () =>
      generateMissionOffers(state, reshuffle)
    );
    narration = generated.narration;
    offers = generated.offers;
  } catch {
    offers = fallbackMissionOffers(state);
    narration =
      "Starfleet has posted standing assignments while a full briefing packet is compiled.\n\n" +
      offers.map((o, i) => `${i + 1}. ${o.title}\n   ${o.summary}`).join("\n\n") +
      `\n\nSelect 1–3, or type "more" for different missions.`;
  }
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
    starbase: null,
  };

  // Ensure campaign profile + skills + universe for this captain
  next = await ensureCampaignAttached(next);

  // New mission: tick clock is relative to this mission's playTurnCount
  if (next.universe) {
    const loc = next.mission?.location?.trim();
    const known = next.universe.knownLocations || [];
    next = {
      ...next,
      universe: {
        ...next.universe,
        lastTickTurn: 0,
        knownLocations:
          loc && !known.includes(loc) ? [...known, loc] : known,
      },
    };
  }

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
      sfx: Array.isArray(scene.sfx) ? scene.sfx : [],
    },
  };
  return next;
}

/** Attach or create CampaignProfile; normalize crew skills */
async function ensureCampaignAttached(state: GameState): Promise<GameState> {
  if (!state.ship) return state;
  const {
    computeShipSkills,
    emptyUniverse,
    normalizeCrewMember,
    sanitizeBridgeCrew,
    stardateForEra,
  } = await import("../../../packages/game-core/src/index.js");
  const { normalizeShip } = await import("../../../packages/game-core/src/index.js");
  let ship = normalizeShip(state.ship);
  const stardate = ship.stardate || stardateForEra(ship.era);
  const crew = sanitizeBridgeCrew(ship.crew || []).map((c) =>
    normalizeCrewMember(c, stardate)
  );
  const skills = computeShipSkills({ ...ship, crew }, crew);
  ship = { ...ship, crew, skills, stardate };

  let profileId = state.profileId;
  let universe = state.universe;
  const ownerEmail = state.ownerEmail || "";
  try {
    if (!ownerEmail) {
      throw new Error("ownerEmail missing on game state");
    }
    const {
      createProfileFromShip,
      readProfile,
      writeProfile,
    } = await import("../store/profileStore.js");
    if (profileId) {
      const existing = await readProfile(profileId, ownerEmail);
      if (existing) {
        universe = existing.universe;
        await writeProfile({
          ...existing,
          ownerEmail,
          ship,
          crew,
          skills,
          activeRunId: state.runId,
          captainName: state.playerName || existing.captainName,
        });
      }
    } else {
      const profile = await createProfileFromShip(
        state.playerName || "Captain",
        ship,
        ownerEmail
      );
      profileId = profile.id;
      universe = profile.universe;
      await writeProfile({
        ...profile,
        ownerEmail,
        activeRunId: state.runId,
      });
    }
  } catch (err) {
    console.warn("[campaign] ensure profile failed:", err);
    universe = universe || emptyUniverse(stardateForEra(ship.era));
  }

  return {
    ...state,
    ship,
    profileId: profileId || null,
    universe: universe || emptyUniverse(stardateForEra(ship.era)),
  };
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
    sfx: Array.isArray(scene.sfx) ? scene.sfx : [],
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
    toolApplyCrewDeath,
    toolSetCrewStatus,
    toolTickCrewService,
  } = await import("../tools/registry.js");
  const {
    canCrewDie,
    classifyDamageKind,
    computeShipSkills,
    evaluateSystemConstraints,
    normalizeShip,
    skillModifierForAction,
    tickShieldRecharge,
    tickUniverse,
    emptyUniverse,
    stardateForEra,
  } = await import("../../../packages/game-core/src/index.js");

  let next = state;
  const systemChanges: string[] = [];
  const flagsAdded: string[] = [];
  const notes: string[] = [];
  let rollData: MechanicalResults["roll"] = null;

  // Ensure universe state exists when we have a ship
  if (!next.universe && next.ship) {
    next = {
      ...next,
      universe: emptyUniverse(
        next.ship.stardate || stardateForEra(next.ship.era)
      ),
    };
  }

  // Normalize ship + tick shield recharge at the start of every mechanical beat
  if (next.ship) {
    let ship = normalizeShip(next.ship);
    const tick = tickShieldRecharge(ship);
    ship = tick.ship;
    // Recompute skills from living crew
    const skills = computeShipSkills(ship, ship.crew);
    ship = { ...ship, skills };
    next = { ...next, ship };
    if (tick.note) notes.push(tick.note);
  }

  // Advance crew service clocks (active officers)
  {
    const svc = toolTickCrewService(next);
    if (svc.state) next = svc.state;
  }

  // Universe tick every ~5 play turns
  if (next.universe && next.mission) {
    const turns = next.mission.playTurnCount || 0;
    const since = turns - (next.universe.lastTickTurn || 0);
    if (since >= 5) {
      next = {
        ...next,
        universe: tickUniverse(
          next.universe,
          since,
          next.mission.flags || []
        ),
      };
      if (next.universe) {
        notes.push(
          `Stardate advanced to ${next.universe.stardate} (galactic turn ${next.universe.globalTurn}).`
        );
      }
    }
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

  // Ship/crew skills adjust difficulty (negative = easier)
  let skillMod = 0;
  if (next.ship?.skills?.total) {
    skillMod = skillModifierForAction(
      next.ship.skills,
      playerAction,
      effectiveRisk
    );
    if (skillMod !== 0) {
      actionModifier += skillMod;
      notes.push(
        skillMod < 0
          ? `Crew expertise assists this action (skill mod ${skillMod}).`
          : `Limited expertise hinders this action (skill mod +${skillMod}).`
      );
    }
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
      const science = next.ship?.skills?.total?.science ?? 40;
      const damagedArrays = next.ship?.systems.sensors === "damaged";
      let intel = "Detailed sensor map acquired";
      if (damagedArrays) {
        intel =
          science >= 70
            ? "Partial sensor map compensated by science expertise"
            : "Partial sensor map (arrays damaged)";
      } else if (science >= 65) {
        intel = "High-resolution sensor map acquired";
      } else if (science < 40) {
        intel = "Partial sensor map (limited science suite)";
      }
      notes.push(`Science ${science}: ${intel}.`);
      next = {
        ...next,
        mission: {
          ...next.mission,
          knownIntel: [...next.mission.knownIntel, intel],
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

    // Crew injury / death risk after serious hits
    const hullDmg = Number(dmg.data?.hullDamage || 0);
    const boarding =
      damageKind === "boarding" ||
      /board|intruder/i.test(playerAction);
    if (
      next.ship &&
      canCrewDie(
        {
          hullDamage: hullDmg,
          shieldsCollapsed: Boolean(dmg.data?.shieldsCollapsed),
          boarding,
          lifeSupportDestroyed: next.ship.systems.lifeSupport === "destroyed",
          lifeSupportDamaged: next.ship.systems.lifeSupport === "damaged",
        },
        Math.random
      )
    ) {
      const living = (next.ship.crew || []).filter(
        (c) => (c.status || "active") === "active"
      );
      if (living.length) {
        const victim = living[Math.floor(Math.random() * living.length)];
        const death = toolApplyCrewDeath(
          next,
          victim.id,
          hullDmg >= 15
            ? "structural collapse on their deck"
            : boarding
              ? "boarding action"
              : "combat trauma"
        );
        if (death.state) {
          next = death.state;
          notes.push(death.message);
          flagsAdded.push("crew_casualty");
          systemChanges.push(`crew:${victim.name}→dead`);
        }
      }
    } else if (next.ship && hullDmg >= 10 && Math.random() < 0.25) {
      // Injury without death
      const living = (next.ship.crew || []).filter(
        (c) => (c.status || "active") === "active"
      );
      if (living.length) {
        const victim = living[Math.floor(Math.random() * living.length)];
        const inj = toolSetCrewStatus(next, victim.id, "injured");
        if (inj.state) {
          next = inj.state;
          notes.push(`${victim.name} injured — off duty briefly.`);
        }
      }
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

  // Attach skill snapshot for the LLM
  if (next.ship?.skills?.total) {
    notes.push(
      `Ship skills: ${Object.entries(next.ship.skills.total)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`
    );
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
      skillTotals: next.ship?.skills?.total
        ? { ...next.ship.skills.total }
        : undefined,
      skillModifier: skillMod,
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

  if (scene.reputationDeltas && next.universe) {
    const universe = applyReputation(next.universe, scene.reputationDeltas);
    tracedTool(
      next.runId,
      next.phase,
      "update_reputation",
      { deltas: scene.reputationDeltas, source: "llm" },
      { ok: true, message: "Reputation deltas applied (clamped)." }
    );
    next = { ...next, universe };
  }
  return next;
}

async function finishMission(
  state: GameState,
  success: boolean,
  mechanical?: MechanicalResults
): Promise<GameState> {
  requireLlm();
  let next: GameState = { ...state, phase: "debrief", status: "completed" };
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
  next.phase = "starbase";
  next.status = "active";
  next.starbase = null; // force fresh visit session on first hub paint

  // Persist campaign profile (skills, crew, universe, log)
  try {
    const { updateProfileFromRun } = await import("../store/profileStore.js");
    const profile = await updateProfileFromRun(next, {
      outcome: success ? "success" : "failed",
      clearActiveRun: false,
    });
    if (profile) {
      next = {
        ...next,
        profileId: profile.id,
        universe: profile.universe,
        ship: profile.ship,
        campaignLog: profile.campaignLog,
      };
    }
  } catch (err) {
    console.warn("[campaign] profile update failed:", err);
  }

  next = await paintStarbase(
    next,
    success
      ? "Mission complete. Starbase facilities are standing by for refit and recruitment."
      : "Mission failed — but the yard can still patch your hull and fill empty billets.",
    next,
    "debrief"
  );
  // Keep debrief text at top of the hub message
  next = {
    ...next,
    debrief,
    pendingQuestion: `${debrief}\n\n${next.pendingQuestion}`,
    log: pushLog(next, "debrief", debrief).log,
  };
  return next;
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
