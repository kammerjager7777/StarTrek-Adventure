/** Star Trek Adventure — Bridge UI (Phase 1) */

import {
  initLcarsFx,
  isLcarsSfxEnabled,
  isLcarsTheme,
  lcarsUiSound,
  playIncomingTransmission,
  setLcarsSfxEnabled,
  unlockLcarsAudio,
} from "./lcarsFx.js";
import {
  initBridgeAmbient,
  isBridgeAmbientEnabled,
  setBridgeAmbientDucked,
  setBridgeAmbientEnabled,
  startBridgeAmbient,
} from "./bridgeAmbient.js";
import {
  initTrekSfx,
  playIncomingCommTrek,
  playNarratorSfx,
  playOrderCues,
  playStateDeltaSfx,
  playTrekSfx,
  playTrekUi,
  playTypeTick,
  playViewscreenSfx,
  isRedAlertState,
  setRedAlertDucked,
  setRedAlertLoop,
  setSceneBed,
  startProcessingLoop,
  stopProcessingLoop,
  syncRedAlertFromState,
  unlockTrekAudio,
} from "./trekSfx.js";

/** Duck bridge ambient + red-alert bed under narrator/crew speech */
function setSpeechBedsDucked(on) {
  setBridgeAmbientDucked(on);
  setRedAlertDucked(on);
}

/**
 * UI SFX: TrekCore computer sounds (both themes when SFX on).
 * LCARS panel beeps still fire in LCARS theme for a layered console feel.
 * @param {string} intent
 */
function uiSound(intent) {
  playTrekUi(intent);
  if (isLcarsTheme()) {
    // Map trek intents onto existing LCARS catalog without double-denying
    const map = {
      primary: "primary",
      engage: "primary",
      secondary: "secondary",
      soft: "secondary",
      open: "open",
      close: "close",
      nav: "nav",
      "theme-lcars": "nav",
      "theme-classic": "close",
      deny: "deny",
      error: "deny",
      failed: "deny",
      ok: "primary",
      "new-game": "primary",
      "history-open": "open",
      "history-close": "close",
      "voice-toggle": "secondary",
      "voice-menu": "open",
      "voice-pause": "soft",
      "voice-stop": "close",
      "voice-speed": "soft",
      "scar-open": "open",
      "scar-close": "close",
      replay: "soft",
      chime: "open",
    };
    const lcars = map[intent];
    if (lcars) lcarsUiSound(lcars);
  }
}

const els = {
  log: document.getElementById("mission-log"),
  logHistory: document.getElementById("mission-log-history"),
  logHistoryPanel: document.getElementById("log-history"),
  logHistoryToggle: document.getElementById("log-history-toggle"),
  logHistorySummary: document.getElementById("log-history-summary"),
  options: document.getElementById("options-bar"),
  form: document.getElementById("command-form"),
  input: document.getElementById("command-input"),
  engageBtn: document.getElementById("engage-btn"),
  waitingBanner: document.getElementById("waiting-banner"),
  waitingDetail: document.getElementById("waiting-detail"),
  phase: document.getElementById("phase-badge"),
  ship: document.getElementById("ship-panel"),
  crew: document.getElementById("crew-panel"),
  objectives: document.getElementById("objectives-panel"),
  meta: document.getElementById("meta-panel"),
  run: document.getElementById("run-panel"),
  viewscreen: document.getElementById("viewscreen-content"),
  viewscreenCaption: document.getElementById("viewscreen-caption"),
  viewscreenMeta: document.getElementById("viewscreen-meta"),
  viewscreenPanel: document.getElementById("viewscreen-panel"),
  viewscreenToggle: document.getElementById("viewscreen-toggle"),
  viewscreenCollapseSummary: document.getElementById(
    "viewscreen-collapse-summary"
  ),
  logPanel: document.getElementById("log-panel"),
  narratorBadge: document.getElementById("narrator-badge"),
  aiBanner: document.getElementById("ai-error-banner"),
  aiReason: document.getElementById("ai-error-reason"),
  aiDetail: document.getElementById("ai-error-detail"),
  btnRetryAi: document.getElementById("btn-retry-ai"),
  btnNew: document.getElementById("btn-new"),
  btnHistory: document.getElementById("btn-history"),
  btnCloseHistory: document.getElementById("btn-close-history"),
  historyModal: document.getElementById("history-modal"),
  historyList: document.getElementById("history-list"),
  historyAccount: document.getElementById("history-account"),
  historyAccountEmail: document.getElementById("history-account-email"),
  historyAccountNote: document.getElementById("history-account-note"),
  historyAccountLocal: document.getElementById("history-account-local"),
  historyAccountInput: document.getElementById("history-account-input"),
  btnSetAccount: document.getElementById("btn-set-account"),
  scarModal: document.getElementById("scar-modal"),
  scarModalTitle: document.getElementById("scar-modal-title"),
  scarModalIcon: document.getElementById("scar-modal-icon"),
  scarModalType: document.getElementById("scar-modal-type"),
  scarModalIndex: document.getElementById("scar-modal-index"),
  scarModalBody: document.getElementById("scar-modal-body"),
  btnCloseScar: document.getElementById("btn-close-scar"),
  redAlertBadge: document.getElementById("red-alert-badge"),
  starbaseOverlay: document.getElementById("starbase-overlay"),
  starbaseMeta: document.getElementById("starbase-meta"),
  starbaseNotice: document.getElementById("starbase-notice"),
  starbaseShip: document.getElementById("starbase-ship"),
  starbaseStanding: document.getElementById("starbase-standing"),
  starbaseYard: document.getElementById("starbase-yard"),
  starbasePeople: document.getElementById("starbase-people"),
  starbaseLog: document.getElementById("starbase-log"),
  starbasePrimary: document.getElementById("starbase-primary"),
  missionBoardOverlay: document.getElementById("mission-board-overlay"),
  missionBoardTitle: document.getElementById("mission-board-title"),
  missionBoardMeta: document.getElementById("mission-board-meta"),
  missionBoardCopy: document.getElementById("mission-board-copy"),
  missionBoardList: document.getElementById("mission-board-list"),
  missionBoardActions: document.getElementById("mission-board-actions"),
  hubWaiting: document.getElementById("hub-waiting"),
  hubWaitingDetail: document.getElementById("hub-waiting-detail"),
  btnVoice: document.getElementById("btn-voice"),
  btnVoiceMenu: document.getElementById("btn-voice-menu"),
  voiceMenu: document.getElementById("voice-menu"),
  voiceControls: document.getElementById("voice-controls"),
  btnVoicePause: document.getElementById("btn-voice-pause"),
  btnVoiceStop: document.getElementById("btn-voice-stop"),
  voiceSpeed: document.getElementById("voice-speed"),
  lcarsSfxToggle: document.getElementById("lcars-sfx-toggle"),
  bridgeAmbientToggle: document.getElementById("bridge-ambient-toggle"),
  softErrorToast: document.getElementById("soft-error-toast"),
  softErrorText: document.getElementById("soft-error-text"),
  btnDismissSoftError: document.getElementById("btn-dismiss-soft-error"),
  themeToggle: document.getElementById("theme-toggle"),
  btnThemeClassic: document.getElementById("btn-theme-classic"),
  btnThemeLcars: document.getElementById("btn-theme-lcars"),
  initOverlay: document.getElementById("init-overlay"),
  initTitle: document.getElementById("init-title"),
  initSubtitle: document.getElementById("init-subtitle"),
  initNetwork: document.getElementById("init-network"),
  initStatus: document.getElementById("init-status"),
  initChecklist: document.getElementById("init-checklist"),
  initProgressFill: document.getElementById("init-progress-fill"),
  initStepLabel: document.getElementById("init-step-label"),
  initPercent: document.getElementById("init-percent"),
};

let current = null;
let aiReady = false;

/** UI theme: classic (current design) | lcars — pure visual, localStorage only */
const THEME_PREF_KEY = "sta-ui-theme";

function getUiTheme() {
  const t = document.documentElement.getAttribute("data-ui-theme");
  return t === "lcars" ? "lcars" : "classic";
}

function applyUiTheme(theme, { persist = true, silent = false } = {}) {
  const prev = getUiTheme();
  const next = theme === "lcars" ? "lcars" : "classic";
  document.documentElement.setAttribute("data-ui-theme", next);
  if (persist) {
    try {
      localStorage.setItem(THEME_PREF_KEY, next);
    } catch {
      /* ignore */
    }
  }
  if (els.btnThemeClassic) {
    els.btnThemeClassic.setAttribute(
      "aria-pressed",
      next === "classic" ? "true" : "false"
    );
  }
  if (els.btnThemeLcars) {
    els.btnThemeLcars.setAttribute(
      "aria-pressed",
      next === "lcars" ? "true" : "false"
    );
  }
  document.querySelectorAll(".hub-theme-classic").forEach((btn) => {
    btn.setAttribute("aria-pressed", next === "classic" ? "true" : "false");
  });
  document.querySelectorAll(".hub-theme-lcars").forEach((btn) => {
    btn.setAttribute("aria-pressed", next === "lcars" ? "true" : "false");
  });
  if (!silent && prev !== next) {
    unlockLcarsAudio();
    uiSound(next === "lcars" ? "theme-lcars" : "theme-classic");
  }
  syncLcarsSfxToggleUi();
}

function syncLcarsSfxToggleUi() {
  if (!els.lcarsSfxToggle) return;
  els.lcarsSfxToggle.checked = isLcarsSfxEnabled();
  // Dim when not in LCARS (still editable so preference sticks)
  const wrap = els.lcarsSfxToggle.closest(".voice-menu-field");
  if (wrap) {
    wrap.classList.toggle("is-inactive-theme", !isLcarsTheme());
  }
}

function initUiTheme() {
  let saved = "lcars";
  try {
    const t = localStorage.getItem(THEME_PREF_KEY);
    if (t === "lcars" || t === "classic") saved = t;
  } catch {
    /* ignore */
  }
  // Prefer attribute already set by head script; fall back to storage
  const fromDom = document.documentElement.getAttribute("data-ui-theme");
  applyUiTheme(fromDom === "lcars" || fromDom === "classic" ? fromDom : saved, {
    persist: false,
    silent: true,
  });
}
/** Prevent double-clicks / concurrent actions (causes overlapping LLM + typewriter restarts) */
let actionInFlight = false;
let actionSeq = 0;
const STORAGE_KEY = "sta-active-run";
/** Local preference mirrored to server when a run is active */
const VOICE_PREF_KEY = "sta-speech-on";
const VOICE_SPEED_KEY = "sta-voice-speed";

function loadVoiceSpeed() {
  const n = Number(localStorage.getItem(VOICE_SPEED_KEY) || "1");
  if ([0.75, 1, 1.25, 1.5].includes(n)) return n;
  return 1;
}

/** Auto-narration is on unless the player explicitly turned it off. */
function loadSpeechPref() {
  try {
    const v = localStorage.getItem(VOICE_PREF_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

/** Grok TTS auto-play queue + transport (volume always full) */
let voice = {
  enabled: loadSpeechPref(),
  token: 0,
  audio: null,
  objectUrl: null,
  speaking: false,
  paused: false,
  speed: loadVoiceSpeed(),
  volume: 1,
  /** Resolvers waiting while paused before/during a chunk */
  pauseWaiters: [],
  /** performance.now() when latest narration text became available in the UI */
  textReadyAt: 0,
};

function voiceLog(...args) {
  console.log("[voice-timing]", ...args);
}

function notifyPauseWaiters() {
  const waiters = voice.pauseWaiters.splice(0, voice.pauseWaiters.length);
  for (const w of waiters) {
    try {
      w();
    } catch {
      /* ignore */
    }
  }
}

/** Resolves when voice is not paused (or playback token is cancelled). */
function waitWhilePaused(token) {
  if (!voice.paused || token !== voice.token) return Promise.resolve();
  return new Promise((resolve) => {
    voice.pauseWaiters.push(() => resolve());
  });
}

/** Typewriter state — cancelled only when a *new* narration beat arrives */
let typewriter = {
  token: 0,
  running: false,
  skip: false,
  fullText: "",
  /** Unique key for the beat currently typed/shown */
  activeKey: null,
  /** True once this activeKey finished typing (or was skipped) */
  completed: false,
  textEl: null,
  extras: [],
  options: [],
};

// Fast but readable: ~45–55 chars/sec with small bursts
const TYPE_MS_PER_CHAR = 14;
const TYPE_CHARS_PER_TICK = 2;

function narrationKey(state) {
  if (!state) return "";
  return `${state.runId || ""}|${state.phase || ""}|${state.pendingQuestion || ""}`;
}

class ApiError extends Error {
  constructor(message, payload = {}, status = 500) {
    super(message);
    this.name = "ApiError";
    this.payload = payload;
    this.status = status;
  }
}

/**
 * Friendly message for browser network failures (often misread as "model" errors).
 * Common cause: dev server restart mid-request, or a long LLM call aborted.
 */
function networkErrorMessage(err) {
  const raw = err?.message || String(err || "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed")
  ) {
    return {
      message: "Lost contact with the bridge server.",
      detail:
        "The request never completed (server restart, network blip, or a long AI call). Your game is still saved — try the same action again.",
    };
  }
  if (lower.includes("abort") || lower.includes("timeout")) {
    return {
      message: "The request timed out waiting for the Narrator.",
      detail: "Large setup steps (ship list, missions) can take a while. Try again.",
    };
  }
  return { message: raw || "Request failed", detail: "" };
}

/** localStorage key for local multi-user account email */
const LOCAL_USER_EMAIL_KEY = "sta-user-email";

/**
 * Email used for local account scoping (browser-chosen).
 * Sent as X-Dev-User-Email; ignored when IAP is present on the server.
 * @returns {string}
 */
function getLocalUserEmail() {
  try {
    const v = String(localStorage.getItem(LOCAL_USER_EMAIL_KEY) || "")
      .trim()
      .toLowerCase();
    if (v && v.includes("@")) return v;
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Persist local account email. Returns normalized email or "".
 * @param {string} email
 */
function setLocalUserEmail(email) {
  const n = String(email || "")
    .trim()
    .toLowerCase()
    .replace(/^accounts\.google\.com:/i, "");
  if (!n || !n.includes("@") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) {
    return "";
  }
  try {
    localStorage.setItem(LOCAL_USER_EMAIL_KEY, n);
  } catch {
    /* ignore */
  }
  return n;
}

/** Headers that identify the browser account for local/dev scoping */
function authHeaders() {
  const email = getLocalUserEmail();
  if (email) return { "X-Dev-User-Email": email };
  return {};
}

/**
 * Fetch with timeout so the bridge never waits forever.
 * Default 90s (play turns); pass longer for portraits / heavy setup.
 * Always attaches local account identity when set.
 * @param {string} path
 * @param {RequestInit & { timeoutMs?: number }} [options]
 */
async function api(path, options = {}) {
  const { timeoutMs = 90_000, headers, signal: outerSignal, ...rest } = options;
  const controller = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  // Combine with caller signal if provided
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else
      outerSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(headers || {}),
      },
      signal: controller.signal,
      ...rest,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new ApiError(
        "Narrator response timed out.",
        {
          reason: "Narrator response timed out.",
          detail:
            "The request took too long and was cancelled. Your voyage is still saved — try the same order again.",
          network: true,
          timeout: true,
        },
        0
      );
    }
    const { message, detail } = networkErrorMessage(err);
    throw new ApiError(message, { reason: message, detail, network: true }, 0);
  }
  if (timer) clearTimeout(timer);

  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        error: "Server returned a non-JSON response",
        detail: text.slice(0, 200),
      };
    }
  }

  if (!res.ok) {
    if (payload.gate && typeof payload.gate === "string") {
      window.location.replace(payload.gate);
    }
    const message =
      payload.reason ||
      payload.error ||
      `Request failed (${res.status})`;
    throw new ApiError(message, payload, res.status);
  }
  return payload;
}

let softErrorTimer = null;

/** Non-fatal toast — does NOT wipe the active game. */
function showSoftError(message, detail = "") {
  const text = detail ? `${message}\n\n${detail}` : message;
  if (els.softErrorText) els.softErrorText.textContent = text;
  if (els.softErrorToast) els.softErrorToast.classList.remove("hidden");
  if (softErrorTimer) clearTimeout(softErrorTimer);
  softErrorTimer = setTimeout(() => hideSoftError(), 12_000);
  uiSound("deny");
}

function hideSoftError() {
  if (els.softErrorToast) els.softErrorToast.classList.add("hidden");
  if (softErrorTimer) {
    clearTimeout(softErrorTimer);
    softErrorTimer = null;
  }
}

function showAiError(reason, detail = "") {
  aiReady = false;
  if (els.aiBanner) els.aiBanner.classList.remove("hidden");
  if (els.aiReason) els.aiReason.textContent = reason || "Unknown AI connection error.";
  if (els.aiDetail) {
    els.aiDetail.textContent = detail || "";
    els.aiDetail.style.display = detail ? "block" : "none";
  }
  if (els.narratorBadge) {
    els.narratorBadge.textContent = "narrator: unavailable";
    els.narratorBadge.classList.remove("llm-on");
    els.narratorBadge.classList.add("llm-off");
  }
  if (els.input) els.input.disabled = true;
  if (els.form) {
    const btn = els.form.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
  }
  // Clear active play so we don't continue a broken session silently
  current = null;
  cancelTypewriter();
  if (els.log) {
    els.log.innerHTML = `<div class="log-entry current">
      <div class="who">System</div>
      <div class="text">Game start blocked until the AI narrator link is restored.\n\n${escapeHtml(
        reason || ""
      )}${detail ? `\n\n${escapeHtml(detail)}` : ""}</div>
    </div>`;
  }
  renderOptions([]);
}

function hideAiError() {
  aiReady = true;
  if (els.aiBanner) els.aiBanner.classList.add("hidden");
  if (els.input) els.input.disabled = false;
  if (els.form) {
    const btn = els.form.querySelector("button[type=submit]");
    if (btn) btn.disabled = false;
  }
}

async function checkAiLink(force = false) {
  const path = force ? "/ai/status" : "/health";
  try {
    if (force) {
      const probe = await api(path);
      if (!probe.ok) {
        showAiError(probe.reason, probe.detail || "");
        return false;
      }
      hideAiError();
      if (els.narratorBadge) {
        els.narratorBadge.textContent = `narrator: LLM (${probe.model || "grok-4.5"})`;
        els.narratorBadge.classList.add("llm-on");
        els.narratorBadge.classList.remove("llm-off");
      }
      return true;
    }

    const health = await api(path);
    if (!health.ok || health.narrator === "unavailable" || health.ai?.ready === false) {
      showAiError(
        health.ai?.reason || health.reason || "AI narrator is not ready.",
        health.ai?.detail || health.detail || ""
      );
      return false;
    }
    hideAiError();
    if (els.narratorBadge) {
      els.narratorBadge.textContent = `narrator: LLM (${health.model || "grok-4.5"})`;
      els.narratorBadge.classList.add("llm-on");
      els.narratorBadge.classList.remove("llm-off");
    }
    return true;
  } catch (err) {
    const reason =
      err instanceof ApiError
        ? err.message
        : err.message || "Could not reach the game server.";
    const detail =
      err instanceof ApiError
        ? err.payload?.detail || err.payload?.ai?.detail || ""
        : "";
    showAiError(reason, detail);
    return false;
  }
}

