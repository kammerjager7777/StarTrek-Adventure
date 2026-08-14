/**
 * LCARS interface SFX — assets from lcars-monitor.netlify.app (/sounds/*.ogg).
 * Only plays when html[data-ui-theme="lcars"] and SFX are enabled.
 */

const SFX_PREF_KEY = "sta-lcars-sfx";
const BASE = "/assets/sfx";

/** @type {Record<string, { file: string, volume: number }>} */
const CATALOG = {
  soft: { file: "panel_beep_03.ogg", volume: 0.35 },
  /** Quiet tick for typewriter / status loops */
  type: { file: "panel_beep_03.ogg", volume: 0.07 },
  click: { file: "panel_beep_07.ogg", volume: 0.4 },
  close: { file: "panel_beep_08.ogg", volume: 0.4 },
  open: { file: "panel_beep_13.ogg", volume: 0.4 },
  nav: { file: "panel_beep_14.ogg", volume: 0.35 },
  /** Soft pulse while Narrator is thinking */
  waiting: { file: "panel_beep_14.ogg", volume: 0.12 },
  deny: { file: "deny_beep_01.ogg", volume: 0.45 },
  /** Incoming comm channel open */
  hail: { file: "panel_beep_13.ogg", volume: 0.5 },
  hail2: { file: "panel_beep_14.ogg", volume: 0.4 },
};

/** @type {Map<string, HTMLAudioElement[]>} */
const pools = new Map();
let unlocked = false;
let enabled = true;
/** @type {ReturnType<typeof setInterval> | null} */
let waitingLoopId = null;
let lastTypeTickAt = 0;

function loadSfxPref() {
  try {
    const v = localStorage.getItem(SFX_PREF_KEY);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
  } catch {
    /* ignore */
  }
  return true; // default on for LCARS
}

export function isLcarsTheme() {
  return document.documentElement.getAttribute("data-ui-theme") === "lcars";
}

export function isLcarsSfxEnabled() {
  return enabled;
}

export function setLcarsSfxEnabled(on) {
  enabled = Boolean(on);
  try {
    localStorage.setItem(SFX_PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!enabled) stopWaitingLoop();
}

function ensurePool(key) {
  if (pools.has(key)) return pools.get(key);
  const meta = CATALOG[key];
  if (!meta) return [];
  const list = [0, 1, 2].map(() => {
    const a = new Audio(`${BASE}/${meta.file}`);
    a.preload = "auto";
    a.volume = meta.volume;
    return a;
  });
  pools.set(key, list);
  return list;
}

/** Unlock audio on first user gesture (browser policy). */
export function unlockLcarsAudio() {
  if (unlocked) return;
  unlocked = true;
  for (const key of Object.keys(CATALOG)) {
    const pool = ensurePool(key);
    const a = pool[0];
    if (!a) continue;
    const prev = a.volume;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = prev;
      }).catch(() => {
        a.volume = prev;
      });
    } else {
      a.volume = prev;
    }
  }
}

/**
 * Play a named LCARS effect. No-op unless LCARS theme + SFX on.
 * @param {keyof typeof CATALOG} name
 */
export function playLcarsSfx(name) {
  if (!isLcarsTheme() || !enabled) return;
  if (!CATALOG[name]) return;
  unlockLcarsAudio();
  const pool = ensurePool(name);
  const meta = CATALOG[name];
  let audio = pool.find((a) => a.paused || a.ended) || pool[0];
  if (!audio) return;
  try {
    audio.volume = meta.volume;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Soft typewriter tick — throttled so it does not become noise.
 * @param {{ force?: boolean }} [opts]
 */
export function playTypeTick(opts = {}) {
  if (!isLcarsTheme() || !enabled) return;
  const now = performance.now();
  if (!opts.force && now - lastTypeTickAt < 70) return;
  lastTypeTickAt = now;
  playLcarsSfx("type");
}

/**
 * Incoming transmission / hail sequence (channel open + lock).
 * Returns a Promise that resolves when the cue has finished (~450ms).
 */
export function playIncomingTransmission() {
  return new Promise((resolve) => {
    if (!isLcarsTheme() || !enabled) {
      resolve();
      return;
    }
    playLcarsSfx("hail");
    setTimeout(() => playLcarsSfx("hail2"), 160);
    setTimeout(() => playLcarsSfx("soft"), 340);
    setTimeout(resolve, 480);
  });
}

/** Start soft looping pulse while Narrator is generating a response. */
export function startWaitingLoop() {
  if (!isLcarsTheme() || !enabled) return;
  stopWaitingLoop();
  playLcarsSfx("waiting");
  waitingLoopId = setInterval(() => {
    if (!isLcarsTheme() || !enabled) {
      stopWaitingLoop();
      return;
    }
    playLcarsSfx("waiting");
  }, 2200);
}

export function stopWaitingLoop() {
  if (waitingLoopId != null) {
    clearInterval(waitingLoopId);
    waitingLoopId = null;
  }
}

/** Convenience mapping for common UI intents */
export function lcarsUiSound(intent) {
  switch (intent) {
    case "primary":
      return playLcarsSfx("click");
    case "secondary":
      return playLcarsSfx("soft");
    case "open":
      return playLcarsSfx("open");
    case "close":
      return playLcarsSfx("close");
    case "nav":
      return playLcarsSfx("nav");
    case "deny":
    case "error":
      return playLcarsSfx("deny");
    case "waiting":
      return startWaitingLoop();
    case "waiting-end":
      return stopWaitingLoop();
    case "type":
      return playTypeTick();
    case "incoming":
      return playIncomingTransmission();
    default:
      return playLcarsSfx("soft");
  }
}

export function initLcarsFx() {
  enabled = loadSfxPref();
  for (const key of Object.keys(CATALOG)) ensurePool(key);

  const unlock = () => {
    unlockLcarsAudio();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}
