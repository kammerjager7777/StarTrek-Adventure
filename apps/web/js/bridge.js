/** Star Trek Adventure — Bridge UI (Phase 1) */

const els = {
  log: document.getElementById("mission-log"),
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
  scarModal: document.getElementById("scar-modal"),
  scarModalTitle: document.getElementById("scar-modal-title"),
  scarModalIcon: document.getElementById("scar-modal-icon"),
  scarModalType: document.getElementById("scar-modal-type"),
  scarModalIndex: document.getElementById("scar-modal-index"),
  scarModalBody: document.getElementById("scar-modal-body"),
  btnCloseScar: document.getElementById("btn-close-scar"),
  btnVoice: document.getElementById("btn-voice"),
  btnVoiceMenu: document.getElementById("btn-voice-menu"),
  voiceMenu: document.getElementById("voice-menu"),
  voiceControls: document.getElementById("voice-controls"),
  btnVoicePause: document.getElementById("btn-voice-pause"),
  btnVoiceStop: document.getElementById("btn-voice-stop"),
  voiceSpeed: document.getElementById("voice-speed"),
  voiceVolume: document.getElementById("voice-volume"),
  softErrorToast: document.getElementById("soft-error-toast"),
  softErrorText: document.getElementById("soft-error-text"),
  btnDismissSoftError: document.getElementById("btn-dismiss-soft-error"),
};

let current = null;
let aiReady = false;
/** Prevent double-clicks / concurrent actions (causes overlapping LLM + typewriter restarts) */
let actionInFlight = false;
let actionSeq = 0;
const STORAGE_KEY = "sta-active-run";
/** Local preference mirrored to server when a run is active */
const VOICE_PREF_KEY = "sta-speech-on";
const VOICE_SPEED_KEY = "sta-voice-speed";
const VOICE_VOLUME_KEY = "sta-voice-volume";

function loadVoiceSpeed() {
  const n = Number(localStorage.getItem(VOICE_SPEED_KEY) || "1");
  if ([0.75, 1, 1.25, 1.5].includes(n)) return n;
  return 1;
}

function loadVoiceVolume() {
  const n = Number(localStorage.getItem(VOICE_VOLUME_KEY) || "100");
  if (Number.isFinite(n)) return Math.min(100, Math.max(0, n)) / 100;
  return 1;
}