function setActiveRun(runId) {
  localStorage.setItem(STORAGE_KEY, runId);
}

function getActiveRun() {
  return localStorage.getItem(STORAGE_KEY);
}

function cancelTypewriter() {
  typewriter.token += 1;
  typewriter.running = false;
  typewriter.skip = false;
  typewriter.activeKey = null;
  typewriter.completed = false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Types text into an element. Returns early if cancelled or skipped.
 * Click the current log entry (or press Enter again) to skip via typewriter.skip.
 */
/**
 * @param {HTMLElement} el
 * @param {string} text
 * @param {number} token
 * @param {{ sfx?: boolean }} [opts] — LCARS typewriter ticks when sfx:true
 */
async function typeText(el, text, token, opts = {}) {
  const withSfx = Boolean(opts.sfx);
  typewriter.fullText = text;
  typewriter.textEl = el;
  el.textContent = "";
  el.classList.add("typing");

  let i = 0;
  let ticks = 0;
  while (i < text.length) {
    if (token !== typewriter.token) return false;
    if (typewriter.skip) {
      el.textContent = text;
      break;
    }
    i = Math.min(text.length, i + TYPE_CHARS_PER_TICK);
    el.textContent = text.slice(0, i);
    // Keep the newest message visible while text grows
    if (i % 12 === 0) scrollLogToTop();
    // Soft LCARS tick while Narrator prose is typed (not every char)
    if (withSfx) {
      ticks += 1;
      if (ticks % 2 === 0) playTypeTick();
    }
    // Slightly faster on spaces/newlines so it doesn't feel sluggish
    const ch = text[i - 1];
    const delay =
      ch === "\n" ? TYPE_MS_PER_CHAR * 2 : ch === " " ? TYPE_MS_PER_CHAR * 0.5 : TYPE_MS_PER_CHAR;
    await sleep(delay);
  }

  el.classList.remove("typing");
  el.classList.add("typed");
  return token === typewriter.token;
}

function finishTypewriterExtras(entry, extras) {
  for (const extra of extras) {
    const d = document.createElement("div");
    d.className = extra.className;
    d.textContent = extra.text;
    entry.appendChild(d);
  }
}

/** Snapshot for TrekCore combat/phase SFX diffs */
let prevSfxState = null;
/** Last turn sceneId that already played narrator sfx[] */
let lastNarratorSfxSceneId = null;

function render(view, opts = {}) {
  const { forceTypewriter = false } = opts;
  const nextState = view.state;
  // Combat / phase SFX before overwriting current (compare prior ship)
  if (nextState) {
    playStateDeltaSfx(prevSfxState, nextState);

    // Narrator-authored SFX for this beat (once per sceneId)
    const sceneId = nextState.turn?.sceneId;
    const narratorCues = nextState.turn?.sfx;
    if (
      sceneId &&
      sceneId !== lastNarratorSfxSceneId &&
      Array.isArray(narratorCues) &&
      narratorCues.length
    ) {
      lastNarratorSfxSceneId = sceneId;
      // Slight delay so order-keyword SFX from Engage land first
      setTimeout(() => playNarratorSfx(narratorCues), 320);
    } else if (sceneId && sceneId !== lastNarratorSfxSceneId) {
      lastNarratorSfxSceneId = sceneId;
    }

    prevSfxState = {
      phase: nextState.phase,
      status: nextState.status,
      mission: nextState.mission
        ? {
            status: nextState.mission.status,
            flags: Array.isArray(nextState.mission.flags)
              ? [...nextState.mission.flags]
              : [],
            objectives: Array.isArray(nextState.mission.objectives)
              ? nextState.mission.objectives.map((o) => ({
                  id: o.id,
                  status: o.status,
                }))
              : [],
          }
        : null,
      turn: nextState.turn?.lastRoll
        ? { lastRoll: { ...nextState.turn.lastRoll } }
        : null,
      ship: nextState.ship
        ? {
            integrity: nextState.ship.integrity,
            maxIntegrity: nextState.ship.maxIntegrity,
            shieldIntegrity: nextState.ship.shieldIntegrity,
            systems: { ...(nextState.ship.systems || {}) },
            scars: Array.isArray(nextState.ship.scars)
              ? [...nextState.ship.scars]
              : [],
          }
        : null,
    };

    // Scene beds from order/narration keywords (light flavor)
    const blob = `${nextState.pendingQuestion || ""} ${
      nextState.turn?.narration || ""
    }`.toLowerCase();
    if (/sickbay|medical|infirmary|hypo/.test(blob)) setSceneBed("sickbay");
    else if (/engineering|warp core|jefferies|dilithium/.test(blob)) {
      setSceneBed("engineering");
    } else if (nextState.phase !== "playing") {
      setSceneBed(null);
    }
  }
  current = view;
  const s = view.state;
  setActiveRun(s.runId);

  // Keep the player's speech preference (default on). Older runs stored
  // speechOn:false and must not flip narration off on load.
  updateVoiceToggleUi();

  // Phase badge: during debrief show clear success / failure
  updatePhaseBadge(s);
  updateRedAlertUi(s);
  renderStarbaseScreen(s);
  renderMissionBoard(s);
  // Model badge is header-hidden (debug); keep Run panel as the debug surface
  if (els.narratorBadge) {
    const mode = view.narrator || "unknown";
    const model = view.model || "";
    els.narratorBadge.textContent =
      mode === "llm" ? `narrator: LLM (${model})` : `narrator: ${mode}`;
  }
  const nv = s.narratorVoice;
  els.run.innerHTML = [
    `Run: ${s.runId.slice(0, 8)}…`,
    `Captain: ${s.playerName || "—"}`,
    `Status: ${s.status}`,
    `Difficulty: ${s.difficulty || "—"}`,
    `Narrator: ${view.narrator || "—"}${view.model ? ` / ${view.model}` : ""}`,
    `Voice: ${voice.enabled ? "auto-on" : "off"}${
      nv ? ` · GM ${nv.voiceName || nv.voiceId}` : ""
    } · ${voice.speed}×`,
  ].join("\n");

  renderShip(s.ship);
  renderCrew(s.ship, s.playerName);
  renderObjectives(s.mission, s);
  renderMeta(view.metaCommands, s.phase);
  // Options appear after typewriter finishes (unless no narration)
  renderLog(s, { forceTypewriter });
  renderViewscreen(s);
}

function isVoiceMenuOpen() {
  return Boolean(els.voiceMenu && !els.voiceMenu.classList.contains("hidden"));
}

function setVoiceMenuOpen(open, anchor = null) {
  if (!els.voiceMenu) return;
  els.voiceMenu.classList.toggle("hidden", !open);
  if (els.btnVoiceMenu) {
    els.btnVoiceMenu.setAttribute("aria-expanded", open ? "true" : "false");
  }
  document.querySelectorAll(".hub-voice-menu").forEach((btn) => {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  if (open && anchor) {
    const r = anchor.getBoundingClientRect();
    els.voiceMenu.style.position = "fixed";
    els.voiceMenu.style.left = `${Math.min(r.right + 8, window.innerWidth - 280)}px`;
    els.voiceMenu.style.top = `${Math.max(8, r.top)}px`;
    els.voiceMenu.style.zIndex = "80";
  } else {
    els.voiceMenu.style.position = "";
    els.voiceMenu.style.left = "";
    els.voiceMenu.style.top = "";
    els.voiceMenu.style.zIndex = "";
  }
}

function toggleVoiceMenu() {
  setVoiceMenuOpen(!isVoiceMenuOpen());
}

function updateVoiceToggleUi() {
  if (els.btnVoice) {
    els.btnVoice.setAttribute("aria-pressed", voice.enabled ? "true" : "false");
    let label = "Voice: Off";
    if (voice.enabled) {
      if (voice.paused && voice.speaking) label = "Voice: Paused";
      else if (voice.speaking) label = "Voice: …";
      else label = "Voice: On";
    }
    els.btnVoice.textContent = label;
    els.btnVoice.classList.toggle(
      "is-speaking",
      Boolean(voice.speaking && !voice.paused)
    );
    els.btnVoice.title = voice.enabled
      ? "Auto-voice on — click to disable. Use ▾ for speed and pause."
      : "Auto-voice off — click to enable. Use ▾ for options.";
  }
  document.querySelectorAll(".hub-voice-toggle").forEach((btn) => {
    let label = "Voice: Off";
    if (voice.enabled) {
      if (voice.paused && voice.speaking) label = "Voice: Paused";
      else if (voice.speaking) label = "Voice: …";
      else label = "Voice: On";
    }
    btn.textContent = label;
    btn.setAttribute("aria-pressed", voice.enabled ? "true" : "false");
  });

  const active = Boolean(voice.speaking);
  if (els.btnVoicePause) {
    els.btnVoicePause.disabled = !active && !voice.paused;
    els.btnVoicePause.textContent = voice.paused ? "Resume" : "Pause";
    els.btnVoicePause.classList.toggle("is-paused", Boolean(voice.paused));
    els.btnVoicePause.setAttribute("aria-pressed", voice.paused ? "true" : "false");
  }
  if (els.btnVoiceStop) {
    els.btnVoiceStop.disabled = !active && !voice.paused;
  }
  if (els.voiceSpeed && String(els.voiceSpeed.value) !== String(voice.speed)) {
    els.voiceSpeed.value = String(voice.speed);
  }

  // Reflect live speed; volume always full
  if (voice.audio) {
    try {
      voice.audio.playbackRate = voice.speed;
      voice.audio.volume = 1;
    } catch {
      /* ignore */
    }
  }
}

function stopVoicePlayback() {
  voice.token += 1;
  voice.speaking = false;
  voice.paused = false;
  notifyPauseWaiters();
  if (voice.audio) {
    try {
      voice.audio.pause();
      voice.audio.src = "";
    } catch {
      /* ignore */
    }
    voice.audio = null;
  }
  if (voice.objectUrl) {
    try {
      URL.revokeObjectURL(voice.objectUrl);
    } catch {
      /* ignore */
    }
    voice.objectUrl = null;
  }
  setSpeechBedsDucked(false);
  updateVoiceToggleUi();
}

function pauseVoicePlayback() {
  if (!voice.speaking || voice.paused) return;
  voice.paused = true;
  if (voice.audio) {
    try {
      voice.audio.pause();
    } catch {
      /* ignore */
    }
  }
  updateVoiceToggleUi();
  voiceLog("paused");
}

function resumeVoicePlayback() {
  if (!voice.paused) return;
  voice.paused = false;
  notifyPauseWaiters();
  if (voice.audio) {
    voice.audio.playbackRate = voice.speed;
    voice.audio.volume = 1;
    voice.audio.play().catch((err) => {
      console.warn("Resume blocked:", err?.message || err);
    });
  }
  updateVoiceToggleUi();
  voiceLog("resumed");
}

function toggleVoicePause() {
  if (voice.paused) resumeVoicePlayback();
  else pauseVoicePlayback();
}

function setVoiceSpeed(speed) {
  const n = Number(speed);
  if (![0.75, 1, 1.25, 1.5].includes(n)) return;
  voice.speed = n;
  localStorage.setItem(VOICE_SPEED_KEY, String(n));
  if (voice.audio) {
    try {
      voice.audio.playbackRate = n;
    } catch {
      /* ignore */
    }
  }
  updateVoiceToggleUi();
}

/** Split narration into clickable paragraphs for per-section replay. */
function splitNarrationParagraphs(text) {
  const cleaned = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  let parts = cleaned.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1 && parts[0].includes("\n")) {
    const byLine = parts[0].split(/\n+/).map((p) => p.trim()).filter(Boolean);
    if (byLine.length > 1) parts = byLine;
  }
  return parts.length ? parts : [cleaned];
}

function clearSpeakableHighlight() {
  document
    .querySelectorAll(".speakable.is-speaking-line")
    .forEach((el) => el.classList.remove("is-speaking-line"));
}

function markSpeakable(el, { speaker, text }) {
  el.classList.add("speakable");
  el.dataset.voiceSpeaker = speaker || "narrator";
  el.dataset.voiceText = text || "";
  el.title = "Click to play this line";
  el.setAttribute("role", "button");
  el.tabIndex = 0;
}

/**
 * Replace a plain narration text node with clickable paragraph blocks.
 */
function fillSpeakableNarration(container, fullText) {
  container.innerHTML = "";
  container.classList.add("narration-body");
  const paragraphs = splitNarrationParagraphs(fullText);
  for (const p of paragraphs) {
    const block = document.createElement("p");
    block.className = "narration-para";
    block.textContent = p;
    markSpeakable(block, { speaker: "narrator", text: p });
    container.appendChild(block);
  }
}

function fillSpeakableCrewLine(el, speaker, line) {
  const display = `${speaker}: "${line}"`;
  el.textContent = display;
  el.classList.add("crew-line");
  markSpeakable(el, { speaker, text: line });
}

/**
 * Replay a single speaker clip (paragraph or crew line).
 * Works as a one-shot even if auto-voice is off (user click unlocks audio).
 */
async function replaySpeech(speaker, text, highlightEl = null) {
  const runId = current?.state?.runId;
  const clip = String(text || "").trim();
  if (!runId || !aiReady || !clip) return;

  // Cancel auto-queue / current audio, start a dedicated replay token
  stopVoicePlayback();
  const token = voice.token;
  voice.paused = false;
  voice.speaking = true;
  setSpeechBedsDucked(true);
  clearSpeakableHighlight();
  if (highlightEl) highlightEl.classList.add("is-speaking-line");
  updateVoiceToggleUi();

  voiceLog("replay_start", {
    speaker,
    chars: clip.length,
    preview: clip.slice(0, 60),
  });

  const chunks = chunkTextForSpeech(clip);
  try {
    let nextFetch = fetchSpeechBlob(runId, {
      speaker: speaker || "narrator",
      text: chunks[0],
    });

    for (let i = 0; i < chunks.length; i++) {
      if (token !== voice.token) return;
      await waitWhilePaused(token);
      if (token !== voice.token) return;

      const result = await nextFetch;
      if (token !== voice.token) return;

      if (i + 1 < chunks.length) {
        nextFetch = fetchSpeechBlob(runId, {
          speaker: speaker || "narrator",
          text: chunks[i + 1],
        });
      }

      const ok = await playBlob(result.blob, token, {
        chunkIndex: i,
        speaker,
        chars: chunks[i].length,
        isLastChunk: i === chunks.length - 1,
      });
      if (!ok) break;
    }
  } catch (err) {
    console.warn("Replay speech failed:", err?.message || err);
    showSoftError(
      "Could not play that line.",
      err?.message || "Voice synthesis failed."
    );
  } finally {
    if (token === voice.token) {
      voice.speaking = false;
      voice.paused = false;
      setSpeechBedsDucked(false);
      clearSpeakableHighlight();
      updateVoiceToggleUi();
    }
  }
}

function handleSpeakableActivate(el) {
  if (!el || typewriter.running) return;
  const speaker = el.dataset.voiceSpeaker || "narrator";
  const text = el.dataset.voiceText || el.textContent || "";
  replaySpeech(speaker, text, el);
}

/**
 * Split long narration into short chunks so the first audio returns quickly.
 * Mirrors server chunkTextForTts (~420 chars at sentence boundaries).
 */
function chunkTextForSpeech(text, maxChunk = 420) {
  const cleaned = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunk) return [cleaned];

  const parts = [];
  const sentences = cleaned.split(/(?<=[.!?…])\s+|\n\n+/).filter(Boolean);
  let buf = "";
  for (const sentence of sentences) {
    const next = buf ? `${buf} ${sentence}` : sentence;
    if (next.length <= maxChunk) {
      buf = next;
      continue;
    }
    if (buf) parts.push(buf.trim());
    if (sentence.length <= maxChunk) {
      buf = sentence;
    } else {
      let rest = sentence;
      while (rest.length > maxChunk) {
        let cut = rest.lastIndexOf(" ", maxChunk);
        if (cut < maxChunk * 0.5) cut = maxChunk;
        parts.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      buf = rest;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.filter(Boolean);
}

/**
 * Fetch one TTS chunk. Returns { blob, serverTiming, clientMs }.
 */
async function fetchSpeechBlob(runId, body) {
  const t0 = performance.now();
  const res = await fetch(`/api/games/${runId}/voice/speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  const tHeaders = performance.now();
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.reason || payload.error || `TTS ${res.status}`);
  }
  const serverTiming = {
    resolveMs: Number(res.headers.get("X-Voice-Ms-Resolve") || 0),
    cacheMs: Number(res.headers.get("X-Voice-Ms-Cache") || 0),
    xaiMs: Number(res.headers.get("X-Voice-Ms-Xai") || 0),
    synthMs: Number(res.headers.get("X-Voice-Ms-Synth") || 0),
    totalMs: Number(res.headers.get("X-Voice-Ms-Total") || 0),
    cached: res.headers.get("X-Voice-Cached") === "1",
    voiceId: res.headers.get("X-Voice-Id") || "",
    chars: Number(res.headers.get("X-Voice-Chars") || body.text?.length || 0),
  };
  const blob = await res.blob();
  const clientMs = Math.round(performance.now() - t0);
  const downloadMs = Math.round(performance.now() - tHeaders);
  return { blob, serverTiming, clientMs, downloadMs, ttfbMs: Math.round(tHeaders - t0) };
}

async function playBlob(blob, token, meta = {}) {
  if (token !== voice.token) return false;

  // Honor pause before starting the next chunk
  await waitWhilePaused(token);
  // Note: allow one-shot click-to-replay even when auto-voice (voice.enabled) is off
  if (token !== voice.token) return false;

  const tPlay0 = performance.now();
  if (voice.objectUrl) {
    try {
      URL.revokeObjectURL(voice.objectUrl);
    } catch {
      /* ignore */
    }
  }
  const url = URL.createObjectURL(blob);
  voice.objectUrl = url;
  const audio = new Audio(url);
  audio.playbackRate = voice.speed;
  audio.volume = 1;
  voice.audio = audio;
  voice.speaking = true;
  updateVoiceToggleUi();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (token === voice.token) {
        // Keep speaking=true if more chunks remain — caller manages end state
        if (!ok || meta.isLastChunk) {
          voice.speaking = false;
          voice.paused = false;
        }
        updateVoiceToggleUi();
      }
      resolve(ok);
    };

    audio.addEventListener("ended", () => finish(true));
    audio.addEventListener("error", () =>
      reject(new Error("Audio playback failed"))
    );

    const onPlaying = () => {
      const playStartMs = Math.round(performance.now() - tPlay0);
      const sinceText =
        voice.textReadyAt > 0
          ? Math.round(performance.now() - voice.textReadyAt)
          : null;
      voiceLog("playback_started", {
        chunk: meta.chunkIndex,
        speaker: meta.speaker,
        chars: meta.chars,
        speed: voice.speed,
        playStartMs,
        sinceTextReadyMs: sinceText,
        isFirstChunk: meta.chunkIndex === 0,
      });
      audio.removeEventListener("playing", onPlaying);
    };
    audio.addEventListener("playing", onPlaying);

    // If user paused while we were fetching, wait again
    const start = async () => {
      await waitWhilePaused(token);
      if (token !== voice.token) {
        finish(false);
        return;
      }
      try {
        await audio.play();
      } catch (err) {
        console.warn("Voice playback blocked:", err?.message || err);
        finish(false);
      }
    };
    start();
  });
}

/**
 * Expand a dialogue line into TTS units (speaker + short text chunks).
 * Narration is chunked; short crew lines stay one unit.
 */
/** Crew dialogue only during tutorial / active mission / debrief — never bare setup */
function phaseAllowsCrewDialogue(phase) {
  return (
    phase === "tutorial" ||
    phase === "playing" ||
    phase === "debrief" ||
    phase === "post_mission"
  );
}

function activeCrewDialogue(state) {
  if (!phaseAllowsCrewDialogue(state?.phase)) return [];
  return state.turn?.crewDialogue || [];
}

function buildSpeechQueue(state) {
  const units = [];
  if (state.pendingQuestion?.trim()) {
    for (const chunk of chunkTextForSpeech(state.pendingQuestion.trim())) {
      units.push({ speaker: "narrator", text: chunk });
    }
  }
  for (const line of activeCrewDialogue(state)) {
    if (!line?.line?.trim()) continue;
    const chunks = chunkTextForSpeech(line.line.trim(), 360);
    for (const chunk of chunks) {
      units.push({ speaker: line.speaker, text: chunk });
    }
  }
  return units;
}

/**
 * Auto-play with progressive chunks + one-ahead prefetch for low time-to-first-audio.
 * Timing: voice.textReadyAt is set when narration text lands in the UI.
 */
async function autoSpeakBeat(state) {
  if (!voice.enabled || !state?.runId || !aiReady) return;
  const token = ++voice.token;
  voice.paused = false;
  notifyPauseWaiters();
  const beatStart = performance.now();
  // Prefer text-ready stamp set by renderLog; fall back to now
  if (!voice.textReadyAt) voice.textReadyAt = beatStart;

  if (voice.audio) {
    try {
      voice.audio.pause();
    } catch {
      /* ignore */
    }
    voice.audio = null;
  }

  const units = buildSpeechQueue(state);
  if (!units.length) {
    voiceLog("no_speech_units");
    return;
  }

  voice.speaking = true;
  setSpeechBedsDucked(true);
  updateVoiceToggleUi();

  voiceLog("beat_start", {
    runId: state.runId.slice(0, 8),
    phase: state.phase,
    units: units.length,
    firstChars: units[0].text.length,
    totalChars: units.reduce((n, u) => n + u.text.length, 0),
    speakers: [...new Set(units.map((u) => u.speaker))],
    speed: voice.speed,
  });

  try {
    // Prefetch first chunk immediately
    let nextFetch = fetchSpeechBlob(state.runId, {
      speaker: units[0].speaker,
      text: units[0].text,
    });

    for (let i = 0; i < units.length; i++) {
      if (token !== voice.token || !voice.enabled) break;

      await waitWhilePaused(token);
      if (token !== voice.token || !voice.enabled) break;

      const result = await nextFetch;
      if (token !== voice.token || !voice.enabled) break;

      const sinceText = Math.round(performance.now() - voice.textReadyAt);
      voiceLog("chunk_ready", {
        chunk: i,
        speaker: units[i].speaker,
        chars: units[i].text.length,
        clientFetchMs: result.clientMs,
        ttfbMs: result.ttfbMs,
        downloadMs: result.downloadMs,
        server: result.serverTiming,
        sinceTextReadyMs: sinceText,
        firstAudioReady: i === 0,
      });

      // Start next fetch while this chunk plays
      if (i + 1 < units.length) {
        nextFetch = fetchSpeechBlob(state.runId, {
          speaker: units[i + 1].speaker,
          text: units[i + 1].text,
        });
      }

      const ok = await playBlob(result.blob, token, {
        chunkIndex: i,
        speaker: units[i].speaker,
        chars: units[i].text.length,
        isLastChunk: i === units.length - 1,
      });
      if (!ok && token === voice.token) {
        // Playback blocked or cancelled
        break;
      }
    }

    voiceLog("beat_complete", {
      totalMs: Math.round(performance.now() - beatStart),
      sinceTextReadyMs: Math.round(performance.now() - voice.textReadyAt),
      units: units.length,
    });
  } catch (err) {
    console.warn("Auto-voice failed:", err?.message || err);
    voiceLog("beat_error", { error: err?.message || String(err) });
  } finally {
    if (token === voice.token) {
      voice.speaking = false;
      voice.paused = false;
      setSpeechBedsDucked(false);
      updateVoiceToggleUi();
    }
  }
}

async function toggleVoice() {
  // User gesture unlocks audio on Safari/Chrome
  const next = !voice.enabled;
  voice.enabled = next;
  localStorage.setItem(VOICE_PREF_KEY, next ? "1" : "0");
  updateVoiceToggleUi();

  if (!next) {
    stopVoicePlayback();
  }

  const runId = current?.state?.runId;
  if (runId && aiReady) {
    try {
      const view = await api(`/games/${runId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ speechOn: next }),
      });
      current = {
        ...current,
        state: {
          ...current.state,
          settings: view.state.settings,
          narratorVoice: view.state.narratorVoice || current.state.narratorVoice,
        },
      };
      if (typeof view.state.settings?.speechOn === "boolean") {
        voice.enabled = view.state.settings.speechOn;
      }
      updateVoiceToggleUi();
    } catch (err) {
      console.warn("Failed to persist voice setting:", err?.message || err);
    }
  }

  if (voice.enabled && current?.state) {
    // Speak current beat immediately when turning on
    autoSpeakBeat(current.state);
  }
}

