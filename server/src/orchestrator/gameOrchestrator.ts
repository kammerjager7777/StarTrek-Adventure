import { randomUUID } from "node:crypto";
import type { GameState, PublicGameView } from "../../../packages/game-core/src/index.js";
import {
  emptyViewscreen,
  metaCommandList,
} from "../../../packages/game-core/src/index.js";
import {
  advanceSetup,
  LlmNarratorError,
  resolveChoiceLabel,
  resolvePlayTurn,
} from "../agents/gamemaster.js";
import {
  changeDifficulty,
  toolHint,
  toolMissionStatus,
  toolRecap,
} from "../tools/registry.js";
import {
  deleteDebugLog,
  initSessionDebugLog,
  logError,
  logNarrator,
  logPhaseChange,
  logSystemMessage,
  logUserMessage,
  stateSnapshot,
  tracedTool,
} from "../debug/sessionDebugLog.js";
import {
  AiUnavailableError,
  assertXaiReady,
} from "../services/xai/connectivity.js";
import {
  deletePortraitsForRun,
  ensureCrewPortraits,
} from "../services/xai/portraits.js";
import {
  deleteViewscreenForRun,
  scheduleViewscreenCapture,
} from "../agents/viewscreenAgent.js";
import { deleteVoiceCacheForRun } from "../services/xai/tts.js";
import {
  buildNarratorVoiceIdentity,
  ensureCrewVoices,
} from "../services/voice/voiceIdentity.js";
import { deleteSave, listSaves, readSave, writeSave } from "../store/saveStore.js";

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
      imagesOn: true,
      tutorialCompleted: false,
      voiceMode: "off",
      viewscreenEnabled: true,
    },
    narratorVoice: buildNarratorVoiceIdentity(),
    viewscreen: emptyViewscreen(),
    pendingQuestion: null,
    pendingChoices: null,
    setupNotes: [],
    setupShips: null,
    missionOffers: null,
    debrief: null,
  };
}

function normalizeState(state: GameState): GameState {
  const speechOn =
    state.settings?.speechOn === true || state.settings?.voiceMode === "on";

  // Re-lock narrator if missing or on an older profile version (diversity fix)
  let narratorVoice = state.narratorVoice || buildNarratorVoiceIdentity();
  if (
    !narratorVoice.profileVersion ||
    narratorVoice.profileVersion < 2 ||
    !narratorVoice.voiceId
  ) {
    narratorVoice = buildNarratorVoiceIdentity();
  }

  let ship = state.ship;
  if (ship?.crew?.length) {
    const crew = ensureCrewVoices(ship.crew, narratorVoice.voiceId);
    const changed = crew.some((c, i) => c !== ship!.crew[i]);
    if (changed) ship = { ...ship, crew };
  }
  return {
    ...state,
    ship,
    narratorVoice,
    settings: {
      speechOn,
      imagesOn: state.settings?.imagesOn ?? true,
      tutorialCompleted: state.settings?.tutorialCompleted ?? false,
      voiceMode: speechOn ? "on" : "off",
      viewscreenEnabled: state.settings?.viewscreenEnabled !== false,
    },
    viewscreen: state.viewscreen || emptyViewscreen(),
  };
}

function toView(state: GameState): PublicGameView {
  const normalized = normalizeState(state);
  return {
    state: normalized,
    metaCommands: metaCommandList(normalized.difficulty),
    canHint: normalized.difficulty !== "hardcore",
    narrator: "llm",
    model: process.env.XAI_MODEL || "grok-4.5",
  };
}

/**
 * Ensure the visible Narrator prompt is also stored in state.log.
 * Setup stages often set pendingQuestion without pushLog(narration),
 * which made the mission log look like only captain messages.
 */
function ensureNarrationInGameLog(
  before: GameState,
  after: GameState
): GameState {
  const text = after.pendingQuestion?.trim();
  if (!text) return after;

  // Already the latest log entry (e.g. play path already pushLog'd it)
  const last = after.log[after.log.length - 1];
  if (
    (last?.kind === "narration" || last?.kind === "debrief") &&
    last.text === text
  ) {
    return after;
  }

  // Avoid duplicating if this exact narration/debrief was already recorded
  const already = after.log.some(
    (e) =>
      (e.kind === "narration" || e.kind === "debrief") && e.text === text
  );
  if (already) return after;

  // Only record when the prompt actually changed (new beat)
  if (before.pendingQuestion === after.pendingQuestion && before.phase === after.phase) {
    // Still allow first-time capture if log is missing it
    if (after.log.some((e) => e.kind === "narration")) return after;
  }

  return {
    ...after,
    log: [
      ...after.log,
      {
        at: new Date().toISOString(),
        phase: after.phase,
        kind: "narration",
        text,
      },
    ],
  };
}