/** Grok TTS auto-play queue + transport */
let voice = {
  enabled: localStorage.getItem(VOICE_PREF_KEY) === "1",
  token: 0,
  audio: null,
  objectUrl: null,
  speaking: false,
  paused: false,
  speed: loadVoiceSpeed(),
  volume: loadVoiceVolume(),
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

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    const { message, detail } = networkErrorMessage(err);
    throw new ApiError(message, { reason: message, detail, network: true }, 0);
  }

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
async function typeText(el, text, token) {
  typewriter.fullText = text;
  typewriter.textEl = el;
  el.textContent = "";
  el.classList.add("typing");

  let i = 0;
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

function render(view, opts = {}) {
  const { forceTypewriter = false } = opts;
  current = view;
  const s = view.state;
  setActiveRun(s.runId);

  // Prefer server setting when present
  if (typeof s.settings?.speechOn === "boolean") {
    voice.enabled = s.settings.speechOn;
    localStorage.setItem(VOICE_PREF_KEY, voice.enabled ? "1" : "0");
  }
  updateVoiceToggleUi();

  els.phase.textContent = s.phase;
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
  renderCrew(s.ship);
  renderObjectives(s.mission);
  renderMeta(view.metaCommands, s.phase);
  // Options appear after typewriter finishes (unless no narration)
  renderLog(s, { forceTypewriter });
  renderViewscreen(s);
}

function isVoiceMenuOpen() {
  return Boolean(els.voiceMenu && !els.voiceMenu.classList.contains("hidden"));
}

function setVoiceMenuOpen(open) {
  if (!els.voiceMenu) return;
  els.voiceMenu.classList.toggle("hidden", !open);
  if (els.btnVoiceMenu) {
    els.btnVoiceMenu.setAttribute("aria-expanded", open ? "true" : "false");
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
      ? "Auto-voice on — click to disable. Use ▾ for speed, volume, pause."
      : "Auto-voice off — click to enable. Use ▾ for options.";
  }

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
  if (els.voiceVolume) {
    const pct = Math.round(voice.volume * 100);
    if (Number(els.voiceVolume.value) !== pct) els.voiceVolume.value = String(pct);
  }

  // Reflect live speed/volume on current audio element
  if (voice.audio) {
    try {
      voice.audio.playbackRate = voice.speed;
      voice.audio.volume = voice.volume;
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
    voice.audio.volume = voice.volume;
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

function setVoiceVolume(pct) {
  const v = Math.min(100, Math.max(0, Number(pct) || 0)) / 100;
  voice.volume = v;
  localStorage.setItem(VOICE_VOLUME_KEY, String(Math.round(v * 100)));
  if (voice.audio) {
    try {
      voice.audio.volume = v;
    } catch {
      /* ignore */
    }
  }
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
    headers: { "Content-Type": "application/json" },
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
  audio.volume = voice.volume;
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
function buildSpeechQueue(state) {
  const units = [];
  if (state.pendingQuestion?.trim()) {
    for (const chunk of chunkTextForSpeech(state.pendingQuestion.trim())) {
      units.push({ speaker: "narrator", text: chunk });
    }
  }
  if (state.turn?.crewDialogue?.length) {
    for (const line of state.turn.crewDialogue) {
      if (!line?.line?.trim()) continue;
      const chunks = chunkTextForSpeech(line.line.trim(), 360);
      for (const chunk of chunks) {
        units.push({ speaker: line.speaker, text: chunk });
      }
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
      if (token !== voice.token || !voice.enabled) return;

      await waitWhilePaused(token);
      if (token !== voice.token || !voice.enabled) return;

      const result = await nextFetch;
      if (token !== voice.token || !voice.enabled) return;

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
  els.scarModal?.classList.add("hidden");
}

function renderShip(ship) {
  if (!ship) {
    els.ship.className = "panel-body muted";
    els.ship.textContent = "No ship selected";
    return;
  }
  els.ship.className = "panel-body ship-panel";
  const systems = Object.entries(ship.systems)
    .map(
      ([k, v]) =>
        `<div class="sys-row"><span>${escapeHtml(k)}</span><span class="sys-${escapeHtml(
          v
        )}">${escapeHtml(v)}</span></div>`
    )
    .join("");

  const scars = Array.isArray(ship.scars) ? ship.scars : [];
  const scarGrid = scars.length
    ? `<div class="scar-section">
        <div class="scar-section-label">Scars <span class="scar-count">${scars.length}</span></div>
        <div class="scar-grid" role="list">
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
        </div>
      </div>`
    : `<div class="scar-section scar-empty">
        <div class="scar-section-label">Scars</div>
        <div class="scar-empty-text">No lasting damage recorded</div>
      </div>`;

  els.ship.innerHTML = `
    <div class="ship-identity">
      <strong>${escapeHtml(ship.name)}</strong>
      <div class="ship-meta">${escapeHtml(ship.className)}</div>
      <div class="ship-meta">Stardate ${escapeHtml(ship.stardate)}</div>
      <div class="ship-integrity">Integrity: ${ship.integrity}/${ship.maxIntegrity}</div>
    </div>
    <div class="ship-systems-block">${systems}</div>
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
}

let portraitRequestFor = null;
let portraitsGenerating = false;

/** Viewscreen journey-book rotation */
let viewscreenRotateTimer = null;
let viewscreenPollTimer = null;
let viewscreenDisplayIndex = 0;

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

function renderCrew(ship) {
  if (!ship?.crew?.length) {
    els.crew.className = "panel-body crew-panel muted";
    els.crew.textContent = "—";
    return;
  }

  const pendingCount = ship.crew.filter(crewNeedsPortrait).length;
  const showGenerating = portraitsGenerating && pendingCount > 0;

  els.crew.className = "panel-body crew-panel";
  els.crew.innerHTML =
    (showGenerating
      ? `<div class="crew-imaging-banner" role="status" aria-live="polite">
          <span class="crew-imaging-spinner" aria-hidden="true"></span>
          <span>Imaging crew… <span class="crew-imaging-count">${pendingCount} remaining</span></span>
        </div>`
      : "") +
    ship.crew
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

  // Lazy-generate missing portraits once per run
  maybeRequestPortraits();
}

async function maybeRequestPortraits() {
  const runId = current?.state?.runId;
  const crew = current?.state?.ship?.crew;
  if (!runId || !crew?.length || !aiReady) return;

  const needs = crew.some(
    (c) =>
      !c.imageUrl &&
      c.portraitStatus !== "ready" &&
      c.portraitStatus !== "pending"
  );
  const needsRetry = crew.some((c) => c.portraitStatus === "failed" && !c.imageUrl);
  if (!needs && !needsRetry) {
    portraitsGenerating = false;
    return;
  }
  if (portraitRequestFor === runId) return;
  portraitRequestFor = runId;
  portraitsGenerating = true;

  // Re-render immediately so imaging banner/spinners appear
  if (current?.state?.ship) {
    renderCrew(current.state.ship);
  }

  try {
    const view = await api(`/games/${runId}/crew/portraits`, { method: "POST" });
    portraitsGenerating = false;
    // Only refresh ship/crew — never re-run typewriter for the same narration beat
    if (current?.state?.runId === runId) {
      current = {
        ...current,
        state: {
          ...current.state,
          ship: view.state.ship,
        },
      };
      renderShip(view.state.ship);
      renderCrew(view.state.ship);
    }
  } catch (err) {
    console.warn("Portrait generation failed:", err.message);
    portraitsGenerating = false;
    portraitRequestFor = null;
    if (current?.state?.ship) {
      renderCrew(current.state.ship);
    }
  }
}

function statusClass(status) {
  // Active = green; anything else (completed / failed / missed) = inactive red
  return status === "active" ? "obj-status-active" : "obj-status-inactive";
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

function renderObjectives(mission) {
  if (!mission) {
    els.objectives.className = "panel-body muted";
    els.objectives.textContent = "—";
    return;
  }

  const main = mission.objectives.filter((o) => o.kind === "main");
  const secondary = mission.objectives.filter((o) => o.kind === "secondary");

  els.objectives.className = "panel-body objectives-panel";
  els.objectives.innerHTML = `
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
    btn.addEventListener("click", () => sendAction(cmd));
    els.meta.appendChild(btn);
  }
}

function scrollLogToTop() {
  // New messages are prepended at the top of the mission log
  els.log.scrollTop = 0;
}

function appendPastLog(state) {
  const recent = [...state.log].slice(-40).reverse();
  recent.forEach((item, index) => {
    // Skip only the exact current prompt (already shown as "Narrator · now")
    if (item.text === state.pendingQuestion && item.kind === "narration") return;
    // Hide mechanical dice rolls from the player-facing log
    if (item.kind === "roll") return;
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
    els.log.appendChild(entry);
  });
}

function renderLogStaticCurrent(state, options) {
  /** Paint current narration fully (no typewriter) + history */
  els.log.innerHTML = "";
  if (state.pendingQuestion) {
    const entry = document.createElement("div");
    entry.className = "log-entry current narration";
    entry.innerHTML = `<div class="who">Narrator · now <span class="type-hint">click a line to hear it</span></div><div class="text"></div>`;
    const textEl = entry.querySelector(".text");
    fillSpeakableNarration(textEl, state.pendingQuestion);
    if (state.turn?.crewDialogue?.length) {
      for (const line of state.turn.crewDialogue) {
        const d = document.createElement("div");
        fillSpeakableCrewLine(d, line.speaker, line.line);
        entry.appendChild(d);
      }
    }
    // Dice rolls stay server-side only — not shown to the player
    els.log.appendChild(entry);
  }
  appendPastLog(state);
  renderOptions(options);
  scrollLogToTop();
}

function renderLog(state, opts = {}) {
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
  els.log.innerHTML = "";
  renderOptions([]); // hide choices while typing

  if (state.pendingQuestion) {
    const entry = document.createElement("div");
    entry.className = "log-entry current narration";
    entry.title = "Click to skip typewriter; after it finishes, click a paragraph or crew line to hear it";
    entry.innerHTML = `<div class="who">Narrator · now <span class="type-hint">click to skip · then click a line to replay</span></div><div class="text"></div>`;
    const textEl = entry.querySelector(".text");

    const crewLines = state.turn?.crewDialogue || [];
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
      const ok = await typeText(textEl, state.pendingQuestion, token);
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
  for (const opt of options || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.disabled = actionInFlight;
    btn.innerHTML = `<span class="num">${opt.id}.</span> ${escapeHtml(opt.text)}`;
    // Send full choice text so the mission log shows the order, not just "1"
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendAction(`${opt.id}. ${opt.text}`);
    });
    els.options.appendChild(btn);
  }
}

function setActionBusy(busy, detail = "") {
  actionInFlight = busy;
  if (els.input) els.input.disabled = busy || !aiReady;
  if (els.engageBtn) {
    els.engageBtn.disabled = busy || !aiReady;
    els.engageBtn.textContent = busy ? "Waiting…" : "Engage";
  }
  if (els.form) els.form.classList.toggle("is-waiting", busy);
  // Hide choices while waiting — avoids looking like nothing happened / double-clicks
  if (els.options) {
    els.options.classList.toggle("is-waiting", busy);
    els.options.classList.toggle("hidden", busy);
    els.options?.querySelectorAll("button.option-btn").forEach((btn) => {
      btn.disabled = busy;
    });
  }
  if (els.waitingBanner) {
    els.waitingBanner.classList.toggle("hidden", !busy);
  }
  if (els.waitingDetail) {
    const trimmed = (detail || "").replace(/\s+/g, " ").trim();
    els.waitingDetail.textContent = busy
      ? trimmed
        ? `Order: ${trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed}`
        : "Contacting the Narrator. This can take several seconds."
      : "Stand by on the bridge.";
  }

  // Soft cue on the log header while waiting
  if (els.phase) {
    if (busy) {
      els.phase.dataset.prevText =
        els.phase.dataset.prevText || els.phase.textContent;
      els.phase.textContent = "waiting";
      els.phase.classList.add("is-waiting-badge");
    } else {
      els.phase.classList.remove("is-waiting-badge");
      // Prefer live game phase after render; fall back to pre-wait label
      els.phase.textContent =
        current?.state?.phase ||
        els.phase.dataset.prevText ||
        els.phase.textContent;
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
}

function renderViewscreen(state) {
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

  if (!current?.state?.runId) {
    await newGame();
    if (!current?.state?.runId) return;
  }
  const runId = current.state.runId;
  const seq = ++actionSeq;
  const tAction0 = performance.now();
  setActionBusy(true, text);
  try {
    const view = await api(`/games/${runId}/action`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    // Ignore stale responses if a newer action started (shouldn't happen with busy lock)
    if (seq !== actionSeq) return;
    const llmMs = Math.round(performance.now() - tAction0);
    // Text arrived from server — mark ready before render kicks off TTS
    voice.textReadyAt = performance.now();
    voiceLog("action_text_received", {
      llmActionMs: llmMs,
      phase: view.state?.phase,
      narrationChars: (view.state?.pendingQuestion || "").length,
      speechOn: Boolean(view.state?.settings?.speechOn || voice.enabled),
    });
    render(view, { forceTypewriter: true });
    els.input.value = "";
  } catch (err) {
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
  } finally {
    if (seq === actionSeq) {
      setActionBusy(false);
      if (aiReady) els.input.focus();
    }
  }
}

async function newGame() {
  // Always re-verify AI before starting
  const ready = await checkAiLink(true);
  if (!ready) return;

  try {
    stopVoicePlayback();
    let view = await api("/games", { method: "POST" });
    hideAiError();
    localStorage.removeItem(STORAGE_KEY);
    // Apply local voice preference to the new run
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
    render(view);
    els.input.focus();
  } catch (err) {
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
  render(view);
  closeHistory();
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

async function openHistory() {
  const data = await api("/games");
  els.historyList.innerHTML = "";
  if (!data.games?.length) {
    els.historyList.textContent = "No saved games yet.";
  } else {
    for (const g of data.games) {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `<div class="history-info">
        <strong>${escapeHtml(g.playerName)}</strong><br>
        <span class="muted">${escapeHtml(g.shipName || "No ship")} — ${escapeHtml(
        g.missionTitle || g.phase
      )}</span><br>
        <span class="muted">${new Date(g.updatedAt).toLocaleString()} · ${g.status}</span>
      </div>`;

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const resumeBtn = document.createElement("button");
      resumeBtn.className = "lcars-btn secondary";
      resumeBtn.type = "button";
      resumeBtn.textContent = "Resume";
      resumeBtn.addEventListener("click", () => resume(g.runId));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "lcars-btn danger";
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteGame(g.runId));

      actions.appendChild(resumeBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);
      els.historyList.appendChild(row);
    }
  }
  els.historyModal.classList.remove("hidden");
}

function closeHistory() {
  els.historyModal.classList.add("hidden");
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  // If narration is still typing and input is empty, skip typewriter
  if (typewriter.running && !els.input.value.trim()) {
    typewriter.skip = true;
    return;
  }
  const text = els.input.value.trim();
  if (text) sendAction(text);
});

// Space with empty input also skips typewriter while focused on page
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (typewriter.running) {
    e.preventDefault();
    typewriter.skip = true;
  }
});

els.btnNew.addEventListener("click", () => newGame());
els.btnHistory.addEventListener("click", () => openHistory());
els.btnCloseHistory.addEventListener("click", () => closeHistory());
if (els.btnVoice) {
  els.btnVoice.addEventListener("click", () => toggleVoice());
}
if (els.btnVoiceMenu) {
  els.btnVoiceMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleVoiceMenu();
  });
}
if (els.btnVoicePause) {
  els.btnVoicePause.addEventListener("click", () => toggleVoicePause());
}
if (els.btnVoiceStop) {
  els.btnVoiceStop.addEventListener("click", () => stopVoicePlayback());
}
if (els.voiceSpeed) {
  els.voiceSpeed.value = String(voice.speed);
  els.voiceSpeed.addEventListener("change", () => {
    setVoiceSpeed(els.voiceSpeed.value);
  });
}
if (els.voiceVolume) {
  els.voiceVolume.value = String(Math.round(voice.volume * 100));
  els.voiceVolume.addEventListener("input", () => {
    setVoiceVolume(els.voiceVolume.value);
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
  els.btnDismissSoftError.addEventListener("click", () => hideSoftError());
}

// Click (or keyboard) a narration paragraph / crew line to replay its voice
if (els.log) {
  els.log.addEventListener("click", (e) => {
    if (typewriter.running) return;
    const target = e.target.closest(".speakable");
    if (!target || !els.log.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    handleSpeakableActivate(target);
  });
  els.log.addEventListener("keydown", (e) => {
    if (typewriter.running) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target.closest(".speakable");
    if (!target || !els.log.contains(target)) return;
    e.preventDefault();
    handleSpeakableActivate(target);
  });
}
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

// Boot
(async function init() {
  try {
    const ready = await checkAiLink(true);
    if (!ready) return;

    const existing = getActiveRun();
    if (existing) {
      try {
        await resume(existing);
        return;
      } catch {
        /* start fresh */
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