/** Classify a scar string into an icon + label for the ship panel grid */
function classifyScar(text) {
  const t = String(text || "").toLowerCase();
  if (/shield/.test(t)) {
    return { type: "shields", label: "Shields", icon: "🛡️", tone: "shield" };
  }
  if (/torpedo|phaser|weapon|armory|barrage|firepower/.test(t)) {
    return { type: "weapons", label: "Weapons", icon: "💥", tone: "weapons" };
  }
  if (/warp|nacelle|impulse|engine|engineering|power|scott/.test(t)) {
    return { type: "engines", label: "Engines", icon: "⚙️", tone: "engines" };
  }
  if (/sensor|scan|comm|hail|frequency|uhura|data/.test(t)) {
    return { type: "sensors", label: "Sensors", icon: "📡", tone: "sensors" };
  }
  if (/board|transporter|corridor|away.?team|intruder/.test(t)) {
    return { type: "boarding", label: "Boarding", icon: "🚪", tone: "boarding" };
  }
  if (/hull|integrity|amidship|structural|damage|scar|crippl/.test(t)) {
    return { type: "hull", label: "Hull", icon: "🔩", tone: "hull" };
  }
  if (/life support|casualt|medical|mccoy|dying|rescue|freighter/.test(t)) {
    return { type: "crew", label: "Crew risk", icon: "❤️", tone: "crew" };
  }
  if (/pincer|cloak|raid|enemy|tactical|combat|decept|surrender/.test(t)) {
    return { type: "tactical", label: "Tactical", icon: "⚔️", tone: "tactical" };
  }
  return { type: "general", label: "Scar", icon: "⚠️", tone: "general" };
}

function openScarModal(scarText, index, total) {
  uiSound("scar-open");
  const meta = classifyScar(scarText);
  if (els.scarModalIcon) els.scarModalIcon.textContent = meta.icon;
  if (els.scarModalType) els.scarModalType.textContent = meta.label;
  if (els.scarModalTitle) els.scarModalTitle.textContent = `${meta.label} scar`;
  if (els.scarModalIndex) {
    els.scarModalIndex.textContent = `Record ${index + 1} of ${total}`;
  }
  if (els.scarModalBody) els.scarModalBody.textContent = scarText;
  if (els.scarModal) {
    els.scarModal.classList.remove("hidden");
    els.scarModal.dataset.tone = meta.tone;
  }
}

function closeScarModal() {
  uiSound("scar-close");
  els.scarModal?.classList.add("hidden");
}

function systemDisplayName(key) {
  const names = {
    shields: "Shields",
    torpedoes: "Torpedoes",
    warp: "Warp",
    communications: "Comms",
    sensors: "Sensors",
    lifeSupport: "Life support",
  };
  return names[key] || key;
}

function universeStandingHtml(universe) {
  if (!universe?.factionReputation) return "";
  const bits = Object.entries(universe.factionReputation)
    .filter(([, v]) => Math.abs(Number(v)) >= 5)
    .map(
      ([k, v]) =>
        `${k} ${Number(v) > 0 ? "+" : ""}${v}`
    );
  const flags = Array.isArray(universe.galacticFlags)
    ? universe.galacticFlags.slice(0, 3)
    : [];
  if (!bits.length && !flags.length) return "";
  return `<div class="ship-meta universe-standing" title="${escapeHtml(
    flags.join(", ") || "standing"
  )}">${escapeHtml(bits.join(" · ") || "neutral")}${
    flags.length ? ` · ${escapeHtml(flags.join(", "))}` : ""
  }</div>`;
}

function renderIntegrityBar(label, value, max, tone, statusText) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  const low = pct <= 25 ? " is-critical" : pct <= 50 ? " is-low" : "";
  return `<div class="integrity-bar integrity-${tone}${low}" role="meter"
      aria-label="${escapeHtml(label)}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}">
    <div class="integrity-bar-head">
      <span class="integrity-bar-label">${escapeHtml(label)}</span>
      <span class="integrity-bar-value">${value}/${max}${
        statusText ? ` · ${escapeHtml(statusText)}` : ""
      }</span>
    </div>
    <div class="integrity-bar-track">
      <div class="integrity-bar-fill" style="width:${pct}%"></div>
    </div>
  </div>`;
}

function renderShip(ship) {
  if (!ship) {
    els.ship.className = "panel-body muted";
    els.ship.textContent = "No ship selected";
    return;
  }
  els.ship.className = "panel-body ship-panel";

  const maxHull = ship.maxIntegrity ?? 100;
  const hull = typeof ship.integrity === "number" ? ship.integrity : maxHull;
  const maxShield = shieldDisplayCap(ship);
  const shield =
    typeof ship.shieldIntegrity === "number" ? ship.shieldIntegrity : maxShield;
  const gridOnline =
    typeof ship.shieldGridOnline === "boolean"
      ? ship.shieldGridOnline
      : shield > 0;
  const recharge = ship.shieldRechargeTurns ?? 0;
  const shieldSys = ship.systems?.shields || "ok";

  let shieldStatus = "online";
  if (shieldSys === "destroyed") shieldStatus = "destroyed";
  else if (!gridOnline) {
    shieldStatus =
      recharge > 0 ? `recharging ${recharge}t` : "offline";
  } else if (shieldSys === "damaged") {
    shieldStatus = "damaged";
  }

  const systems = Object.entries(ship.systems || {})
    .map(([k, v]) => {
      const offline =
        v !== "ok" ? ` sys-${escapeHtml(v)}` : "";
      return `<div class="sys-row${offline}" title="${escapeHtml(
        systemDisplayName(k)
      )}: ${escapeHtml(v)}">
        <span class="sys-name">${escapeHtml(systemDisplayName(k))}</span>
        <span class="sys-status sys-${escapeHtml(v)}">${escapeHtml(v)}</span>
      </div>`;
    })
    .join("");

  const scars = Array.isArray(ship.scars) ? ship.scars : [];
  const scarsOpen = loadPanelExpandedPrefs().scars === true;
  const scarSummary = scars.length
    ? `${scars.length} on record`
    : "No lasting damage";
  const scarChips = scars.length
    ? `<div class="scar-grid" role="list">
          ${scars
            .map((scar, i) => {
              const meta = classifyScar(scar);
              const title = scar.length > 48 ? `${scar.slice(0, 48)}…` : scar;
              return `<button type="button" class="scar-chip tone-${meta.tone}" role="listitem"
                data-scar-index="${i}" title="${escapeHtml(title)}"
                aria-label="${escapeHtml(meta.label)} scar: ${escapeHtml(title)}">
                <span class="scar-chip-icon" aria-hidden="true">${meta.icon}</span>
                <span class="scar-chip-label">${escapeHtml(meta.label)}</span>
              </button>`;
            })
            .join("")}
        </div>`
    : `<div class="scar-empty-text">No lasting damage recorded</div>`;
  const scarGrid = `<div class="scar-section collapsible-panel ${
    scarsOpen ? "is-expanded" : "is-collapsed"
  }${scars.length ? "" : " scar-empty"}">
        <button type="button" class="scar-collapse-toggle" id="scar-collapse-toggle"
          aria-expanded="${scarsOpen ? "true" : "false"}"
          aria-controls="scar-collapse-body"
          title="Show or hide ship scars">
          <span class="collapse-chevron" aria-hidden="true">${scarsOpen ? "▾" : "▸"}</span>
          <span class="collapse-label">Scars</span>
          ${
            scars.length
              ? `<span class="scar-count">${scars.length}</span>`
              : ""
          }
          <span class="collapse-summary">${escapeHtml(scarSummary)}</span>
        </button>
        <div class="collapsible-body" id="scar-collapse-body">
          <div class="collapsible-body-inner scar-collapse-inner">
            ${scarChips}
          </div>
        </div>
      </div>`;

  const registry =
    ship.registryNumber ||
    (String(ship.name || "").match(/\b((?:NCC|NX)[-\s]?\d[\w-]*)\b/i) ||
      [])[1] ||
    "";
  els.ship.innerHTML = `
    <div class="ship-identity">
      <strong>${escapeHtml(ship.name)}</strong>
      ${
        registry
          ? `<div class="ship-registry">${escapeHtml(
              String(registry).toUpperCase().replace(/\s+/g, "-").replace(/^(NCC|NX)(?!-)/, "$1-")
            )}</div>`
          : ""
      }
      <div class="ship-meta">${escapeHtml(ship.className)}</div>
      <div class="ship-meta">Stardate ${escapeHtml(
        current?.state?.universe?.stardate || ship.stardate
      )}</div>
      ${universeStandingHtml(current?.state?.universe)}
    </div>
    <div class="integrity-bars">
      ${renderIntegrityBar("Hull", hull, maxHull, "hull", "")}
      ${renderIntegrityBar("Shields", shield, maxShield, "shields", shieldStatus)}
    </div>
    <div class="ship-systems-block">
      <div class="systems-label">Systems</div>
      ${systems}
    </div>
    ${
      ship.skills?.total
        ? `<div class="ship-skills-block">
        <div class="systems-label">Ship skills</div>
        <div class="skill-grid">${Object.entries(ship.skills.total)
          .map(([k, v]) => {
            const n = Number(v) || 0;
            const band = Math.min(10, Math.floor(n / 10));
            return `<div class="skill-row" title="${escapeHtml(
              k
            )} ${n}/100">
              <span class="skill-name">${escapeHtml(k)}</span>
              <span class="skill-bar" aria-hidden="true"><span class="skill-bar-fill" style="width:${n}%"></span></span>
              <span class="skill-val">${n}<span class="skill-band">b${band}</span></span>
            </div>`;
          })
          .join("")}</div>
      </div>`
        : ""
    }
    ${scarGrid}
  `;

  els.ship.querySelectorAll(".scar-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-scar-index"));
      if (!Number.isNaN(idx) && scars[idx]) {
        openScarModal(scars[idx], idx, scars.length);
      }
    });
  });
  const scarPanel = els.ship.querySelector(".scar-section");
  const scarToggle = els.ship.querySelector(".scar-collapse-toggle");
  if (scarPanel && scarToggle) {
    scarToggle.addEventListener("click", () => {
      togglePanel(scarPanel, scarToggle);
    });
  }
}

let portraitRequestFor = null;
let portraitsGenerating = false;

/** Viewscreen journey-book rotation */
let viewscreenRotateTimer = null;
let viewscreenPollTimer = null;
let viewscreenDisplayIndex = 0;

/** Starfleet “Incoming Communication” poster for mission-start boot */
const INCOMING_COMM_URL = "/assets/incoming-communication.png";

/**
 * Mission start gate (after name + ship + accept brief):
 * 1) Expand viewscreen with Incoming Communication
 * 2) Generate crew profiles (images + voice locks)
 * 3) Collapse viewscreen
 * 4) Then type/play the first gamemaster message
 */
let missionBoot = {
  active: false,
  token: 0,
  runId: null,
  /** Full game view held until crew is ready, then rendered as opening beat */
  pendingView: null,
};

function crewInitials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function crewNeedsPortrait(c) {
  return !c.imageUrl && c.portraitStatus !== "ready";
}

function isCommandingCaptainRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return false;
  if (/engineer|security|of\s/.test(r)) return false;
  return /^(the\s+)?(captain|co|c\.o\.|commanding officer|commanding|cmdg\.?\s*officer)$/i.test(
    r
  );
}

function stripOfficerRankPrefix(name) {
  return String(name || "")
    .replace(
      /^(captain|cmdr\.?|commander|lt\.?\s*cmdr\.?|lt\.?\s*j\.g\.?|lieutenant|ensign|ens\.?)\s+/i,
      ""
    )
    .trim();
}

function displayBridgeCrew(crew) {
  const list = (crew || []).map((c) => ({
    ...c,
    name: stripOfficerRankPrefix(c.name) || c.name,
  }));
  let hasXo = list.some((c) =>
    /first officer|\bxo\b|executive/i.test(String(c.role || ""))
  );
  return list.map((c) => {
    if (!isCommandingCaptainRole(c.role || "")) return c;
    if (!hasXo) {
      hasXo = true;
      return { ...c, role: "First Officer" };
    }
    return { ...c, role: "Command Officer" };
  });
}