async function finalizeAction(
  before: GameState,
  after: GameState
): Promise<GameState> {
  let next = ensureNarrationInGameLog(before, after);

  await logPhaseChange(next.runId, before.phase, next.phase, {
    snapshot: stateSnapshot(next),
  });
  await logNarrator(next.runId, next.phase, next.pendingQuestion, {
    choices: next.pendingChoices?.map((c) => ({
      id: c.id,
      text: c.text,
      risk: c.risk,
    })),
    crewDialogue: next.turn?.crewDialogue,
    lastRoll: next.turn?.lastRoll,
  });
  await writeSave(next);
  // Journey-book frames: async Imagine capture (does not block the player turn)
  if (next.phase === "playing" || next.phase === "debrief") {
    scheduleViewscreenCapture(next);
  }
  return next;
}

export async function startNewGame(): Promise<PublicGameView> {
  // Hard gate: no game without a working xAI link
  const link = await assertXaiReady(true);
  let state = freshState();
  await initSessionDebugLog(state);
  await logSystemMessage(state.runId, "boot", "xAI link verified — starting session", {
    model: link.model,
    detail: link.detail,
  });
  const before = state;
  state = await advanceSetup(state, "");
  await logSystemMessage(state.runId, state.phase, "Initial setup prompt issued", {
    snapshot: stateSnapshot(state),
  });
  state = await finalizeAction(before, state);
  return toView(state);
}

export { AiUnavailableError, LlmNarratorError };

export async function getGame(runId: string): Promise<PublicGameView | null> {
  const state = await readSave(runId);
  if (!state) return null;
  const normalized = normalizeState(state);
  // Persist voice re-locks (profile upgrades / uniqueness) so they stick
  const voiceChanged =
    normalized.narratorVoice?.voiceId !== state.narratorVoice?.voiceId ||
    normalized.narratorVoice?.profileVersion !== state.narratorVoice?.profileVersion ||
    (normalized.ship?.crew || []).some((c, i) => {
      const prev = state.ship?.crew?.[i];
      return c.voice?.voiceId !== prev?.voice?.voiceId;
    });
  if (voiceChanged) {
    await writeSave({ ...normalized, updatedAt: new Date().toISOString() });
  }
  return toView(normalized);
}

export async function listGames() {
  return listSaves();
}

export async function deleteGame(runId: string): Promise<boolean> {
  const existed = await deleteSave(runId);
  await deleteDebugLog(runId);
  await deletePortraitsForRun(runId);
  await deleteViewscreenForRun(runId);
  await deleteVoiceCacheForRun(runId);
  return existed;
}

/** Toggle auto-voice (Grok TTS) for narrator + crew lines. */
export async function setSpeechEnabled(
  runId: string,
  speechOn: boolean
): Promise<PublicGameView | null> {
  const state = await readSave(runId);
  if (!state) return null;
  const next: GameState = {
    ...normalizeState(state),
    settings: {
      ...normalizeState(state).settings,
      speechOn: Boolean(speechOn),
      voiceMode: speechOn ? "on" : "off",
    },
    updatedAt: new Date().toISOString(),
  };
  await writeSave(next);
  await logSystemMessage(runId, next.phase, `Auto-voice ${speechOn ? "enabled" : "disabled"}`);
  return toView(next);
}

export type SpeakRequest = {
  speaker?: string; // "narrator" | crew id | crew name
  text?: string;
  emotion?: string;
};

/**
 * Resolve speaker voice + text for TTS. Defaults to current pending narration
 * from the Narrator when text is omitted.
 */
export async function resolveSpeakPayload(
  runId: string,
  body: SpeakRequest
): Promise<{
  state: GameState;
  text: string;
  voice: NonNullable<GameState["narratorVoice"]>;
  speakerLabel: string;
  emotion: string;
} | null> {
  const raw = await readSave(runId);
  if (!raw) return null;
  const state = normalizeState(raw);
  // Persist backfilled voices once
  if (
    (!raw.narratorVoice && state.narratorVoice) ||
    (state.ship &&
      raw.ship &&
      state.ship.crew.some((c, i) => c.voice && !raw.ship!.crew[i]?.voice))
  ) {
    await writeSave({ ...state, updatedAt: new Date().toISOString() });
  }

  const speakerKey = (body.speaker || "narrator").trim().toLowerCase();
  let voice = state.narratorVoice || buildNarratorVoiceIdentity();
  let speakerLabel = "Narrator";
  let text = (body.text || "").trim();

  if (speakerKey !== "narrator" && state.ship?.crew?.length) {
    const crew =
      state.ship.crew.find((c) => c.id === body.speaker) ||
      state.ship.crew.find((c) => c.name.toLowerCase() === speakerKey) ||
      state.ship.crew.find((c) =>
        c.name.toLowerCase().includes(speakerKey)
      ) ||
      state.ship.crew.find((c) =>
        (c.role || "").toLowerCase().includes(speakerKey)
      );
    if (crew) {
      const locked =
        crew.voice ||
        ensureCrewVoices([crew], state.narratorVoice?.voiceId)[0].voice!;
      voice = locked;
      speakerLabel = crew.name;
    }
  }

  if (!text) {
    if (speakerKey === "narrator") {
      text = state.pendingQuestion || state.turn?.narration || "";
    } else {
      const line = state.turn?.crewDialogue?.find(
        (d) =>
          d.speaker.toLowerCase() === speakerLabel.toLowerCase() ||
          d.speaker.toLowerCase().includes(speakerKey)
      );
      text = line?.line || "";
    }
  }

  if (!text.trim()) return null;

  const { inferSceneEmotion } = await import("../services/voice/voiceIdentity.js");
  const emotion =
    body.emotion ||
    inferSceneEmotion({
      phase: state.phase,
      integrity: state.ship?.integrity,
      missionStatus: state.mission?.status,
      flags: state.mission?.flags,
    });

  return { state, text, voice, speakerLabel, emotion };
}

