import { randomUUID } from "node:crypto";
import type { GameState, PublicGameView } from "../../../packages/game-core/src/index.js";
import { metaCommandList } from "../../../packages/game-core/src/index.js";
import {
  advanceSetup,
  enrichNarrationWithXai,
  resolvePlayTurn,
} from "../agents/gamemaster.js";
import {
  changeDifficulty,
  toolHint,
  toolMissionStatus,
  toolRecap,
} from "../tools/registry.js";
import { listSaves, readSave, writeSave } from "../store/saveStore.js";

function freshState(): GameState {
  const now = new Date().toISOString();
  return {
    runId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "active",
    phase: "boot",
    playerName: "",
    difficulty: null,
    missionType: null,
    ship: null,
    mission: null,
    turn: null,
    log: [],
    settings: {
      speechOn: false,
      imagesOn: false,
      tutorialCompleted: false,
      voiceMode: "off",
    },
    pendingQuestion: null,
    pendingChoices: null,
    setupNotes: [],
    missionOffers: null,
    debrief: null,
  };
}

function toView(state: GameState): PublicGameView {
  return {
    state,
    metaCommands: metaCommandList(state.difficulty),
    canHint: state.difficulty !== "hardcore",
  };
}

export async function startNewGame(): Promise<PublicGameView> {
  let state = freshState();
  state = await advanceSetup(state, "");
  await writeSave(state);
  return toView(state);
}

export async function getGame(runId: string): Promise<PublicGameView | null> {
  const state = await readSave(runId);
  if (!state) return null;
  return toView(state);
}

export async function listGames() {
  return listSaves();
}

export async function playerAction(
  runId: string,
  text: string
): Promise<PublicGameView | null> {
  let state = await readSave(runId);
  if (!state) return null;

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // Meta commands during play / brief
  if (state.phase === "playing" || state.phase === "mission_brief") {
    if (lower === "mission status" || lower === "status") {
      const r = toolMissionStatus(state);
      state = {
        ...state,
        pendingQuestion: r.message,
      };
      state = appendSystem(state, r.message);
      await writeSave(state);
      return toView(state);
    }
    if (lower === "hint" || lower === "help") {
      const r = toolHint(state);
      state = appendSystem(state, r.message);
      state = { ...state, pendingQuestion: r.message };
      await writeSave(state);
      return toView(state);
    }
    if (lower === "recap") {
      const r = toolRecap(state);
      state = appendSystem(state, r.message);
      state = { ...state, pendingQuestion: r.message };
      await writeSave(state);
      return toView(state);
    }
    if (lower.startsWith("change difficulty")) {
      const part = lower.replace("change difficulty", "").trim();
      const diff = ["easy", "medium", "hard", "hardcore"].find((d) =>
        part.includes(d)
      );
      if (diff) {
        const r = changeDifficulty(
          state,
          diff as "easy" | "medium" | "hard" | "hardcore"
        );
        if (r.state) state = r.state;
        state = appendSystem(state, r.message);
        state = { ...state, pendingQuestion: r.message };
        await writeSave(state);
        return toView(state);
      }
      state = {
        ...state,
        pendingQuestion:
          "Say: change difficulty easy|medium|hard|hardcore",
      };
      await writeSave(state);
      return toView(state);
    }
    if (lower === "restart") {
      // Restart mission from brief if possible
      if (state.mission && state.ship) {
        state = {
          ...state,
          phase: "mission_brief",
          status: "active",
          mission: {
            ...state.mission,
            status: "active",
            flags: [],
            objectives: state.mission.objectives.map((o) => ({
              ...o,
              status: "active",
            })),
          },
          ship: {
            ...state.ship,
            integrity: state.ship.maxIntegrity,
            systems: {
              shields: "ok",
              torpedoes: "ok",
              warp: "ok",
              communications: "ok",
              sensors: "ok",
              lifeSupport: "ok",
            },
          },
          turn: null,
          pendingQuestion: "Mission restarted. Review the brief and accept when ready.",
          pendingChoices: [
            { id: 1, text: "Accept mission and take the bridge", risk: "low" },
            { id: 2, text: "Return to mission list", risk: "low" },
          ],
        };
        state = appendSystem(state, "Mission restarted.");
        await writeSave(state);
        return toView(state);
      }
    }
    if (lower === "new mission") {
      state = {
        ...state,
        phase: "mission_type",
        mission: null,
        turn: null,
        debrief: null,
        status: "active",
        pendingQuestion: "Select a new mission type:",
        pendingChoices: [
          { id: 1, text: "Science", risk: "low" },
          { id: 2, text: "Exploration", risk: "low" },
          { id: 3, text: "Search & Rescue", risk: "low" },
          { id: 4, text: "Battle", risk: "low" },
          { id: 5, text: "Expanded (Hardcore)", risk: "high" },
        ],
      };
      state = appendSystem(state, "Returning to mission selection.");
      await writeSave(state);
      return toView(state);
    }
    if (
      lower.includes("enemy status") ||
      lower.includes("anomaly status") ||
      lower === "status enemy"
    ) {
      const intel =
        state.mission?.knownIntel.join("\n- ") ||
        "No additional intelligence is available to the ship at this time.";
      const msg = `Known intelligence only:\n- ${intel}`;
      state = appendSystem(state, msg);
      state = { ...state, pendingQuestion: msg };
      await writeSave(state);
      return toView(state);
    }
  }

  if (state.phase === "playing") {
    state = await resolvePlayTurn(state, raw);
    // Optional LLM flavor on narration
    if (state.turn?.narration && process.env.XAI_API_KEY) {
      const enriched = await enrichNarrationWithXai(state, state.turn.narration);
      state = {
        ...state,
        turn: { ...state.turn, narration: enriched },
        pendingQuestion: enriched,
      };
    }
  } else {
    state = await advanceSetup(state, raw);
  }

  await writeSave(state);
  return toView(state);
}

function appendSystem(state: GameState, text: string): GameState {
  return {
    ...state,
    log: [
      ...state.log,
      {
        at: new Date().toISOString(),
        phase: state.phase,
        kind: "system",
        text,
      },
    ],
  };
}