function renderCrew(ship, playerName = "") {
  if (!ship?.crew?.length && !playerName) {
    els.crew.className = "panel-body crew-panel muted";
    els.crew.textContent = "—";
    return;
  }

  const officers = displayBridgeCrew(ship?.crew || []);
  const pendingCount = officers.filter(crewNeedsPortrait).length;
  const showGenerating = portraitsGenerating && pendingCount > 0;

  els.crew.className = "panel-body crew-panel";
  els.crew.innerHTML =
    (showGenerating
      ? `<div class="crew-imaging-banner" role="status" aria-live="polite">
          <span class="crew-imaging-spinner" aria-hidden="true"></span>
          <span>Imaging crew… <span class="crew-imaging-count">${pendingCount} remaining</span></span>
        </div>`
      : "") +
    officers
      .map((c) => {
        const loyalty = typeof c.loyalty === "number" ? c.loyalty : 50;
        const needsImg = crewNeedsPortrait(c);
        const generating = showGenerating && needsImg;
        const status = generating
          ? "generating"
          : c.portraitStatus || (c.imageUrl ? "ready" : "none");
        const photo = c.imageUrl
          ? `<img class="crew-fill-photo" src="${escapeHtml(
              c.imageUrl
            )}" alt="${escapeHtml(c.name)}" loading="lazy" draggable="false" />`
          : `<div class="crew-fill-photo placeholder" aria-hidden="true">${escapeHtml(
              crewInitials(c.name)
            )}</div>`;

        return `<article class="crew-tab${
          generating ? " is-imaging" : ""
        }" data-crew-id="${escapeHtml(c.id)}">
        <div class="crew-card-face">
          ${photo}
          ${
            generating
              ? `<div class="crew-imaging-overlay" aria-hidden="true">
                   <span class="crew-imaging-spinner"></span>
                   <span class="crew-imaging-label">Imaging</span>
                 </div>`
              : ""
          }
          <div class="crew-card-gradient"></div>
          <div class="crew-card-overlay">
            <div class="crew-tab-name">${escapeHtml(c.name)}</div>
            <div class="crew-tab-role">${escapeHtml(c.role)}</div>
          </div>
        </div>
        <div class="crew-tab-details">
          <div class="crew-detail-grid">
            <div><span class="crew-label">Species</span>${escapeHtml(
              c.species || "Unknown"
            )}</div>
            <div><span class="crew-label">Loyalty</span>${loyalty}%</div>
            <div><span class="crew-label">Status</span>${escapeHtml(
              c.status || "active"
            )}</div>
            <div><span class="crew-label">Service</span>${
              typeof c.serviceTurns === "number" ? c.serviceTurns : 0
            } turns</div>
            <div class="crew-span"><span class="crew-label">Personality</span>${escapeHtml(
              c.personality || "—"
            )}</div>
            <div class="crew-span"><span class="crew-label">Dossier</span>${escapeHtml(
              c.bio || "No dossier on file."
            )}</div>
            <div class="crew-span"><span class="crew-label">Voice</span>${escapeHtml(
              c.voice
                ? `${c.voice.voiceName || c.voice.voiceId} · ${c.voice.baselineTone || "locked"}`
                : "unassigned"
            )}</div>
            <div class="crew-span crew-portrait-status"><span class="crew-label">Portrait</span>${escapeHtml(
              status
            )}</div>
            ${
              c.status === "dead"
                ? `<div class="crew-span crew-kia"><span class="crew-label">KIA</span>${escapeHtml(
                    c.deathCause || "lost in the line of duty"
                  )}</div>`
                : ""
            }
            ${crewAdviceBlockHtml(c)}
          </div>
        </div>
      </article>`;
      })
      .join("");

  bindCrewCardExpandHandlers(officers);
  bindCrewAdviceButtons(officers);
  // Image crew once a ship is assigned (ship select init, mission boot, or playing)
  if (current?.state?.ship?.crew?.length) {
    maybeRequestPortraits();
  }
}

function crewAdviceBlockHtml(c) {
  const active = (c.status || "active") === "active";
  const last = current?.state?.lastAdvice;
  const lastNote =
    last?.memberId === c.id && last.advice
      ? `<div class="crew-span crew-last-advice"><span class="crew-label">Last consult</span>${escapeHtml(
          String(last.advice).slice(0, 180)
        )}</div>`
      : "";
  return `${lastNote}<div class="crew-span crew-advice-block">
              <label class="crew-label" for="advice-q-${escapeHtml(
                c.id
              )}">Consult</label>
              <input
                id="advice-q-${escapeHtml(c.id)}"
                type="text"
                class="crew-advice-q"
                maxlength="140"
                placeholder="Optional question"
                data-advice-id="${escapeHtml(c.id)}"
                ${active ? "" : "disabled "}
                autocomplete="off"
              />
              <button
                type="button"
                class="lcars-btn secondary crew-advice-btn"
                data-advice-id="${escapeHtml(c.id)}"
                ${active ? "" : "disabled "}
                title="${
                  active
                    ? "Ask this officer for advice (does not spend a turn)"
                    : "Only active officers can advise"
                }"
              >Ask for advice</button>
            </div>`;
}

function bindCrewAdviceButtons(crew) {
  if (!els.crew) return;
  els.crew.querySelectorAll(".crew-advice-q").forEach((input) => {
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        const id = input.getAttribute("data-advice-id");
        if (id && !input.disabled) void askCrewAdvice(id, input.value);
      }
    });
  });
  els.crew.querySelectorAll(".crew-advice-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      const id = btn.getAttribute("data-advice-id");
      const q = els.crew.querySelector(`.crew-advice-q[data-advice-id="${id}"]`);
      if (id) void askCrewAdvice(id, q?.value);
    });
  });
}

async function askCrewAdvice(memberId, question) {
  const runId = current?.state?.runId;
  if (!runId || !aiReady) {
    showSoftError("Cannot request advice while offline.");
    return;
  }
  uiSound("soft");
  const q = String(question || "").trim();
  try {
    const out = await api(`/games/${runId}/crew/advice`, {
      method: "POST",
      body: JSON.stringify(q ? { memberId, question: q } : { memberId }),
    });
    if (out.view) render(out.view, { forceTypewriter: false });
    if (out.advice?.ok && out.advice.advice) {
      playTrekSfx("comm_chirp");
      if (voice.enabled) {
        void replaySpeech(out.advice.memberName || "Officer", out.advice.advice);
      }
    } else if (out.advice?.error) {
      showSoftError(out.advice.error);
      uiSound("deny");
    }
  } catch (err) {
    showSoftError(err?.message || "Advice request failed");
  }
}

/** Debounce hail/greeting per officer so hover spam does not stack */
const crewHailCooldown = new Map();

function buildCrewGreeting(member) {
  const name = (member.name || "Officer").replace(/^Cmdr\.?\s*/i, "Commander ");
  const role = member.role || "bridge officer";
  const species = member.species ? ` ${member.species}` : "";
  // Short, TTS-friendly bridge hail
  return `Channel open. ${name}, ${role}${species}, standing by, Captain.`;
}

/**
 * On crew card hover-expand: incoming transmission SFX, then spoken greeting.
 */
function bindCrewCardExpandHandlers(crew) {
  if (!els.crew) return;
  els.crew.querySelectorAll(".crew-tab[data-crew-id]").forEach((tab) => {
    tab.addEventListener("mouseenter", () => {
      void onCrewCardExpand(tab, crew);
    });
    // Keyboard / touch: focus also counts as expand
    tab.tabIndex = 0;
    tab.addEventListener("focus", () => {
      void onCrewCardExpand(tab, crew);
    });
  });
}

async function onCrewCardExpand(tab, crewList) {
  const id = tab.getAttribute("data-crew-id");
  if (!id) return;
  // Avoid re-fire while this card is already hailing
  if (tab.classList.contains("is-hailing")) return;
  const now = Date.now();
  const last = crewHailCooldown.get(id) || 0;
  // 12s cooldown per officer
  if (now - last < 12_000) return;
  crewHailCooldown.set(id, now);

  const member = (crewList || []).find((c) => c.id === id);
  if (!member) return;
  // Need an active run for TTS
  if (!current?.state?.runId || !aiReady) return;

  tab.classList.add("is-hailing");
  try {
    // Incoming transmission cue (LCARS theme + SFX on) + TrekCore hail beep
    playTrekSfx("hail_beep");
    await playIncomingTransmission();
    // Spoken greeting in that officer's locked voice
    const line = buildCrewGreeting(member);
    await replaySpeech(member.name, line, tab);
  } finally {
    tab.classList.remove("is-hailing");
  }
}

async function maybeRequestPortraits() {
  const runId = current?.state?.runId;
  const crew = current?.state?.ship?.crew;
  if (!runId || !crew?.length || !aiReady) {
    if (missionBoot.active) maybeFinishMissionBoot();
    return;
  }

  // Skip if a full-screen crew init is driving the request (avoids double POST)
  if (crewInitInFlight) return;

  const needs = crew.some(
    (c) =>
      !c.imageUrl &&
      c.portraitStatus !== "ready" &&
      c.portraitStatus !== "pending"
  );
  const needsRetry = crew.some((c) => c.portraitStatus === "failed" && !c.imageUrl);
  if (!needs && !needsRetry) {
    portraitsGenerating = false;
    if (missionBoot.active) maybeFinishMissionBoot();
    return;
  }
  // Already imaging this run — keep mission boot waiting on the in-flight job
  if (portraitRequestFor === runId) {
    if (missionBoot.active) {
      paintMissionBootViewscreen("Imaging crew profiles…");
    }
    return;
  }
  portraitRequestFor = runId;
  portraitsGenerating = true;

  // Re-render immediately so imaging banner/spinners appear
  if (current?.state?.ship) {
    // Avoid re-entry: renderCrew → maybeRequestPortraits; temporary flag
    const ship = current.state.ship;
    els.crew && renderCrewWithoutPortraitKick(ship);
  }

  if (missionBoot.active) {
    paintMissionBootViewscreen("Imaging crew profiles…");
  }

  try {
    const view = await api(`/games/${runId}/crew/portraits`, { method: "POST" });
    portraitsGenerating = false;
    if (current?.state?.runId === runId) {
      current = {
        ...current,
        state: {
          ...current.state,
          ship: view.state.ship,
        },
      };
      // Keep pending opening view's ship in sync
      if (missionBoot.pendingView?.state) {
        missionBoot.pendingView = {
          ...missionBoot.pendingView,
          state: {
            ...missionBoot.pendingView.state,
            ship: view.state.ship,
          },
        };
      }
      renderShip(view.state.ship);
      renderCrewWithoutPortraitKick(view.state.ship);
    }
    if (missionBoot.active) {
      paintMissionBootViewscreen("Crew profiles online");
      maybeFinishMissionBoot();
    }
  } catch (err) {
    console.warn("Portrait generation failed:", err.message);
    portraitsGenerating = false;
    portraitRequestFor = null;
    if (current?.state?.ship) {
      renderCrewWithoutPortraitKick(current.state.ship);
    }
    // Don't block the bridge forever if imaging fails
    if (missionBoot.active) maybeFinishMissionBoot();
  }
}

/** True right after the player commissions a vessel (preset or custom) */
function justAcquiredShip(phaseBefore, view) {
  const ship = view?.state?.ship;
  if (!ship?.crew?.length) return false;
  if (phaseBefore === "ship_select" && view.state.phase !== "ship_custom") {
    return true;
  }
  if (
    phaseBefore === "ship_custom" &&
    (view.state.phase === "starbase" || view.state.phase === "mission_type")
  ) {
    return true;
  }
  return false;
}

let crewInitInFlight = false;

/**
 * Full-screen init after ship select: assemble roster, lock voices, image portraits.
 * Returns the view with ship/crew portraits applied when possible.
 */
async function initializeCrewAfterShipSelect(view) {
  const runId = view?.state?.runId;
  if (!runId || !view.state?.ship?.crew?.length) return view;

  const steps = [
    { key: "roster", label: "Assembling command roster", pct: 18 },
    { key: "voice", label: "Assigning voice profiles", pct: 42 },
    { key: "visual", label: "Locking visual identities", pct: 72 },
    { key: "ready", label: "Roster online", pct: 100 },
  ];

  crewInitInFlight = true;
  try {
    return await withInitScreen(
      {
        title: "System Initialization",
        subtitle: "Starfleet Command · Bridge crew configuration",
        status: "INITIALIZING COMMAND ROSTER…",
        network: "Personnel Database LCARS",
        steps,
        completeLabel: "Command roster online",
      },
      async (update) => {
        // Show ship/crew panels under the overlay (log waits until init ends)
        current = view;
        setActiveRun(runId);
        els.phase.textContent = view.state.phase || "mission_type";
        renderShip(view.state.ship);
        renderCrewWithoutPortraitKick(view.state.ship);
        renderObjectives(view.state.mission, view.state);
        renderMeta(view.metaCommands, view.state.phase);
        renderOptions([]);

        update({
          key: "roster",
          label: "Assembling command roster",
          pct: 22,
        });
        await sleep(280);

        update({
          key: "voice",
          label: "Assigning voice profiles",
          pct: 48,
        });
        await sleep(200);

        const needs = view.state.ship.crew.some(
          (c) =>
            !c.imageUrl &&
            c.portraitStatus !== "ready" &&
            c.portraitStatus !== "failed"
        );

        if (needs) {
          update({
            key: "visual",
            label: "Locking visual identities…",
            pct: 58,
          });
          portraitRequestFor = runId;
          portraitsGenerating = true;
          renderCrewWithoutPortraitKick(view.state.ship);
          try {
            const portraitView = await api(`/games/${runId}/crew/portraits`, {
              method: "POST",
              timeoutMs: 180_000,
            });
            portraitsGenerating = false;
            if (portraitView?.state?.ship) {
              view = {
                ...view,
                state: {
                  ...view.state,
                  ship: portraitView.state.ship,
                },
              };
              current = {
                ...current,
                state: {
                  ...current.state,
                  ship: portraitView.state.ship,
                },
              };
              renderShip(view.state.ship);
              renderCrewWithoutPortraitKick(view.state.ship);
            }
          } catch (err) {
            console.warn("Crew portrait init failed:", err?.message || err);
            portraitsGenerating = false;
            portraitRequestFor = null;
          }
        } else {
          update({
            key: "visual",
            label: "Visual identities already on file",
            pct: 80,
          });
        }

        update({
          key: "ready",
          label: "Roster online",
          pct: 100,
          done: true,
        });
        return view;
      }
    );
  } finally {
    crewInitInFlight = false;
    portraitsGenerating = false;
  }
}

/** Render crew UI without kicking another portrait request */
function renderCrewWithoutPortraitKick(ship) {
  const playerName = current?.state?.playerName || "";
  const officers = displayBridgeCrew(ship?.crew || []);
  if (!officers.length && !playerName) {
    els.crew.className = "panel-body crew-panel muted";
    els.crew.textContent = "—";
    return;
  }
  const pendingCount = officers.filter(crewNeedsPortrait).length;
  const showGenerating = portraitsGenerating && pendingCount > 0;
  els.crew.className = "panel-body crew-panel";
  els.crew.innerHTML =
    (showGenerating
      ? `<div class="crew-imaging-banner" role="status" aria-live="polite">
          <span class="crew-imaging-spinner" aria-hidden="true"></span>
          <span>Imaging crew… <span class="crew-imaging-count">${pendingCount} remaining</span></span>
        </div>`
      : "") +
    officers
      .map((c) => {
        const loyalty = typeof c.loyalty === "number" ? c.loyalty : 50;
        const needsImg = crewNeedsPortrait(c);
        const generating = showGenerating && needsImg;
        const status = generating
          ? "generating"
          : c.portraitStatus || (c.imageUrl ? "ready" : "none");
        const photo = c.imageUrl
          ? `<img class="crew-fill-photo" src="${escapeHtml(
              c.imageUrl
            )}" alt="${escapeHtml(c.name)}" loading="lazy" draggable="false" />`
          : `<div class="crew-fill-photo placeholder" aria-hidden="true">${escapeHtml(
              crewInitials(c.name)
            )}</div>`;

        return `<article class="crew-tab${
          generating ? " is-imaging" : ""
        }" data-crew-id="${escapeHtml(c.id)}">
        <div class="crew-card-face">
          ${photo}
          ${
            generating
              ? `<div class="crew-imaging-overlay" aria-hidden="true">
                   <span class="crew-imaging-spinner"></span>
                   <span class="crew-imaging-label">Imaging</span>
                 </div>`
              : ""
          }
          <div class="crew-card-gradient"></div>
          <div class="crew-card-overlay">
            <div class="crew-tab-name">${escapeHtml(c.name)}</div>
            <div class="crew-tab-role">${escapeHtml(c.role)}</div>
          </div>
        </div>
        <div class="crew-tab-details">
          <div class="crew-detail-grid">
            <div><span class="crew-label">Species</span>${escapeHtml(
              c.species || "Unknown"
            )}</div>
            <div><span class="crew-label">Loyalty</span>${loyalty}%</div>
            <div class="crew-span"><span class="crew-label">Personality</span>${escapeHtml(
              c.personality || "—"
            )}</div>
            <div class="crew-span"><span class="crew-label">Dossier</span>${escapeHtml(
              c.bio || "No dossier on file."
            )}</div>
            <div class="crew-span"><span class="crew-label">Voice</span>${escapeHtml(
              c.voice
                ? `${c.voice.voiceName || c.voice.voiceId} · ${c.voice.baselineTone || "locked"}`
                : "unassigned"
            )}</div>
            <div class="crew-span crew-portrait-status"><span class="crew-label">Portrait</span>${escapeHtml(
              status
            )}</div>
          </div>
        </div>
      </article>`;
      })
      .join("");
  bindCrewCardExpandHandlers(officers);
  bindCrewAdviceButtons(officers);
}

/** True when the player is accepting the mission brief to begin play */
function isMissionBeginAction(phase, text) {
  if (phase !== "mission_brief") return false;
  const t = String(text || "").trim();
  // Choice 2 = return to mission list
  if (/^2([.\s:]|$)/.test(t)) return false;
  if (/\b(return|back|list|other mission|decline)\b/i.test(t)) return false;
  return true;
}

function crewProfilesReady(ship) {
  const crew = ship?.crew || [];
  if (!crew.length) return true;
  if (portraitsGenerating) return false;
  // Treat failed as done so a bad image API cannot soft-lock the bridge
  return !crew.some(
    (c) =>
      !c.imageUrl &&
      c.portraitStatus !== "ready" &&
      c.portraitStatus !== "failed"
  );
}

function paintMissionBootViewscreen(statusLabel) {
  if (!els.viewscreen) return;
  stopViewscreenTimers();
  els.viewscreen.classList.add("has-image", "mission-boot-active");
  els.viewscreen.innerHTML = `<img class="viewscreen-image incoming-comm" src="${INCOMING_COMM_URL}" alt="Incoming communication from Starfleet Command" />`;
  const status = statusLabel || "Incoming communication — stand by";
  if (els.viewscreenCaption) {
    els.viewscreenCaption.textContent = "Incoming Communication";
  }
  if (els.viewscreenMeta) {
    els.viewscreenMeta.textContent = status;
  }
  if (els.viewscreenCollapseSummary) {
    els.viewscreenCollapseSummary.textContent = status;
  }
  // Ensure expanded while booting (do not persist — temporary)
  setPanelExpanded(els.viewscreenPanel, els.viewscreenToggle, true, {
    persist: false,
  });
  if (els.viewscreenPanel) {
    els.viewscreenPanel.classList.add("mission-boot-open");
  }
}