/** Generate missing crew portraits (Imagine) and return updated view */
export async function generateCrewPortraits(
  runId: string
): Promise<PublicGameView | null> {
  const state = await readSave(runId);
  if (!state) return null;
  const next = await ensureCrewPortraits(state);
  return toView(next);
}

export async function playerAction(
  runId: string,
  text: string
): Promise<PublicGameView | null> {
  let state = await readSave(runId);
  if (!state) return null;

  const before = structuredClone(state);
  const raw = text.trim();
  const lower = raw.toLowerCase();
  // Debug + mission log should show choice labels, not bare "1"/"2"
  const labeled = resolveChoiceLabel(
    raw,
    state.pendingChoices || state.turn?.options
  );

  await logUserMessage(runId, state.phase, labeled);
  try {
    // Meta commands during play / brief
    if (state.phase === "playing" || state.phase === "mission_brief") {
      if (lower === "mission status" || lower === "status") {
        const r = tracedTool(
          runId,
          state.phase,
          "get_mission_status",
          {},
          toolMissionStatus(state)
        );
        state = {
          ...state,
          pendingQuestion: r.message,
        };
        state = appendSystem(state, r.message);
        await logSystemMessage(runId, state.phase, r.message);
        state = await finalizeAction(before, state);
        return toView(state);
      }
      if (lower === "hint" || lower === "help") {
        const r = tracedTool(
          runId,
          state.phase,
          "give_hint",
          {},
          toolHint(state)
        );
        state = appendSystem(state, r.message);
        state = { ...state, pendingQuestion: r.message };
        await logSystemMessage(runId, state.phase, r.message);
        state = await finalizeAction(before, state);
        return toView(state);
      }
      if (lower === "recap") {
        const r = tracedTool(
          runId,
          state.phase,
          "recap_mission",
          {},
          toolRecap(state)
        );
        state = appendSystem(state, r.message);
        state = { ...state, pendingQuestion: r.message };
        await logSystemMessage(runId, state.phase, r.message);
        state = await finalizeAction(before, state);
        return toView(state);
      }
      if (lower.startsWith("change difficulty")) {
        const part = lower.replace("change difficulty", "").trim();
        const diff = ["easy", "medium", "hard", "hardcore"].find((d) =>
          part.includes(d)
        );
        if (diff) {
          const r = tracedTool(
            runId,
            state.phase,
            "change_difficulty",
            { difficulty: diff },
            changeDifficulty(
              state,
              diff as "easy" | "medium" | "hard" | "hardcore"
            )
          );
          if (r.state) state = r.state;
          state = appendSystem(state, r.message);
          state = { ...state, pendingQuestion: r.message };
          await logSystemMessage(runId, state.phase, r.message);
          state = await finalizeAction(before, state);
          return toView(state);
        }
        const helpMsg =
          "Say: change difficulty easy|medium|hard|hardcore";
        state = {
          ...state,
          pendingQuestion: helpMsg,
        };
        await logSystemMessage(runId, state.phase, helpMsg);
        state = await finalizeAction(before, state);
        return toView(state);
      }
      if (lower === "restart") {
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
            pendingQuestion:
              "Mission restarted. Review the brief and accept when ready.",
            pendingChoices: [
              { id: 1, text: "Accept mission and take the bridge", risk: "low" },
              { id: 2, text: "Return to mission list", risk: "low" },
            ],
          };
          state = appendSystem(state, "Mission restarted.");
          await logSystemMessage(runId, state.phase, "Mission restarted.");
          state = await finalizeAction(before, state);
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
        await logSystemMessage(
          runId,
          state.phase,
          "Returning to mission selection."
        );
        state = await finalizeAction(before, state);
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
        await logSystemMessage(runId, state.phase, msg, {
          tool: "get_entity_status",
        });
        state = await finalizeAction(before, state);
        return toView(state);
      }
    }

    if (state.phase === "playing") {
      // Real LLM Narrator (when XAI_API_KEY set) lives inside resolvePlayTurn
      state = await resolvePlayTurn(state, raw);
    } else {
      state = await advanceSetup(state, raw);
    }

    state = await finalizeAction(before, state);
    return toView(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logError(runId, before.phase, message, {
      stack: err instanceof Error ? err.stack : undefined,
      userText: raw,
    });
    throw err;
  }
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
