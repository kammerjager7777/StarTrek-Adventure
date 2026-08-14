/**
 * Starship-bridge ambient — TNG bridge bed loop from TrekCore
 * (https://www.trekcore.com/audio/background/tng_bridge_1.mp3).
 * Optional sparse live panel chirps stay very quiet so the bed stays authentic.
 */

const AMBIENT_PREF_KEY = "sta-bridge-ambient";
/** Cache-bust when the loop file is replaced */
const AMBIENT_URL = "/assets/sfx/bridge_ambient.ogg?v=trekcore-tng1";
const SFX_BASE = "/assets/sfx";

/** Optional extra chirps — keep rare/soft; the loop already has console life */
const DECK_CHIRPS = [
  { file: "panel_beep_03.ogg", volume: 0.015 },
  { file: "panel_beep_07.ogg", volume: 0.012 },
  { file: "panel_beep_08.ogg", volume: 0.012 },
  { file: "panel_beep_13.ogg", volume: 0.012 },
  { file: "panel_beep_14.ogg", volume: 0.01 },
];

/** Base loop level — under speech, full TNG bed present */
const BASE_VOLUME = 0.28;
/** While narrator/cast TTS is playing */
const DUCKED_VOLUME = 0.1;
/** Chirps quieter still when speech is up */
const CHIRP_DUCK = 0.3;
const FADE_MS = 1400;

/** @type {HTMLAudioElement | null} */
let audio = null;
/** @type {HTMLAudioElement[]} */
let chirpPool = [];
let enabled = true;
let ducked = false;
let started = false;
let fadeTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let chirpTimer = null;
let targetVolume = BASE_VOLUME;

function loadAmbientPref() {
  try {
    const v = localStorage.getItem(AMBIENT_PREF_KEY);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function isBridgeAmbientEnabled() {
  return enabled;
}

export function setBridgeAmbientEnabled(on) {
  enabled = Boolean(on);
  try {
    localStorage.setItem(AMBIENT_PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (enabled) {
    startBridgeAmbient();
  } else {
    stopBridgeAmbient({ immediate: false });
  }
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(AMBIENT_URL);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  try {
    audio.setAttribute("playsinline", "true");
  } catch {
    /* ignore */
  }
  return audio;
}

function ensureChirpPool() {
  if (chirpPool.length) return chirpPool;
  chirpPool = DECK_CHIRPS.map((meta) => {
    const a = new Audio(`${SFX_BASE}/${meta.file}`);
    a.preload = "auto";
    a.volume = 0;
    return a;
  });
  return chirpPool;
}

function clearFade() {
  if (fadeTimer != null) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function stopChirpSchedule() {
  if (chirpTimer != null) {
    clearTimeout(chirpTimer);
    chirpTimer = null;
  }
}

/**
 * @param {number} to
 * @param {{ stopWhenZero?: boolean }} [opts]
 */
function fadeTo(to, opts = {}) {
  const a = ensureAudio();
  clearFade();
  targetVolume = Math.max(0, Math.min(1, to));
  const from = a.volume;
  const steps = 24;
  const stepMs = FADE_MS / steps;
  let i = 0;
  fadeTimer = setInterval(() => {
    i += 1;
    const t = Math.min(1, i / steps);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    a.volume = from + (targetVolume - from) * e;
    if (t >= 1) {
      clearFade();
      a.volume = targetVolume;
      if (opts.stopWhenZero && targetVolume <= 0.001) {
        try {
          a.pause();
        } catch {
          /* ignore */
        }
        started = false;
        stopChirpSchedule();
      }
    }
  }, stepMs);
}

function desiredVolume() {
  if (!enabled) return 0;
  return ducked ? DUCKED_VOLUME : BASE_VOLUME;
}

function playDeckChirp() {
  if (!enabled || !started || document.hidden) return;
  const pool = ensureChirpPool();
  const idx = Math.floor(Math.random() * pool.length);
  const meta = DECK_CHIRPS[idx];
  const a = pool[idx];
  if (!a || !meta) return;
  try {
    const vol = meta.volume * (ducked ? CHIRP_DUCK : 1);
    a.volume = vol;
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Optional rare chirps — bed loop carries most of the atmosphere */
function scheduleNextChirp() {
  stopChirpSchedule();
  if (!enabled || !started || document.hidden) return;
  // Very long gaps; loop already contains authentic console activity
  const delay = 18000 + Math.random() * 25000;
  chirpTimer = setTimeout(() => {
    if (Math.random() < 0.25) playDeckChirp();
    scheduleNextChirp();
  }, delay);
}

/**
 * Begin looping ambient after a user gesture (browser autoplay policy).
 */
export function startBridgeAmbient() {
  if (!enabled) return;
  const a = ensureAudio();
  ensureChirpPool();
  if (typeof document !== "undefined" && document.hidden) return;

  const onPlaying = () => {
    started = true;
    fadeTo(desiredVolume());
    scheduleNextChirp();
  };

  if (a.paused || !started) {
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(onPlaying).catch(() => {
        started = false;
        stopChirpSchedule();
      });
    } else {
      onPlaying();
    }
  } else {
    fadeTo(desiredVolume());
    if (!chirpTimer) scheduleNextChirp();
  }
}

/**
 * @param {{ immediate?: boolean }} [opts]
 */
export function stopBridgeAmbient(opts = {}) {
  stopChirpSchedule();
  const a = audio;
  if (!a) return;
  if (opts.immediate) {
    clearFade();
    a.volume = 0;
    try {
      a.pause();
    } catch {
      /* ignore */
    }
    started = false;
    return;
  }
  fadeTo(0, { stopWhenZero: true });
}

/**
 * Softly duck under speech, or restore.
 * @param {boolean} on
 */
export function setBridgeAmbientDucked(on) {
  ducked = Boolean(on);
  if (!enabled || !audio || audio.paused) return;
  fadeTo(desiredVolume());
}

/** Wire page visibility + first-gesture unlock. Call once at app start. */
export function initBridgeAmbient() {
  enabled = loadAmbientPref();

  const unlock = () => {
    if (enabled) startBridgeAmbient();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopChirpSchedule();
      if (audio && !audio.paused) {
        clearFade();
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        started = false;
      }
    } else if (enabled) {
      startBridgeAmbient();
    }
  });

  ensureAudio();
  ensureChirpPool();
}