/**
 * Begin mission-start presentation: expand viewscreen with Starfleet poster.
 * Holds the first gamemaster message until crew profiles (image + voice) are ready.
 */
function startMissionBoot(runId, statusLabel) {
  missionBoot.token += 1;
  missionBoot.active = true;
  missionBoot.runId = runId || current?.state?.runId || null;
  missionBoot.pendingView = null;
  paintMissionBootViewscreen(
    statusLabel || "Incoming communication — stand by"
  );
  // Lock command line until crew is ready and opening beat can play
  if (els.input) els.input.disabled = true;
  if (els.engageBtn) {
    els.engageBtn.disabled = true;
    els.engageBtn.textContent = "Waiting…";
  }
  if (els.form) els.form.classList.add("is-waiting");
  if (els.options) {
    els.options.classList.add("hidden");
    els.options.innerHTML = "";
  }
  if (els.log) {
    els.log.innerHTML = `<div class="log-entry system"><div class="who">Channel</div><div class="text">Incoming communication from Starfleet Command. Stand by…</div></div>`;
  }
  playViewscreenSfx("open");
  playIncomingTransmission();
  playIncomingCommTrek();
}

/**
 * Hold opening scene until crew images/voice locks finish, then collapse and play.
 */
function holdOpeningForMissionBoot(view) {
  if (!missionBoot.active) return false;
  missionBoot.pendingView = view;
  current = view;
  setActiveRun(view.state?.runId);
  const s = view.state;
  updatePhaseBadge(s);
  renderShip(s.ship);
  renderCrew(s.ship, s.playerName); // kicks portrait gen now that boot is active
  renderObjectives(s.mission, s);
  renderMeta(view.metaCommands, s.phase);
  renderOptions([]);
  paintMissionBootViewscreen(
    portraitsGenerating || !crewProfilesReady(s.ship)
      ? "Imaging crew profiles…"
      : "Crew profiles online"
  );
  // If crew already fully ready, finish immediately
  maybeFinishMissionBoot();
  return true;
}

function maybeFinishMissionBoot() {
  if (!missionBoot.active) return;
  if (!crewProfilesReady(current?.state?.ship)) {
    paintMissionBootViewscreen("Imaging crew profiles…");
    return;
  }
  // Need the opening scene before we can hand off to the log
  if (!missionBoot.pendingView) {
    paintMissionBootViewscreen("Receiving Starfleet orders…");
    return;
  }
  finishMissionBoot();
}

function finishMissionBoot() {
  if (!missionBoot.active) return;
  const pendingView = missionBoot.pendingView;
  missionBoot.active = false;
  missionBoot.token += 1;
  missionBoot.runId = null;
  missionBoot.pendingView = null;

  if (els.viewscreenPanel) {
    els.viewscreenPanel.classList.remove("mission-boot-open");
  }
  if (els.viewscreen) {
    els.viewscreen.classList.remove("mission-boot-active");
  }

  // Collapse viewscreen — then start the first gamemaster message
  setPanelExpanded(els.viewscreenPanel, els.viewscreenToggle, false, {
    persist: true,
  });
  playViewscreenSfx("close");

  if (els.form) els.form.classList.remove("is-waiting");
  if (els.options) {
    els.options.classList.remove("hidden", "is-waiting");
  }
  if (els.engageBtn) {
    els.engageBtn.disabled = !aiReady || actionInFlight;
    els.engageBtn.textContent = "Engage";
  }
  if (els.input) els.input.disabled = !aiReady || actionInFlight;

  if (pendingView) {
    // Now the player hears/reads the opening beat
    render(pendingView, { forceTypewriter: true });
  } else if (current?.state) {
    renderViewscreen(current.state);
  }

  if (aiReady && els.input && !actionInFlight) {
    els.input.focus();
  }
}

function cancelMissionBoot() {
  if (!missionBoot.active && !missionBoot.pendingView) return;
  missionBoot.active = false;
  missionBoot.token += 1;
  missionBoot.runId = null;
  missionBoot.pendingView = null;
  if (els.viewscreenPanel) {
    els.viewscreenPanel.classList.remove("mission-boot-open");
  }
  if (els.viewscreen) {
    els.viewscreen.classList.remove("mission-boot-active");
  }
  if (els.form && !actionInFlight) els.form.classList.remove("is-waiting");
  if (els.options) {
    els.options.classList.remove("hidden", "is-waiting");
  }
  if (els.engageBtn && !actionInFlight) {
    els.engageBtn.disabled = !aiReady;
    els.engageBtn.textContent = "Engage";
  }
  if (els.input && !actionInFlight) els.input.disabled = !aiReady;
}

function statusClass(status) {
  if (status === "active") return "obj-status-active";
  if (status === "completed") return "obj-status-completed";
  if (status === "failed") return "obj-status-failed";
  // missed / other
  return "obj-status-inactive";
}

/** Resolve mission success/failure for UI (works for older saves too). */
function resolveMissionOutcome(mission, state) {
  if (mission?.status === "success" || mission?.status === "failed") {
    return mission.status;
  }
  const phase = state?.phase;
  if (phase !== "debrief" && phase !== "post_mission") return null;
  const text = `${state?.debrief || ""}\n${state?.pendingQuestion || ""}`;
  if (/mission successful|mission complete/i.test(text)) return "success";
  if (/mission failed|mission failure/i.test(text)) return "failed";
  // Debrief without a clear banner — still treat as ended
  return "failed";
}

/**
 * Never show [active] after the mission is over.
 * Open main goals → completed (success) or failed; open secondaries → missed.
 */
function objectivesForDisplay(mission, state) {
  const list = mission?.objectives || [];
  const outcome = resolveMissionOutcome(mission, state);
  if (!outcome) return list;
  return list.map((o) => {
    if (o.status !== "active") return o;
    if (outcome === "success") {
      return {
        ...o,
        status: o.kind === "main" ? "completed" : "missed",
      };
    }
    return {
      ...o,
      status: o.kind === "main" ? "failed" : "missed",
    };
  });
}

function updatePhaseBadge(state) {
  if (!els.phase) return;
  els.phase.classList.remove(
    "is-success",
    "is-failure",
    "is-debrief-outcome"
  );
  const phase = state?.phase || "—";
  if (phase === "debrief" || phase === "post_mission") {
    const outcome = resolveMissionOutcome(state?.mission, state);
    if (outcome === "success") {
      els.phase.textContent = "successful";
      els.phase.classList.add("is-success", "is-debrief-outcome");
      return;
    }
    if (outcome === "failed") {
      els.phase.textContent = "failure";
      els.phase.classList.add("is-failure", "is-debrief-outcome");
      return;
    }
  }
  els.phase.textContent = phase;
}

function updateRedAlertUi(state) {
  const on =
    Boolean(state) &&
    state.phase === "playing" &&
    isRedAlertState(state);
  document.body.classList.toggle("red-alert", on);
  if (els.redAlertBadge) {
    els.redAlertBadge.classList.toggle("hidden", !on);
  }
}

function shieldDisplayCap(ship) {
  const max =
    typeof ship.maxShieldIntegrity === "number" && ship.maxShieldIntegrity > 0
      ? ship.maxShieldIntegrity
      : 100;
  if (ship.systems?.shields === "destroyed") return 0;
  if (ship.systems?.shields === "damaged") {
    return Math.max(1, Math.round(max * 0.65));
  }
  return max;
}

function starbaseButton(label, extraClass = "", opts = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `lcars-btn${extraClass ? ` ${extraClass}` : ""}`;
  btn.textContent = label;
  if (opts.disabled) {
    btn.disabled = true;
    btn.classList.add("is-locked");
    btn.title = opts.title || "Unavailable";
    return btn;
  }
  if (opts.title) btn.title = opts.title;
  btn.addEventListener("click", () => {
    uiSound("primary");
    sendAction(label);
  });
  return btn;
}

function renderStarbaseScreen(state) {
  const overlay = els.starbaseOverlay;
  if (!overlay) return;
  const docked = state?.phase === "starbase";
  document.body.classList.toggle("starbase-active", docked);
  overlay.classList.toggle("hidden", !docked);
  if (!docked) {
    document.body.classList.remove("starbase-waiting");
    return;
  }

  const ship = state.ship;
  const session = state.starbase;
  const u = state.universe;
  const facility =
    session?.stationClass === "fleet_yards"
      ? "Fleet Yards"
      : session?.stationClass === "starbase"
        ? "Starbase"
        : session?.stationClass === "outpost"
          ? "Outpost"
          : "Docking facility";
  if (els.starbaseMeta) {
    els.starbaseMeta.textContent = [
      ship ? `${ship.name} ${ship.registryNumber || ""}`.trim() : "No ship",
      facility,
      `Stardate ${u?.stardate || ship?.stardate || "—"}`,
    ].join(" · ");
  }

  const noticeLine = String(state.pendingQuestion || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("› "));
  if (els.starbaseNotice) {
    if (noticeLine) {
      els.starbaseNotice.textContent = noticeLine.replace(/^›\s*/, "");
      els.starbaseNotice.classList.remove("hidden");
    } else {
      els.starbaseNotice.classList.add("hidden");
    }
  }

  if (els.starbaseShip) {
    const cap = ship ? shieldDisplayCap(ship) : 0;
    const officers = displayBridgeCrew(ship?.crew || []);
    const damaged = ship
      ? Object.entries(ship.systems || {})
          .filter(([, v]) => v !== "ok")
          .map(([k, v]) => `${k}:${v}`)
          .join(", ") || "all nominal"
      : "—";
    const skills = ship?.skills?.total
      ? Object.entries(ship.skills.total)
          .map(([k, v]) => `${k} ${v}`)
          .join(" · ")
      : "—";
    const roster = officers.length
      ? `<ul class="starbase-roster">${officers
          .map((c) => {
            const st = c.status || "active";
            const svc =
              typeof c.serviceTurns === "number" ? `${c.serviceTurns}t` : "";
            return `<li><span class="starbase-roster-name">${escapeHtml(
              c.name
            )}</span><span class="starbase-roster-role">${escapeHtml(
              c.role
            )}</span><span class="starbase-badge is-${escapeHtml(
              st
            )}">${escapeHtml(st)}</span>${
              svc ? `<span class="muted">${escapeHtml(svc)}</span>` : ""
            }</li>`;
          })
          .join("")}</ul>`
      : `<p class="starbase-empty">No officers on the roster.</p>`;
    const hullPct = ship
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((100 * ship.integrity) / (ship.maxIntegrity || 100))
          )
        )
      : 0;
    const shieldPct = ship
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((100 * ship.shieldIntegrity) / (cap || 1))
          )
        )
      : 0;
    els.starbaseShip.innerHTML = ship
      ? `<div class="starbase-meter"><span>Hull</span><span class="starbase-meter-track"><span class="starbase-meter-fill" style="width:${hullPct}%"></span></span><span class="starbase-meter-val">${ship.integrity}/${ship.maxIntegrity}</span></div>
         <div class="starbase-meter"><span>Shields</span><span class="starbase-meter-track"><span class="starbase-meter-fill is-shield" style="width:${shieldPct}%"></span></span><span class="starbase-meter-val">${ship.shieldIntegrity}/${cap}${
           ship.shieldGridOnline ? "" : " off"
         }</span></div>
         <div>Systems: ${escapeHtml(damaged)}</div>
         <div class="starbase-skills">Skills: ${escapeHtml(skills)}</div>
         ${roster}`
      : `<p class="starbase-empty">No vessel docked.</p>`;
  }

  if (els.starbaseStanding) {
    const rep = u?.factionReputation || {};
    const repLines = Object.entries(rep)
      .map(([k, v]) => {
        const n = Number(v) || 0;
        const sign = n > 0 ? "+" : "";
        return `<li><span>${escapeHtml(k)}</span><span>${sign}${n}</span></li>`;
      })
      .join("");
    const crises = (u?.activeCrises || []).join(", ") || "none";
    const flags = (u?.galacticFlags || []).join(", ") || "none";
    els.starbaseStanding.innerHTML = u
      ? `<ul class="starbase-rep">${repLines}</ul>
         <div>Crises: ${escapeHtml(crises)}</div>
         <div>Flags: ${escapeHtml(flags)}</div>`
      : `<p class="starbase-empty">No galaxy standing on file.</p>`;
  }

  if (els.starbaseLog) {
    const log = Array.isArray(state.campaignLog) ? state.campaignLog : [];
    if (!log.length) {
      els.starbaseLog.innerHTML = `<p class="starbase-empty">No prior missions on file.</p>`;
    } else {
      els.starbaseLog.innerHTML = `<ul class="starbase-log-list">${log
        .slice(-12)
        .reverse()
        .map((e) => {
          const cas = e.casualties?.length
            ? ` · ${escapeHtml(e.casualties.join(", "))}`
            : "";
          return `<li><span class="starbase-log-when">${escapeHtml(
            e.stardate || ""
          )}</span> ${escapeHtml(e.title || "Mission")} <span class="starbase-badge is-${escapeHtml(
            e.outcome || ""
          )}">${escapeHtml(e.outcome || "")}</span>${cas}</li>`;
        })
        .join("")}</ul>`;
    }
  }

  const choices = Array.isArray(state.pendingChoices)
    ? state.pendingChoices.map((c) => c.text)
    : [];
  const yard = [];
  const people = [];
  const primary = [];
  for (const label of choices) {
    if (/^review starbase/i.test(label)) continue;
    if (/^view campaign log/i.test(label)) continue;
    if (
      /^choose next mission/i.test(label) ||
      /^begin another mission/i.test(label) ||
      /^save and stand down/i.test(label)
    ) {
      primary.push(label);
    } else if (/^(heal|hire|transfer):/i.test(label)) {
      people.push(label);
    } else {
      yard.push(label);
    }
  }

  const fill = (host, labels, emptyText) => {
    if (!host) return;
    host.innerHTML = "";
    if (!labels.length) {
      const p = document.createElement("p");
      p.className = "starbase-empty";
      p.textContent = emptyText;
      host.appendChild(p);
      return;
    }
    for (const label of labels) {
      const extra = /^transfer:/i.test(label)
        ? "secondary"
        : /^heal:/i.test(label)
          ? "secondary"
          : "";
      host.appendChild(starbaseButton(label, extra));
    }
  };
  fill(els.starbaseYard, yard, "No yard work remaining this visit.");
  fill(els.starbasePeople, people, "No personnel actions this visit.");
  if (els.starbasePrimary) {
    els.starbasePrimary.innerHTML = "";
    for (const label of primary) {
      const extra = /^save/i.test(label) ? "secondary" : "";
      els.starbasePrimary.appendChild(starbaseButton(label, extra));
    }
  }
}

function renderObjectiveList(objectives) {
  return objectives
    .map(
      (o) => `<div class="obj-item">
        <span class="obj-status ${statusClass(o.status)}">[${escapeHtml(o.status)}]</span>
        <span class="obj-title">${escapeHtml(o.title)}</span>
      </div>`
    )
    .join("");
}

function renderObjectives(mission, state = null) {
  if (!mission) {
    els.objectives.className = "panel-body muted";
    els.objectives.textContent = "—";
    return;
  }

  const gameState = state || current?.state || null;
  const objectives = objectivesForDisplay(mission, gameState);
  const main = objectives.filter((o) => o.kind === "main");
  const secondary = objectives.filter((o) => o.kind === "secondary");
  const outcome = resolveMissionOutcome(mission, gameState);
  let outcomeHtml = "";
  if (outcome === "success") {
    outcomeHtml = `<div class="mission-outcome is-success" role="status">Mission successful</div>`;
  } else if (outcome === "failed") {
    outcomeHtml = `<div class="mission-outcome is-failure" role="status">Mission failure</div>`;
  }

  els.objectives.className = "panel-body objectives-panel";
  els.objectives.innerHTML = `
    ${outcomeHtml}
    <div class="obj-mission-title">${escapeHtml(mission.title)}</div>
    <div class="obj-location">@ ${escapeHtml(mission.location)}</div>
    <div class="obj-group">
      <div class="obj-group-label">Main</div>
      ${main.length ? renderObjectiveList(main) : `<div class="obj-empty">None</div>`}
    </div>
    <div class="obj-group">
      <div class="obj-group-label">Secondary</div>
      ${secondary.length ? renderObjectiveList(secondary) : `<div class="obj-empty">None</div>`}
    </div>
  `;
}

function renderMeta(commands, phase) {
  els.meta.innerHTML = "";
  const usable =
    phase === "playing" || phase === "mission_brief" ? commands : [];
  if (!usable.length) {
    els.meta.innerHTML =
      '<span class="muted">Meta commands unlock during the mission.</span>';
    return;
  }
  for (const cmd of usable) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cmd;
    btn.addEventListener("click", () => {
      uiSound("secondary");
      stopVoicePlayback();
      sendAction(cmd);
    });
    els.meta.appendChild(btn);
  }
}

function scrollLogToTop() {
  // Current beat sits at the top of the always-visible mission log
  if (els.log) els.log.scrollTop = 0;
}

function updateHistorySummary(count) {
  if (!els.logHistorySummary) return;
  if (count <= 0) {
    els.logHistorySummary.textContent = "No prior entries";
  } else if (count === 1) {
    els.logHistorySummary.textContent = "1 prior entry";
  } else {
    els.logHistorySummary.textContent = `${count} prior entries`;
  }
}

/** Prior log entries only — lives in the collapsible History section */
function appendPastLog(state) {
  const host = els.logHistory || els.log;
  if (!host) return;
  host.innerHTML = "";
  const recent = [...state.log].slice(-40).reverse();
  let count = 0;
  recent.forEach((item, index) => {
    // Skip only the exact current prompt (already shown as "Narrator · now")
    if (item.text === state.pendingQuestion && item.kind === "narration") return;
    // Hide mechanical dice rolls from the player-facing log
    if (item.kind === "roll") return;
    count += 1;
    const entry = document.createElement("div");
    const ageBand = index < 2 ? "age-0" : index < 5 ? "age-1" : "age-2";
    entry.className = `log-entry past ${ageBand} ${item.kind}`;
    const who =
      item.kind === "narration" || item.kind === "debrief"
        ? "Narrator"
        : item.kind === "player"
          ? "Captain"
          : item.kind === "system"
            ? "System"
            : item.kind;
    entry.innerHTML = `<div class="who">${who}</div><div class="text"></div>`;
    const textEl = entry.querySelector(".text");
    // Past narrator/debrief lines: clickable paragraphs for replay
    if (item.kind === "narration" || item.kind === "debrief") {
      fillSpeakableNarration(textEl, item.text);
    } else {
      textEl.textContent = item.text;
    }
    host.appendChild(entry);
  });
  updateHistorySummary(count);
  if (els.logHistoryPanel) {
    els.logHistoryPanel.classList.toggle("is-empty", count === 0);
  }
}

function renderLogStaticCurrent(state, options) {
  /** Paint current narration fully (no typewriter) + rebuild history */
  if (els.log) els.log.innerHTML = "";
  if (state.pendingQuestion && els.log) {
    const entry = document.createElement("div");
    entry.className = "log-entry current narration";
    entry.innerHTML = `<div class="who">Narrator · now <span class="type-hint">click a line to hear it</span></div><div class="text"></div>`;
    const textEl = entry.querySelector(".text");
    fillSpeakableNarration(textEl, state.pendingQuestion);
    for (const line of activeCrewDialogue(state)) {
      const d = document.createElement("div");
      fillSpeakableCrewLine(d, line.speaker, line.line);
      entry.appendChild(d);
    }
    // Dice rolls stay server-side only — not shown to the player
    els.log.appendChild(entry);
  }
  appendPastLog(state);
  renderOptions(options);
  scrollLogToTop();
}

async function fetchMissionBoard(runId, text, update) {
  update?.({
    key: "link",
    label: "Opening Starfleet channel",
    pct: 18,
  });
  playIncomingTransmission();
  playIncomingCommTrek();
  const view = await api(`/games/${runId}/action`, {
    method: "POST",
    body: JSON.stringify({ text }),
    timeoutMs: 100_000,
  });
  update?.({
    key: "slate",
    label: "Compiling mission slate",
    pct: 88,
    done: false,
  });
  return view;
}

function buildMissionBriefingSpeech(offer, title) {
  const parts = [`Assignment: ${title}.`];
  const type = String(offer?.type || "").replace(/_/g, " ");
  if (type) parts.push(`Classification: ${type}.`);
  if (offer?.location) parts.push(`Theatre: ${offer.location}.`);
  if (offer?.summary) parts.push(String(offer.summary).trim());
  const bg = String(offer?.background || "").trim();
  const summary = String(offer?.summary || "").trim();
  if (bg && bg.toLowerCase() !== summary.toLowerCase()) parts.push(bg);
  if (offer?.main) parts.push(`Primary objective: ${offer.main}.`);
  const secondaries = Array.isArray(offer?.secondaries)
    ? offer.secondaries.filter(Boolean)
    : [];
  if (secondaries.length) {
    parts.push(`Secondary objectives: ${secondaries.join(". ")}.`);
  }
  return parts.filter(Boolean).join(" ");
}

function missionBoardFilterBar(state) {
  const bar = document.createElement("div");
  bar.className = "mission-board-filters";
  const typeRow = document.createElement("div");
  typeRow.className = "mission-board-filter-row";
  const typeLabel = document.createElement("span");
  typeLabel.className = "mission-card-label";
  typeLabel.textContent = "Type";
  typeRow.appendChild(typeLabel);
  const types = [
    ["Science", "science"],
    ["Exploration", "exploration"],
    ["Search & Rescue", "search_rescue"],
    ["Battle", "battle"],
    ["Expanded", "expanded"],
  ];
  for (const [label, id] of types) {
    const on = state.missionType === id;
    typeRow.appendChild(
      starbaseButton(`Type: ${label}`, on ? "" : "secondary")
    );
  }
  const diffRow = document.createElement("div");
  diffRow.className = "mission-board-filter-row";
  const diffLabel = document.createElement("span");
  diffLabel.className = "mission-card-label";
  diffLabel.textContent = "Risk";
  diffRow.appendChild(diffLabel);
  const expanded = state.missionType === "expanded";
  for (const d of ["Easy", "Medium", "Hard", "Hardcore"]) {
    const on =
      String(state.difficulty || "").toLowerCase() === d.toLowerCase();
    const locked = expanded && d !== "Hardcore";
    const btn = starbaseButton(`Difficulty: ${d}`, on ? "" : "secondary", {
      disabled: locked,
      title: locked
        ? "Expanded assignments are locked to Hardcore"
        : expanded
          ? "Expanded content is Hardcore only"
          : `Set difficulty to ${d}`,
    });
    diffRow.appendChild(btn);
  }
  if (expanded) {
    const note = document.createElement("span");
    note.className = "mission-board-lock-note";
    note.textContent = "Expanded is Hardcore only";
    diffRow.appendChild(note);
  }
  bar.appendChild(typeRow);
  bar.appendChild(diffRow);
  return bar;
}

function isMissionBoardPhase(phase) {
  return (
    phase === "mission_type" ||
    phase === "difficulty" ||
    phase === "mission_offer" ||
    phase === "mission_brief"
  );
}

function renderMissionBoard(state) {
  const overlay = els.missionBoardOverlay;
  if (!overlay) return;
  const open = isMissionBoardPhase(state?.phase);
  document.body.classList.toggle("mission-board-active", open);
  overlay.classList.toggle("hidden", !open);
  if (!open) return;

  const ship = state.ship;
  const u = state.universe;
  const phase = state.phase;
  if (els.missionBoardTitle) {
    els.missionBoardTitle.textContent =
      phase === "mission_brief"
        ? "Mission briefing"
        : phase === "mission_type"
          ? "Assignment type"
          : phase === "difficulty"
            ? "Difficulty"
            : "Mission board";
  }
  if (els.missionBoardMeta) {
    els.missionBoardMeta.textContent = [
      ship ? `${ship.name} ${ship.registryNumber || ""}`.trim() : "No ship",
      state.missionType ? String(state.missionType).replace("_", " ") : "",
      state.difficulty || "",
      `Stardate ${u?.stardate || ship?.stardate || "—"}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const copy = String(state.pendingQuestion || "").trim();
  if (els.missionBoardCopy) {
    if (phase === "mission_brief" || phase === "mission_offer" || !copy) {
      els.missionBoardCopy.classList.add("hidden");
    } else {
      const short = copy.split("\n").filter(Boolean)[0] || copy;
      els.missionBoardCopy.textContent = short;
      els.missionBoardCopy.classList.remove("hidden");
    }
  }

  const host = els.missionBoardList;
  if (host) {
    host.innerHTML = "";
    if (phase === "mission_brief") {
      const brief = document.createElement("div");
      brief.className = "mission-board-brief";
      brief.textContent = copy || "Stand by for briefing.";
      host.appendChild(brief);
    } else if (phase === "mission_type" || phase === "difficulty") {
      for (const c of state.pendingChoices || []) {
        const card = document.createElement("article");
        card.className = "mission-card";
        const parts = String(c.text || "").split("—");
        const title = (parts.shift() || c.text || "").trim();
        const detail = parts.join("—").trim();
        card.innerHTML = `<h3>${escapeHtml(title)}</h3>
          ${
            detail
              ? `<p class="mission-card-summary">${escapeHtml(detail)}</p>`
              : ""
          }`;
        card.appendChild(starbaseButton(c.text));
        host.appendChild(card);
      }
    } else if (phase === "mission_offer") {
      host.appendChild(missionBoardFilterBar(state));
      const offers = Array.isArray(state.missionOffers) ? state.missionOffers : [];
      const choices = state.pendingChoices || [];
      if (offers.length) {
        offers.forEach((offer, i) => {
          const card = document.createElement("article");
          card.className = "mission-card";
          card.tabIndex = 0;
          const title = offer.title || choices[i]?.text || `Mission ${i + 1}`;
          const summary = offer.summary || offer.background || "";
          const background = offer.background || "";
          const showBg =
            background &&
            background.trim().toLowerCase() !== String(summary).trim().toLowerCase();
          const secondaries = Array.isArray(offer.secondaries)
            ? offer.secondaries.filter(Boolean)
            : [];
          const extraBits = [];
          if (showBg) {
            extraBits.push(
              `<p class="mission-card-background">${escapeHtml(background)}</p>`
            );
          }
          if (offer.main) {
            extraBits.push(
              `<p class="mission-card-obj"><span class="mission-card-label">Primary</span>${escapeHtml(
                offer.main
              )}</p>`
            );
          }
          if (secondaries.length) {
            extraBits.push(
              `<p class="mission-card-label">Secondary</p><ul class="mission-card-secondaries">${secondaries
                .map((s) => `<li>${escapeHtml(s)}</li>`)
                .join("")}</ul>`
            );
          }
          if (offer.location) {
            extraBits.push(
              `<p class="mission-card-obj"><span class="mission-card-label">Theatre</span>${escapeHtml(
                offer.location
              )}</p>`
            );
          }
          card.innerHTML = `<p class="mission-card-meta">${escapeHtml(
            [offer.type, offer.location].filter(Boolean).join(" · ")
          )}</p>
            <div class="mission-card-title-row">
              <h3>${escapeHtml(title)}</h3>
            </div>
            <p class="mission-card-summary">${escapeHtml(summary)}</p>
            ${
              extraBits.length
                ? `<div class="mission-card-extra">${extraBits.join("")}</div>`
                : ""
            }`;
          const speakBtn = document.createElement("button");
          speakBtn.type = "button";
          speakBtn.className = "mission-card-speak";
          speakBtn.title = "Read briefing aloud";
          speakBtn.setAttribute("aria-label", `Read briefing for ${title}`);
          speakBtn.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-7.2v2.1a6.6 6.6 0 0 1 0 10.2v2.1a8.7 8.7 0 0 0 0-14.4z"/></svg>';
          const briefing = buildMissionBriefingSpeech(offer, title);
          speakBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (speakBtn.classList.contains("is-speaking-line")) {
              stopVoicePlayback();
              speakBtn.classList.remove("is-speaking-line");
              return;
            }
            uiSound("soft");
            els.missionBoardList
              ?.querySelectorAll(".mission-card-speak")
              .forEach((b) => b.classList.remove("is-speaking-line"));
            void replaySpeech("narrator", briefing, speakBtn);
          });
          card.querySelector(".mission-card-title-row")?.appendChild(speakBtn);
          const btn = starbaseButton(choices[i]?.text || title);
          card.appendChild(btn);
          card.addEventListener("mouseenter", () => {
            if (!card.classList.contains("is-held-shut")) {
              card.classList.add("is-open");
            }
          });
          card.addEventListener("mouseleave", () => {
            card.classList.remove("is-held-shut");
            if (!card.classList.contains("is-pinned")) {
              card.classList.remove("is-open");
            }
          });
          card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            const pinned = card.classList.toggle("is-pinned");
            if (pinned) {
              card.classList.add("is-open");
              card.classList.remove("is-held-shut");
            } else {
              card.classList.remove("is-open");
              card.classList.add("is-held-shut");
            }
          });
          host.appendChild(card);
        });
      } else {
        for (const c of choices) {
          host.appendChild(starbaseButton(c.text));
        }
      }
    } else {
      for (const c of state.pendingChoices || []) {
        host.appendChild(starbaseButton(c.text));
      }
    }
  }

  if (els.missionBoardActions) {
    els.missionBoardActions.innerHTML = "";
    const extras = [];
    if (phase === "mission_offer") extras.push("More assignments");
    if (phase === "mission_brief") {
      for (const c of state.pendingChoices || []) extras.push(c.text);
    }
    extras.push("Return to starbase");
    for (const label of extras) {
      const extra = /return to starbase/i.test(label)
        ? "secondary"
        : /more/i.test(label)
          ? "secondary"
          : "";
      els.missionBoardActions.appendChild(starbaseButton(label, extra));
    }
  }
}

function renderLog(state, opts = {}) {
  if (state?.phase === "starbase") return;
  if (isMissionBoardPhase(state?.phase)) return;
  const { forceTypewriter = false } = opts;
  const options = state.pendingChoices || state.turn?.options || [];
  const key = narrationKey(state);

  // Same beat already typing → do not wipe DOM / restart typewriter (the "loop" bug)
  if (
    !forceTypewriter &&
    key &&
    typewriter.activeKey === key &&
    typewriter.running
  ) {
    return;
  }

  // Same beat already fully shown → static repaint only (e.g. portrait refresh side-effects)
  if (
    !forceTypewriter &&
    key &&
    typewriter.activeKey === key &&
    typewriter.completed
  ) {
    renderLogStaticCurrent(state, options);
    return;
  }

  // New narration beat — cancel previous typer and start fresh
  cancelTypewriter();
  stopVoicePlayback();
  if (els.log) els.log.innerHTML = "";
  renderOptions([]); // hide choices while typing

  if (state.pendingQuestion && els.log) {
    const entry = document.createElement("div");
    entry.className = "log-entry current narration";
    entry.title = "Click to skip typewriter; after it finishes, click a paragraph or crew line to hear it";
    entry.innerHTML = `<div class="who">Narrator · now <span class="type-hint">click to skip · then click a line to replay</span></div><div class="text"></div>`;
    const textEl = entry.querySelector(".text");

    const crewLines = activeCrewDialogue(state);
    const extras = crewLines.map((line) => ({
      className: "crew-line",
      text: `${line.speaker}: "${line.line}"`,
      speaker: line.speaker,
      line: line.line,
    }));
    // Dice rolls are referee mechanics only — never shown in the mission log UI

    // Text is available in state now — stamp before TTS starts
    voice.textReadyAt = performance.now();
    voiceLog("text_ready", {
      phase: state.phase,
      chars: state.pendingQuestion.length,
      crewLines: crewLines.length,
    });

    // Kick off Grok TTS in parallel with typewriter when auto-voice is on
    if (voice.enabled) {
      autoSpeakBeat(state);
    }

    els.log.appendChild(entry);
    // History is separate — rebuild prior entries without clearing current
    appendPastLog(state);

    entry.addEventListener("click", (e) => {
      // While typing, any click skips the typewriter (not a voice replay yet)
      if (typewriter.running) {
        e.preventDefault();
        typewriter.skip = true;
      }
    });

    // cancelTypewriter() already bumped token — use that generation id
    const token = typewriter.token;
    typewriter.running = true;
    typewriter.completed = false;
    typewriter.skip = false;
    typewriter.activeKey = key;
    typewriter.extras = extras;
    typewriter.options = options;

    scrollLogToTop();

    (async () => {
      // Narrator message typing: LCARS soft ticks
      const ok = await typeText(textEl, state.pendingQuestion, token, {
        sfx: true,
      });
      if (!ok || token !== typewriter.token) return;

      // Convert plain typed narration into clickable paragraphs
      fillSpeakableNarration(textEl, state.pendingQuestion);

      for (const extra of extras) {
        if (token !== typewriter.token) return;
        const d = document.createElement("div");
        // Type the display line, then mark as speakable crew clip
        d.className = extra.className;
        entry.appendChild(d);
        typewriter.skip = false;
        const extraOk = await typeText(d, extra.text, token);
        if (!extraOk || token !== typewriter.token) return;
        fillSpeakableCrewLine(d, extra.speaker, extra.line);
        scrollLogToTop();
      }

      if (token !== typewriter.token) return;
      typewriter.running = false;
      typewriter.completed = true;
      const hint = entry.querySelector(".type-hint");
      if (hint) {
        hint.textContent = "click a line to hear it";
      }
      renderOptions(options);
      scrollLogToTop();
    })();
  } else {
    appendPastLog(state);
    renderOptions(options);
    scrollLogToTop();
  }
}

function renderOptions(options) {
  els.options.innerHTML = "";
  const adviceText = current?.state?.lastAdvice?.suggestedOption?.text
    ? String(current.state.lastAdvice.suggestedOption.text).trim().toLowerCase()
    : "";
  for (const opt of options || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    if (adviceText && String(opt.text || "").trim().toLowerCase() === adviceText) {
      btn.classList.add("is-advice");
      btn.title = "Suggested by your officer";
    }
    btn.disabled = actionInFlight || missionBoot.active;
    btn.innerHTML = `<span class="num">${opt.id}.</span> ${escapeHtml(opt.text)}`;
    // Send full choice text so the mission log shows the order, not just "1"
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const risk = String(opt.risk || "").toLowerCase();
      if (risk === "trap" || risk === "high") {
        playTrekSfx("console_warning");
      } else {
        uiSound("primary");
      }
      // New order makes current narrator/cast speech irrelevant
      stopVoicePlayback();
      sendAction(`${opt.id}. ${opt.text}`);
    });
    els.options.appendChild(btn);
  }
}

/**
 * Expand/collapse viewscreen + in-log History strip (smooth CSS grid animation).
 * Mission log shell stays open so the current narration is always visible.
 * Viewscreen auto-expands while the Narrator is responding.
 */
const PANEL_PREF_KEY = "sta-panel-expanded";

function loadPanelExpandedPrefs() {
  try {
    const raw = localStorage.getItem(PANEL_PREF_KEY);
    // Default: viewscreen collapsed until mission-start Incoming Communication
    if (!raw) return { viewscreen: false, history: false, scars: false };
    const parsed = JSON.parse(raw);
    return {
      // Only open if the user explicitly expanded it
      viewscreen: parsed.viewscreen === true,
      // History is always collapsed unless the user explicitly expanded it
      history: parsed.history === true,
      scars: parsed.scars === true,
    };
  } catch {
    return { viewscreen: false, history: false, scars: false };
  }
}

function savePanelExpandedPrefs() {
  try {
    localStorage.setItem(
      PANEL_PREF_KEY,
      JSON.stringify({
        viewscreen: isPanelExpanded(els.viewscreenPanel),
        history: isPanelExpanded(els.logHistoryPanel),
        scars: isPanelExpanded(els.ship?.querySelector(".scar-section")),
      })
    );
  } catch {
    /* ignore */
  }
}

function isPanelExpanded(panel) {
  return Boolean(panel && panel.classList.contains("is-expanded"));
}

function setPanelExpanded(panel, toggleBtn, expanded, { persist = true } = {}) {
  if (!panel) return;
  panel.classList.toggle("is-expanded", expanded);
  panel.classList.toggle("is-collapsed", !expanded);
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    const chev = toggleBtn.querySelector(".collapse-chevron");
    if (chev) chev.textContent = expanded ? "▾" : "▸";
  }
  if (persist) savePanelExpandedPrefs();
}

function togglePanel(panel, toggleBtn) {
  const next = !isPanelExpanded(panel);
  setPanelExpanded(panel, toggleBtn, next, { persist: true });
  // Viewscreen uses TrekCore TNG on/off; other panels keep LCARS beeps
  if (panel === els.viewscreenPanel) {
    playViewscreenSfx(next ? "open" : "close");
  } else {
    uiSound(next ? "open" : "close");
  }
}

function initCollapsiblePanels() {
  const prefs = loadPanelExpandedPrefs();
  // Defaults: viewscreen collapsed; History strip collapsed; mission log always open
  setPanelExpanded(
    els.viewscreenPanel,
    els.viewscreenToggle,
    prefs.viewscreen,
    { persist: false }
  );
  setPanelExpanded(
    els.logHistoryPanel,
    els.logHistoryToggle,
    Boolean(prefs.history),
    { persist: false }
  );
  // Clear stale open state from older builds once
  try {
    const raw = localStorage.getItem(PANEL_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.log != null) {
        localStorage.setItem(
          PANEL_PREF_KEY,
          JSON.stringify({
            viewscreen: parsed.viewscreen === true,
            history: parsed.history === true,
          })
        );
      }
    }
  } catch {
    /* ignore */
  }

  if (els.viewscreenToggle) {
    els.viewscreenToggle.addEventListener("click", () => {
      togglePanel(els.viewscreenPanel, els.viewscreenToggle);
    });
  }
  if (els.logHistoryToggle) {
    els.logHistoryToggle.addEventListener("click", () => {
      togglePanel(els.logHistoryPanel, els.logHistoryToggle);
    });
  }
}

/** Elapsed-time ticker while Narrator is thinking (proves the UI is not frozen) */
let waitingElapsedTimer = null;
let waitingStartedAt = 0;

function stopWaitingElapsed() {
  if (waitingElapsedTimer != null) {
    clearInterval(waitingElapsedTimer);
    waitingElapsedTimer = null;
  }
  waitingStartedAt = 0;
}

function startWaitingElapsed(baseDetail = "") {
  stopWaitingElapsed();
  waitingStartedAt = performance.now();
  const paint = () => {
    if (!els.waitingDetail || !actionInFlight) return;
    const sec = Math.floor((performance.now() - waitingStartedAt) / 1000);
    const trimmed = (baseDetail || "").replace(/\s+/g, " ").trim();
    const order = trimmed
      ? `Order: ${trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed}`
      : "Contacting the Narrator…";
    const hint =
      sec >= 45
        ? " · still working (long turns can take up to ~90s)"
        : sec >= 20
          ? " · composing scene…"
          : "";
    els.waitingDetail.textContent = `${order} · ${sec}s${hint}`;
  };
  paint();
  waitingElapsedTimer = setInterval(paint, 1000);
}

function setActionBusy(busy, detail = "") {
  actionInFlight = busy;
  document.body.classList.toggle(
    "starbase-waiting",
    Boolean(busy) &&
      (document.body.classList.contains("starbase-active") ||
        document.body.classList.contains("mission-board-active"))
  );
  const lockInput = busy || !aiReady || missionBoot.active;
  if (els.input) els.input.disabled = lockInput;
  if (els.engageBtn) {
    els.engageBtn.disabled = lockInput;
    els.engageBtn.textContent =
      busy || missionBoot.active ? "Waiting…" : "Engage";
  }
  if (els.form) els.form.classList.toggle("is-waiting", busy || missionBoot.active);
  // Hide choices while waiting or mission-booting
  if (els.options) {
    const hideOpts = busy || missionBoot.active;
    els.options.classList.toggle("is-waiting", hideOpts);
    els.options.classList.toggle("hidden", hideOpts);
    els.options?.querySelectorAll("button.option-btn").forEach((btn) => {
      btn.disabled = hideOpts;
    });
  }
  const onHub =
    document.body.classList.contains("starbase-active") ||
    document.body.classList.contains("mission-board-active");
  if (els.waitingBanner) {
    // Mission boot uses the viewscreen poster; hub uses the full-screen stand-by
    els.waitingBanner.classList.toggle(
      "hidden",
      !busy || missionBoot.active || onHub
    );
  }
  if (els.hubWaiting) {
    const initOn =
      initSession.active ||
      (els.initOverlay && !els.initOverlay.classList.contains("hidden"));
    els.hubWaiting.classList.toggle(
      "hidden",
      !busy || missionBoot.active || !onHub || initOn
    );
  }
  if (els.hubWaitingDetail && busy && onHub) {
    els.hubWaitingDetail.textContent =
      detail || "Starfleet Command is compiling assignments…";
  }
  if (els.waitingDetail) {
    if (busy && !missionBoot.active) {
      startWaitingElapsed(detail);
    } else {
      stopWaitingElapsed();
      els.waitingDetail.textContent = busy
        ? "Stand by…"
        : "Stand by on the bridge.";
    }
  }

  // Waiting cue only — do not auto-expand viewscreen on every option
  // (mission boot expands explicitly for Incoming Communication)
  if (busy) {
    startProcessingLoop();
  } else {
    stopProcessingLoop();
    stopWaitingElapsed();
  }

  // Soft cue on the log header while waiting
  if (els.phase) {
    if (busy) {
      els.phase.dataset.prevText =
        els.phase.dataset.prevText || els.phase.textContent;
      els.phase.classList.remove(
        "is-success",
        "is-failure",
        "is-debrief-outcome"
      );
      els.phase.textContent = "waiting";
      els.phase.classList.add("is-waiting-badge");
    } else {
      els.phase.classList.remove("is-waiting-badge");
      // Prefer live game state (includes success/failure on debrief)
      if (current?.state) {
        updatePhaseBadge(current.state);
      } else {
        els.phase.textContent =
          els.phase.dataset.prevText || els.phase.textContent;
      }
      delete els.phase.dataset.prevText;
    }
  }
}

function readyViewscreenFrames(state) {
  const playlist = state?.viewscreen?.playlist || [];
  return playlist.filter((f) => f.status === "ready" && f.imageUrl);
}

function stopViewscreenTimers() {
  if (viewscreenRotateTimer) {
    clearInterval(viewscreenRotateTimer);
    viewscreenRotateTimer = null;
  }
  if (viewscreenPollTimer) {
    clearInterval(viewscreenPollTimer);
    viewscreenPollTimer = null;
  }
}

function paintViewscreenFrame(frame, index, total, generating) {
  if (!els.viewscreen) return;
  if (frame?.imageUrl) {
    // Cycle Ken Burns directions so each playlist beat drifts differently
    const kb = ["kb-a", "kb-b", "kb-c", "kb-d"][Math.abs(index) % 4];
    els.viewscreen.innerHTML = `<img class="viewscreen-image ${kb}" src="${escapeHtml(
      frame.imageUrl
    )}" alt="${escapeHtml(frame.caption || "Mission viewscreen")}" />`;
    els.viewscreen.classList.add("has-image");
  } else {
    els.viewscreen.classList.remove("has-image");
    els.viewscreen.innerHTML = `<p class="vs-placeholder">VIEWSCREEN STANDBY<br /><span>${
      generating
        ? "ViewscreenAgent is imaging this moment…"
        : "Journey frames will appear as the mission unfolds"
    }</span></p>`;
  }
  if (els.viewscreenCaption) {
    els.viewscreenCaption.textContent = frame?.caption || "Standby";
  }
  if (els.viewscreenMeta) {
    const bits = [];
    if (total > 0) bits.push(`${index + 1}/${total}`);
    if (generating) bits.push("imaging…");
    els.viewscreenMeta.textContent = bits.join(" · ");
  }
  // Collapsed header shows the same caption so the screen stays useful when closed
  if (els.viewscreenCollapseSummary) {
    const bits = [];
    bits.push(frame?.caption || "Standby");
    if (total > 0) bits.push(`${index + 1}/${total}`);
    if (generating) bits.push("imaging…");
    els.viewscreenCollapseSummary.textContent = bits.join(" · ");
  }
}

function renderViewscreen(state) {
  // Mission-start poster owns the viewscreen until crew profiles are ready
  if (missionBoot.active) {
    paintMissionBootViewscreen(
      missionBoot.pendingView
        ? crewProfilesReady(state?.ship)
          ? "Crew profiles online"
          : "Imaging crew profiles…"
        : "Receiving Starfleet orders…"
    );
    return;
  }

  const frames = readyViewscreenFrames(state);
  const generating = Boolean(state?.viewscreen?.generating);
  const pendingPrompt = state?.turn?.viewscreenPrompt;

  if (!frames.length) {
    paintViewscreenFrame(
      null,
      0,
      0,
      generating
    );
    if (pendingPrompt && els.viewscreenCaption) {
      els.viewscreenCaption.textContent = pendingPrompt.slice(0, 100);
    }
  } else {
    if (viewscreenDisplayIndex >= frames.length) {
      viewscreenDisplayIndex = frames.length - 1;
    }
    // Prefer newest frame when playlist grows
    if (
      state.viewscreen?.activeIndex === -1 ||
      viewscreenDisplayIndex < 0
    ) {
      viewscreenDisplayIndex = frames.length - 1;
    }
    const frame = frames[viewscreenDisplayIndex];
    paintViewscreenFrame(frame, viewscreenDisplayIndex, frames.length, generating);
  }

  // Rotate through journey book every 7s when multiple frames exist
  if (viewscreenRotateTimer) {
    clearInterval(viewscreenRotateTimer);
    viewscreenRotateTimer = null;
  }
  if (frames.length > 1) {
    viewscreenRotateTimer = setInterval(() => {
      const latest = readyViewscreenFrames(current?.state);
      if (!latest.length) return;
      viewscreenDisplayIndex = (viewscreenDisplayIndex + 1) % latest.length;
      paintViewscreenFrame(
        latest[viewscreenDisplayIndex],
        viewscreenDisplayIndex,
        latest.length,
        Boolean(current?.state?.viewscreen?.generating)
      );
      playTrekUi("scroll");
    }, 7000);
  }

  // Poll for new frames while generating (ViewscreenAgent is async)
  if (viewscreenPollTimer) {
    clearInterval(viewscreenPollTimer);
    viewscreenPollTimer = null;
  }
  if (generating && current?.state?.runId) {
    const runId = current.state.runId;
    viewscreenPollTimer = setInterval(async () => {
      try {
        if (!current || current.state.runId !== runId) return;
        const view = await api(`/games/${runId}`);
        if (!current || current.state.runId !== runId) return;
        const prevLen = current.state.viewscreen?.playlist?.length || 0;
        const nextLen = view.state.viewscreen?.playlist?.length || 0;
        const wasGen = current.state.viewscreen?.generating;
        current = {
          ...current,
          state: {
            ...current.state,
            viewscreen: view.state.viewscreen,
          },
        };
        if (
          nextLen !== prevLen ||
          wasGen !== view.state.viewscreen?.generating
        ) {
          // Snap to newest when a frame arrives
          if (nextLen > prevLen) viewscreenDisplayIndex = -1;
          renderViewscreen(current.state);
        }
        if (!view.state.viewscreen?.generating && viewscreenPollTimer) {
          clearInterval(viewscreenPollTimer);
          viewscreenPollTimer = null;
        }
      } catch {
        /* ignore poll errors */
      }
    }, 4000);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendAction(text) {
  if (!aiReady) {
    showAiError(
      "Cannot play while the AI narrator is offline.",
      "Fix the connection, then click Retry connection or New Game."
    );
    return;
  }
  // Block double-submit while waiting on LLM (prevents overlapping turns + typewriter restarts)
  if (actionInFlight) return;

  // New player order — stop any narrator/cast audio still playing
  stopVoicePlayback();
  cancelTypewriter();

  if (!current?.state?.runId) {
    await newGame();
    if (!current?.state?.runId) return;
  }
  const runId = current.state.runId;
  const phaseBefore = current.state.phase;
  const seq = ++actionSeq;
  const tAction0 = performance.now();
  const startingMission = isMissionBeginAction(phaseBefore, text);

  // TrekCore order cues (phaser/warp/hail/…) fire immediately on Engage
  if (phaseBefore === "playing" || phaseBefore === "debrief") {
    playOrderCues(text, {
      ship: current.state.ship,
      mission: current.state.mission,
      state: current.state,
    });
  } else if (/begin|start|accept|engage/i.test(text)) {
    playTrekSfx("engage");
  } else {
    playTrekSfx("input_ok");
  }

  try {
    const compilingMissions =
      startingMission ||
      phaseBefore === "difficulty" ||
      (phaseBefore === "mission_type" && /expanded/i.test(text)) ||
      (phaseBefore === "mission_offer" &&
        (/more/i.test(text) || /^type:/i.test(text) || /^difficulty:/i.test(text)));
    setActionBusy(true, text);
    if (startingMission) {
      document.body.classList.remove("mission-board-active", "starbase-active");
      els.missionBoardOverlay?.classList.add("hidden");
      els.starbaseOverlay?.classList.add("hidden");
    }
    const heavySetup =
      phaseBefore === "tutorial_offer" ||
      phaseBefore === "tutorial" ||
      phaseBefore === "ship_select" ||
      phaseBefore === "ship_custom" ||
      phaseBefore === "mission_offer" ||
      phaseBefore === "mission_type" ||
      phaseBefore === "difficulty" ||
      phaseBefore === "starbase";
    let view;
    if (compilingMissions) {
      view = await withInitScreen(
        {
          title: "Incoming Communication",
          subtitle: startingMission
            ? "Starfleet Command · Mission start"
            : "Starfleet Command · Assignment packet",
          status: "INCOMING COMMUNICATION — STAND BY",
          network: "Subspace Comm Net LCARS",
          steps: startingMission
            ? [
                { key: "link", label: "Opening Starfleet channel", pct: 16 },
                { key: "packet", label: "Receiving mission orders", pct: 48 },
                { key: "slate", label: "Transferring to the bridge", pct: 78 },
                { key: "ready", label: "Channel open", pct: 100 },
              ]
            : [
                { key: "link", label: "Opening Starfleet channel", pct: 16 },
                { key: "packet", label: "Receiving assignment packet", pct: 48 },
                { key: "slate", label: "Compiling mission slate", pct: 78 },
                { key: "ready", label: "Board ready", pct: 100 },
              ],
          completeLabel: startingMission
            ? "Orders received · Taking the bridge"
            : "Assignments received",
        },
        (update) => fetchMissionBoard(runId, text, update)
      );
    } else {
      view = await api(`/games/${runId}/action`, {
        method: "POST",
        body: JSON.stringify({ text }),
        timeoutMs: heavySetup ? 100_000 : 90_000,
      });
    }

    // Ignore stale responses if a newer action started (shouldn't happen with busy lock)
    if (seq !== actionSeq) return;
    const llmMs = Math.round(performance.now() - tAction0);
    voice.textReadyAt = performance.now();
    voiceLog("action_text_received", {
      llmActionMs: llmMs,
      phase: view.state?.phase,
      narrationChars: (view.state?.pendingQuestion || "").length,
      speechOn: Boolean(view.state?.settings?.speechOn || voice.enabled),
    });

    els.input.value = "";

    // Ship chosen → full-screen crew init (images + voice locks) before next setup beat
    if (justAcquiredShip(phaseBefore, view)) {
      setActionBusy(false);
      view = await initializeCrewAfterShipSelect(view);
      if (seq !== actionSeq) return;
      render(view, { forceTypewriter: true });
      return;
    }

    // Mission begin: incoming-comm overlay already covered the wait.
    if (startingMission && view.state?.phase === "playing") {
      render(view, { forceTypewriter: true });
      return;
    }

    // Begin action did not enter playing (e.g. chose return to list)
    if (startingMission && view.state?.phase !== "playing") {
      cancelMissionBoot();
    }

    render(view, { forceTypewriter: true });
  } catch (err) {
    hideInitOverlay();
    if (startingMission) cancelMissionBoot();
    // Keep the active game. Only hard-fail AI banner when the *server* is gone
    // and we have no session — mid-mission LLM/network blips use a soft toast.
    const reason =
      err instanceof ApiError
        ? err.message
        : networkErrorMessage(err).message;
    const detail =
      err instanceof ApiError
        ? err.payload?.detail || err.payload?.reason || ""
        : networkErrorMessage(err).detail;

    const isNetwork = err instanceof ApiError && err.payload?.network;
    const isNarrator =
      err instanceof ApiError &&
      (err.status === 503 || /narrator|unavailable|llm/i.test(reason));

    if (isNetwork || isNarrator) {
      showSoftError(
        isNetwork
          ? reason
          : reason || "Narrator could not complete that step.",
        detail ||
          (isNarrator
            ? "Your voyage is still saved. Try the same option again in a moment."
            : "")
      );
    } else {
      showSoftError(reason, detail);
    }
    console.warn("Action failed:", reason, detail || err);
    if (current?.state) {
      renderStarbaseScreen(current.state);
      renderMissionBoard(current.state);
    }
  } finally {
    if (seq === actionSeq) {
      setActionBusy(false);
      // Keep focus off free-text until mission boot releases the first question
      if (aiReady && !missionBoot.active) els.input.focus();
    }
  }
}

/**
 * Full-screen LCARS-style transmission / init screen with progress bar.
 * Inspired by https://lcars-monitor.netlify.app/transmission
 */
const INIT_TITLES = ["Incoming Transmission", "Incoming Communication"];
const INIT_SUBS = [
  "Starfleet Command · Authorized access only",
  "Starfleet Command · Command authorization required",
  "From: Starfleet Command — Command authorization required",
];
const INIT_NETS = ["Subspace Comm Net", "System Monitor", "LCARS"];

let initSession = {
  active: false,
  token: 0,
  steps: [],
  index: 0,
};

function pickInit(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function showInitOverlay(opts = {}) {
  if (!els.initOverlay) return;
  initSession.token += 1;
  initSession.active = true;
  initSession.steps = opts.steps || [];
  initSession.index = 0;

  if (els.initTitle) {
    els.initTitle.textContent = opts.title || pickInit(INIT_TITLES);
  }
  if (els.initSubtitle) {
    els.initSubtitle.textContent = opts.subtitle || pickInit(INIT_SUBS);
  }
  if (els.initNetwork) {
    const net = opts.network || `${pickInit(INIT_NETS)} ${Math.floor(Math.random() * 9000 + 1000)}`;
    els.initNetwork.textContent = net;
  }
  if (els.initStatus) {
    els.initStatus.textContent = opts.status || "INITIALIZING BRIDGE SYSTEMS…";
  }
  if (els.initChecklist) {
    els.initChecklist.innerHTML = "";
    for (const step of initSession.steps) {
      const li = document.createElement("li");
      li.dataset.key = step.key || step.label;
      li.innerHTML = `<span class="mark">○</span><span class="lbl">${escapeHtml(
        step.label
      )}</span>`;
      els.initChecklist.appendChild(li);
    }
  }
  setInitProgress(0, opts.steps?.[0]?.label || "Stand by…");
  els.initOverlay.classList.remove("hidden");
  document.body.classList.add("init-active");
  if (els.hubWaiting) els.hubWaiting.classList.add("hidden");
  uiSound("open");
  startProcessingLoop();
}

function setInitProgress(pct, label) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (els.initProgressFill) els.initProgressFill.style.width = `${p}%`;
  if (els.initPercent) els.initPercent.textContent = `${p}%`;
  if (label && els.initStepLabel) els.initStepLabel.textContent = label;
  if (label && els.initStatus) {
    els.initStatus.textContent = label.toUpperCase();
  }
}

function markInitStep(key, state) {
  if (!els.initChecklist) return;
  const items = [...els.initChecklist.querySelectorAll("li")];
  for (const li of items) {
    const k = li.dataset.key;
    if (k === key) {
      li.classList.toggle("is-done", state === "done");
      li.classList.toggle("is-active", state === "active");
      const mark = li.querySelector(".mark");
      if (mark) {
        mark.textContent =
          state === "done" ? "●" : state === "active" ? "◎" : "○";
      }
    } else if (state === "active") {
      // leave previous done states
    }
  }
}

function hideInitOverlay() {
  initSession.active = false;
  initSession.token += 1;
  stopProcessingLoop();
  if (els.initOverlay) els.initOverlay.classList.add("hidden");
  document.body.classList.remove("init-active");
  setInitProgress(0, "Stand by…");
}

/**
 * Run async work under the transmission screen.
 * steps: [{ key, label, pct }] progressive milestones while work runs.
 * work(update) — update({ key?, label?, pct? }) to push progress.
 */
async function withInitScreen(opts, work) {
  const steps = opts.steps || [];
  showInitOverlay({ ...opts, steps });
  const token = initSession.token;

  // Soft auto-advance toward next milestone while waiting
  let autoPct = steps[0]?.pct ?? 5;
  const autoTimer = setInterval(() => {
    if (token !== initSession.token) return;
    autoPct = Math.min(autoPct + 1.2, 92);
    const active =
      steps.find((s, i) => {
        const next = steps[i + 1];
        return autoPct >= (s.pct || 0) && (!next || autoPct < next.pct);
      }) || steps[steps.length - 1];
    if (active) {
      markInitStep(active.key || active.label, "active");
      setInitProgress(autoPct, active.label);
    }
  }, 400);

  const update = (patch = {}) => {
    if (token !== initSession.token) return;
    if (patch.key) {
      // mark previous steps done
      for (const s of steps) {
        if (s.key === patch.key) break;
        markInitStep(s.key || s.label, "done");
      }
      markInitStep(patch.key, patch.done ? "done" : "active");
    }
    if (typeof patch.pct === "number") {
      autoPct = Math.max(autoPct, patch.pct);
      setInitProgress(patch.pct, patch.label);
    } else if (patch.label) {
      setInitProgress(autoPct, patch.label);
    }
  };

  try {
    const result = await work(update);
    if (token === initSession.token) {
      for (const s of steps) markInitStep(s.key || s.label, "done");
      setInitProgress(100, opts.completeLabel || "Bridge ready");
      await sleep(450);
    }
    return result;
  } finally {
    clearInterval(autoTimer);
    if (token === initSession.token) hideInitOverlay();
  }
}

async function newGame() {
  cancelMissionBoot();
  const steps = [
    { key: "link", label: "Establishing subspace link", pct: 12 },
    { key: "auth", label: "Authenticating LCARS core", pct: 28 },
    { key: "matrix", label: "Allocating narrative matrix", pct: 48 },
    { key: "voice", label: "Synchronizing voice protocols", pct: 68 },
    { key: "interface", label: "Calibrating bridge interface", pct: 88 },
    { key: "ready", label: "Bridge ready", pct: 100 },
  ];

  try {
    await withInitScreen(
      {
        title: pickInit(INIT_TITLES),
        subtitle: pickInit(INIT_SUBS),
        status: "INCOMING TRANSMISSION — STAND BY",
        steps,
        completeLabel: "Transmission complete · Bridge online",
      },
      async (update) => {
        update({ key: "link", label: "Establishing subspace link", pct: 15 });
        const ready = await checkAiLink(true);
        if (!ready) {
          hideInitOverlay();
          return;
        }

        update({ key: "auth", label: "Authenticating LCARS core", pct: 30 });
        stopVoicePlayback();
        await sleep(200);

        update({
          key: "matrix",
          label: "Allocating narrative matrix…",
          pct: 42,
        });
        let view = await api("/games", { method: "POST" });
        hideAiError();
        localStorage.removeItem(STORAGE_KEY);

        update({
          key: "voice",
          label: "Synchronizing voice protocols",
          pct: 72,
        });
        if (voice.enabled && !view.state.settings?.speechOn) {
          try {
            view = await api(`/games/${view.state.runId}/settings`, {
              method: "PATCH",
              body: JSON.stringify({ speechOn: true }),
            });
          } catch {
            /* non-fatal */
          }
        }

        update({
          key: "interface",
          label: "Calibrating bridge interface",
          pct: 90,
        });
        await sleep(250);
        update({ key: "ready", label: "Bridge ready", pct: 100, done: true });
        render(view);
        // New game: viewscreen starts collapsed until mission begin
        setPanelExpanded(els.viewscreenPanel, els.viewscreenToggle, false, {
          persist: true,
        });
        els.input.focus();
      }
    );
  } catch (err) {
    hideInitOverlay();
    if (err instanceof ApiError) {
      showAiError(
        err.payload?.reason || err.message,
        err.payload?.detail || err.payload?.ai?.detail || ""
      );
    } else {
      showAiError(err.message || "Failed to start game");
    }
  }
}

async function resume(runId) {
  const view = await api(`/games/${runId}`);
  if (!view?.state?.runId) {
    throw new Error("Saved game not found for this account");
  }
  // Keep local active-run pointer in sync after refresh / History resume
  setActiveRun(view.state.runId);
  render(view);
  closeHistory();
  return view;
}

async function deleteGame(runId) {
  const ok = confirm(
    "Delete this saved game permanently? This cannot be undone."
  );
  if (!ok) return;

  try {
    await api(`/games/${runId}`, { method: "DELETE" });
    if (getActiveRun() === runId) {
      localStorage.removeItem(STORAGE_KEY);
      current = null;
    }
    if (portraitRequestFor === runId) portraitRequestFor = null;
    await openHistory();
    if (!current && aiReady) {
      // If we deleted the active run, offer a clean slate in the log
      els.log.innerHTML = `<div class="log-entry current"><div class="who">System</div><div class="text">Save deleted. Click New Game to begin another voyage.</div></div>`;
      renderCrew(null);
      renderShip(null);
      renderObjectives(null);
      renderOptions([]);
    }
  } catch (err) {
    showSoftError(err.message || "Failed to delete game");
  }
}

/** Current signed-in account (IAP email / local browser account) */
let currentUser = null;

async function refreshCurrentUser() {
  try {
    currentUser = await api("/me");
  } catch {
    currentUser = null;
  }
  return currentUser;
}

/**
 * Paint the history modal account banner with the active email.
 * Local/dev: allow switching the browser account (scopes saves).
 * IAP: email is fixed by Google sign-in.
 */
function renderHistoryAccountBanner() {
  const emailEl = els.historyAccountEmail;
  const noteEl = els.historyAccountNote;
  const localEl = els.historyAccountLocal;
  const inputEl = els.historyAccountInput;
  if (!emailEl) return;

  const email = currentUser?.email || getLocalUserEmail() || "unknown";
  emailEl.textContent = email;

  const isIap = currentUser?.source === "iap";
  if (noteEl) {
    noteEl.textContent = isIap
      ? "Captains, missions, and saves are private to this Google account."
      : "Local play is linked to this email. History and new games stay under this account only.";
  }
  if (localEl) {
    if (isIap) {
      localEl.classList.add("hidden");
    } else {
      localEl.classList.remove("hidden");
      if (inputEl) inputEl.value = getLocalUserEmail() || email || "";
    }
  }
}

async function applyLocalAccountFromHistory() {
  const raw = els.historyAccountInput?.value || "";
  const email = setLocalUserEmail(raw);
  if (!email) {
    showSoftError("Enter a valid email address for this local account.");
    return;
  }
  uiSound("ok");
  // Clear in-browser active run — it may belong to the previous account
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  currentUser = null;
  await refreshCurrentUser();
  await openHistory({ skipSound: true });
  showSoftError(
    `Now playing as ${email}.`,
    "History and new games for this browser session are linked only to this account."
  );
}

async function openHistory(opts = {}) {
  if (!opts.skipSound) uiSound("history-open");
  els.historyList.innerHTML = "";

  // Always resolve + show the account this history belongs to
  await refreshCurrentUser();
  renderHistoryAccountBanner();

  // Campaign profiles (durable captains / ships)
  let profiles = [];
  try {
    const pdata = await api("/profiles");
    profiles = pdata.profiles || [];
  } catch {
    profiles = [];
  }

  if (profiles.length) {
    const head = document.createElement("div");
    head.className = "history-section-label";
    head.textContent = "Your Captains / Ships";
    els.historyList.appendChild(head);
    for (const p of profiles) {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `<div class="history-info">
        <strong>${escapeHtml(p.captainName)}</strong><br>
        <span class="muted">${escapeHtml(p.shipName)} ${escapeHtml(
        p.registryNumber || ""
      )} · SD ${escapeHtml(p.stardate || "—")}</span><br>
        <span class="muted">${p.missions || 0} mission(s) · ${new Date(
        p.updatedAt
      ).toLocaleString()}</span>
      </div>`;
      const actions = document.createElement("div");
      actions.className = "history-actions";
      const cont = document.createElement("button");
      cont.className = "lcars-btn secondary";
      cont.type = "button";
      cont.textContent = "Continue your story";
      cont.addEventListener("click", () => {
        uiSound("ok");
        continueProfile(p.id);
      });
      const del = document.createElement("button");
      del.className = "lcars-btn danger";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        uiSound("delete");
        try {
          await api(`/profiles/${p.id}`, { method: "DELETE" });
          openHistory();
        } catch (err) {
          showSoftError(err?.message || "Failed to delete profile");
        }
      });
      actions.appendChild(cont);
      actions.appendChild(del);
      row.appendChild(actions);
      els.historyList.appendChild(row);
    }
  }

  // Session run snapshots for this account
  let data = { games: [] };
  try {
    data = await api("/games");
  } catch (err) {
    const warn = document.createElement("div");
    warn.className = "muted";
    warn.textContent =
      err?.message || "Could not load session runs for this account.";
    els.historyList.appendChild(warn);
  }
  const profileIds = new Set(profiles.map((p) => p.id));
  const legacyGames = (data.games || []).filter(
    (g) => !g.profileId || !profileIds.has(g.profileId)
  );
  if (legacyGames.length) {
    const head = document.createElement("div");
    head.className = "history-section-label";
    head.textContent = "Session runs (legacy)";
    els.historyList.appendChild(head);
    for (const g of legacyGames) {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `<div class="history-info">
        <strong>${escapeHtml(g.playerName)}</strong><br>
        <span class="muted">${escapeHtml(g.shipName || "No ship")} — ${escapeHtml(
        g.missionTitle || g.phase
      )}</span><br>
        <span class="muted">${new Date(g.updatedAt).toLocaleString()} · ${escapeHtml(
        g.status
      )}</span>
      </div>`;

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const resumeBtn = document.createElement("button");
      resumeBtn.className = "lcars-btn secondary";
      resumeBtn.type = "button";
      resumeBtn.textContent = "Resume";
      resumeBtn.addEventListener("click", () => {
        uiSound("ok");
        resume(g.runId);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "lcars-btn danger";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        uiSound("delete");
        deleteGame(g.runId);
      });

      actions.appendChild(resumeBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);
      els.historyList.appendChild(row);
    }
  }

  if (!profiles.length && !legacyGames.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent =
      "No captains yet for this account. Start a New Game to begin your campaign.";
    els.historyList.appendChild(empty);
  }
  els.historyModal.classList.remove("hidden");
}

async function continueProfile(profileId) {
  try {
    setActionBusy(true, "Loading campaign…");
    const view = await api(`/profiles/${profileId}/continue`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    closeHistory();
    render(view, { forceTypewriter: true });
  } catch (err) {
    showSoftError(err?.message || "Failed to continue campaign");
  } finally {
    setActionBusy(false);
  }
}

function closeHistory() {
  uiSound("history-close");
  els.historyModal.classList.add("hidden");
}

els.btnSetAccount?.addEventListener("click", () => {
  applyLocalAccountFromHistory();
});
els.historyAccountInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applyLocalAccountFromHistory();
  }
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  // If narration is still typing and input is empty, skip typewriter
  if (typewriter.running && !els.input.value.trim()) {
    typewriter.skip = true;
    uiSound("soft");
    return;
  }
  const text = els.input.value.trim();
  if (text) {
    uiSound("engage");
    sendAction(text);
  } else {
    uiSound("deny");
  }
});

// Space with empty input also skips typewriter while focused on page
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (typewriter.running) {
    e.preventDefault();
    typewriter.skip = true;
  }
});

function bindHubRails() {
  document.querySelectorAll(".hub-theme-classic").forEach((btn) => {
    btn.addEventListener("click", () => applyUiTheme("classic"));
  });
  document.querySelectorAll(".hub-theme-lcars").forEach((btn) => {
    btn.addEventListener("click", () => applyUiTheme("lcars"));
  });
  document.querySelectorAll(".hub-voice-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      void toggleVoice();
    });
  });
  document.querySelectorAll(".hub-voice-menu").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = els.voiceMenu?.classList.contains("hidden");
      setVoiceMenuOpen(Boolean(open), btn);
    });
  });
  document.querySelectorAll(".hub-new-game").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiSound("new-game");
      newGame();
    });
  });
  document.querySelectorAll(".hub-campaign").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiSound("secondary");
      openHistory();
    });
  });
}

els.btnNew.addEventListener("click", () => {
  uiSound("new-game");
  newGame();
});
els.btnHistory.addEventListener("click", () => {
  uiSound("secondary");
  openHistory();
});
els.btnCloseHistory.addEventListener("click", () => {
  uiSound("close");
  closeHistory();
});

// Classic / LCARS visual theme + SFX (no game logic)
initLcarsFx();
initBridgeAmbient();
initTrekSfx();
initUiTheme();
bindHubRails();
updateVoiceToggleUi();
if (els.btnThemeClassic) {
  els.btnThemeClassic.addEventListener("click", () => applyUiTheme("classic"));
}
if (els.btnThemeLcars) {
  els.btnThemeLcars.addEventListener("click", () => applyUiTheme("lcars"));
}
if (els.lcarsSfxToggle) {
  els.lcarsSfxToggle.checked = isLcarsSfxEnabled();
  els.lcarsSfxToggle.addEventListener("change", () => {
    setLcarsSfxEnabled(els.lcarsSfxToggle.checked);
    if (els.lcarsSfxToggle.checked) {
      unlockLcarsAudio();
      unlockTrekAudio();
      uiSound("soft");
      playTrekSfx("comm_chirp");
      // Resume red-alert bed if still at crisis
      if (current?.state) syncRedAlertFromState(current.state);
    } else {
      setRedAlertLoop(false);
    }
  });
}
if (els.bridgeAmbientToggle) {
  els.bridgeAmbientToggle.checked = isBridgeAmbientEnabled();
  els.bridgeAmbientToggle.addEventListener("change", () => {
    setBridgeAmbientEnabled(els.bridgeAmbientToggle.checked);
    if (els.bridgeAmbientToggle.checked) {
      unlockLcarsAudio();
      unlockTrekAudio();
      startBridgeAmbient();
    }
  });
}
syncLcarsSfxToggleUi();

// Viewscreen + mission log expand/collapse
initCollapsiblePanels();

if (els.btnVoice) {
  els.btnVoice.addEventListener("click", () => {
    uiSound("voice-toggle");
    toggleVoice();
  });
}
if (els.btnVoiceMenu) {
  els.btnVoiceMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    uiSound("voice-menu");
    toggleVoiceMenu();
  });
}
if (els.btnVoicePause) {
  els.btnVoicePause.addEventListener("click", () => {
    uiSound("voice-pause");
    toggleVoicePause();
  });
}
if (els.btnVoiceStop) {
  els.btnVoiceStop.addEventListener("click", () => {
    uiSound("voice-stop");
    stopVoicePlayback();
  });
}
if (els.voiceSpeed) {
  els.voiceSpeed.value = String(voice.speed);
  els.voiceSpeed.addEventListener("change", () => {
    uiSound("voice-speed");
    setVoiceSpeed(els.voiceSpeed.value);
  });
}
// Close voice menu on outside click / Escape
document.addEventListener("click", (e) => {
  if (!isVoiceMenuOpen()) return;
  if (els.voiceControls && els.voiceControls.contains(e.target)) return;
  setVoiceMenuOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isVoiceMenuOpen()) {
    setVoiceMenuOpen(false);
  }
});
updateVoiceToggleUi();
if (els.btnDismissSoftError) {
  els.btnDismissSoftError.addEventListener("click", () => {
    uiSound("dismiss");
    hideSoftError();
  });
}

// Click (or keyboard) a narration paragraph / crew line to replay its voice
// (current beat + history strip)
function bindSpeakableContainer(root) {
  if (!root) return;
  root.addEventListener("click", (e) => {
    if (typewriter.running) return;
    const target = e.target.closest(".speakable");
    if (!target || !root.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    uiSound("replay");
    handleSpeakableActivate(target);
  });
  root.addEventListener("keydown", (e) => {
    if (typewriter.running) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest(".speakable");
    if (!target || !root.contains(target)) return;
    e.preventDefault();
    uiSound("replay");
    handleSpeakableActivate(target);
  });
}
bindSpeakableContainer(els.log);
bindSpeakableContainer(els.logHistory);
if (els.btnCloseScar) {
  els.btnCloseScar.addEventListener("click", () => closeScarModal());
}
if (els.scarModal) {
  els.scarModal.addEventListener("click", (e) => {
    if (e.target === els.scarModal) closeScarModal();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.scarModal && !els.scarModal.classList.contains("hidden")) {
    closeScarModal();
  }
});
if (els.btnRetryAi) {
  els.btnRetryAi.addEventListener("click", async () => {
    const ok = await checkAiLink(true);
    if (ok) await newGame();
  });
}

async function enforceAccessGate() {
  try {
    const access = await fetch("/api/access").then((r) =>
      r.ok ? r.json() : null
    );
    if (!access?.gateEnabled) return true;
    if (!access.authenticated) {
      window.location.replace("/access.html");
      return false;
    }
    if (!access.allowed) {
      window.location.replace("/access.html?gate=denied");
      return false;
    }
  } catch {
    /* local / offline: continue */
  }
  return true;
}

// Boot
(async function init() {
  try {
    if (!(await enforceAccessGate())) return;
    // Local: ensure browser has an account email before any game/history I/O
    // (IAP overrides this on Cloud Run).
    if (!getLocalUserEmail()) {
      // First local visit: seed from server default (DEV_USER_EMAIL) if any
      try {
        const probe = await api("/me");
        if (probe?.email && probe.source !== "iap") {
          setLocalUserEmail(probe.email);
        }
      } catch {
        /* will retry below */
      }
    }
    await refreshCurrentUser();
    // If still no browser email and not IAP, force a stable local identity
    if (
      !getLocalUserEmail() &&
      currentUser?.source !== "iap" &&
      currentUser?.email
    ) {
      setLocalUserEmail(currentUser.email);
    }

    const ready = await checkAiLink(true);
    if (!ready) return;

    const existing = getActiveRun();
    if (existing) {
      try {
        await resume(existing);
        return;
      } catch (err) {
        // Stale runId or different account — clear so refresh does not loop
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        console.warn(
          "[bridge] resume failed after refresh; starting fresh",
          err?.message || err
        );
      }
    }
    await newGame();
  } catch (err) {
    showAiError(
      err.message || "Bridge offline",
      "Run npm run dev from the project folder if the server is not running."
    );
  }
})();
