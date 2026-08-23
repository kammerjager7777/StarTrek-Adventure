/**
 * TrekCore game + UI SFX.
 * Assets under /assets/sfx/trek/*.ogg (see assets/sfx/README.md).
 * Enabled by Voice ▾ → LCARS SFX toggle (both UI themes).
 */

import { isLcarsSfxEnabled } from "./lcarsFx.js";
import { setBridgeAmbientDucked } from "./bridgeAmbient.js";

const BASE = "/assets/sfx/trek";

/** @type {Record<string, { file: string, volume: number }>} */
const CATALOG = {
  // Alerts
  red_alert: { file: "red_alert1.ogg", volume: 0.42 },
  red_alert2: { file: "red_alert2.ogg", volume: 0.4 },
  yellow_alert: { file: "yellow_alert.ogg", volume: 0.4 },
  alert01: { file: "alert01.ogg", volume: 0.35 },
  alert02: { file: "alert02.ogg", volume: 0.35 },
  alert05: { file: "alert05.ogg", volume: 0.35 },
  intruder: { file: "intruder_alert.ogg", volume: 0.5 },
  intruder_nemesis: { file: "intruder_nemesis.ogg", volume: 0.5 },
  critical: { file: "critical.ogg", volume: 0.5 },
  console_warning: { file: "console_warning.ogg", volume: 0.45 },
  damage_alarm: { file: "damage_alarm.ogg", volume: 0.35 },
  damage_alarm2: { file: "damage_alarm2.ogg", volume: 0.35 },

  // Weapons / combat
  phaser: { file: "phaser.ogg", volume: 0.55 },
  phaser2: { file: "phaser2.ogg", volume: 0.55 },
  torpedo: { file: "torpedo.ogg", volume: 0.55 },
  torpedo2: { file: "torpedo2.ogg", volume: 0.55 },
  quantum_torpedo: { file: "quantum_torpedo.ogg", volume: 0.55 },
  fire_all: { file: "fire_all_weapons.ogg", volume: 0.55 },
  deflector: { file: "deflector.ogg", volume: 0.5 },
  shield_sizzle: { file: "shield_sizzle.ogg", volume: 0.5 },
  shield_sizzle2: { file: "shield_sizzle2.ogg", volume: 0.5 },
  hull_hit: { file: "hull_hit.ogg", volume: 0.55 },
  console_explo1: { file: "console_explo1.ogg", volume: 0.5 },
  console_explo2: { file: "console_explo2.ogg", volume: 0.5 },
  console_explo3: { file: "console_explo3.ogg", volume: 0.55 },
  large_explosion: { file: "large_explosion.ogg", volume: 0.55 },
  large_explosion2: { file: "large_explosion2.ogg", volume: 0.55 },
  small_explosion: { file: "small_explosion.ogg", volume: 0.5 },
  klingon_disruptor: { file: "klingon_disruptor.ogg", volume: 0.5 },
  romulan_disruptor: { file: "romulan_disruptor.ogg", volume: 0.5 },
  borg_phaser: { file: "borg_phaser.ogg", volume: 0.5 },

  // Voices
  voice_shields_failing: { file: "voice_shields_failing.ogg", volume: 0.65 },
  voice_structural: { file: "voice_structural.ogg", volume: 0.65 },
  voice_structural_breach: { file: "voice_structural_breach.ogg", volume: 0.65 },
  voice_abandon_ship: { file: "voice_abandon_ship.ogg", volume: 0.65 },
  voice_warp_core: { file: "voice_warp_core.ogg", volume: 0.65 },
  voice_nacelle: { file: "voice_nacelle.ogg", volume: 0.6 },
  voice_unable: { file: "voice_unable.ogg", volume: 0.55 },
  voice_auth: { file: "voice_auth_required.ogg", volume: 0.55 },
  voice_transfer: { file: "voice_transfer_complete.ogg", volume: 0.55 },
  voice_incoming: { file: "voice_incoming_tx.ogg", volume: 0.55 },
  voice_proximity: { file: "voice_proximity.ogg", volume: 0.55 },
  voice_long_range: { file: "voice_long_range.ogg", volume: 0.55 },
  voice_insufficient_sensors: {
    file: "voice_insufficient_sensors.ogg",
    volume: 0.55,
  },
  voice_affirmative: { file: "voice_affirmative.ogg", volume: 0.55 },
  voice_self_destruct: { file: "voice_self_destruct.ogg", volume: 0.65 },
  voice_self_destruct_cancel: {
    file: "voice_self_destruct_cancel.ogg",
    volume: 0.6,
  },

  // Comms / computer UI
  incoming_hail: { file: "incoming_hail.ogg", volume: 0.5 },
  hailing_open: { file: "hailing_open.ogg", volume: 0.45 },
  hail_beep: { file: "hail_beep.ogg", volume: 0.4 },
  hailbeep2: { file: "hailbeep2.ogg", volume: 0.4 },
  end_transmission: { file: "end_transmission.ogg", volume: 0.45 },
  start_transmission: { file: "start_transmission.ogg", volume: 0.45 },
  comm_chirp: { file: "comm_chirp.ogg", volume: 0.35 },
  chirp2: { file: "chirp2.ogg", volume: 0.35 },
  chirp3: { file: "chirp3.ogg", volume: 0.35 },
  comm_static: { file: "comm_static.ogg", volume: 0.45 },
  scrshow: { file: "scrshow.ogg", volume: 0.4 },
  screen_off: { file: "screen_off.ogg", volume: 0.4 },
  scrscroll: { file: "scrscroll1.ogg", volume: 0.3 },
  padd: { file: "padd1.ogg", volume: 0.35 },
  keyok1: { file: "keyok1.ogg", volume: 0.25 },
  keyok2: { file: "keyok2.ogg", volume: 0.25 },
  keyok3: { file: "keyok3.ogg", volume: 0.25 },
  keyok4: { file: "keyok4.ogg", volume: 0.25 },
  keyok5: { file: "keyok5.ogg", volume: 0.25 },
  keyok6: { file: "keyok6.ogg", volume: 0.25 },
  type: { file: "keyok1.ogg", volume: 0.08 },
  input_ok: { file: "input_ok.ogg", volume: 0.35 },
  input_ok2: { file: "input_ok2.ogg", volume: 0.35 },
  input_ok3: { file: "input_ok3.ogg", volume: 0.35 },
  input_failed: { file: "input_failed.ogg", volume: 0.4 },
  engage: { file: "engage.ogg", volume: 0.4 },
  deny: { file: "deny.ogg", volume: 0.4 },
  processing: { file: "processing.ogg", volume: 0.2 },
  processing2: { file: "processing2.ogg", volume: 0.2 },
  processing3: { file: "processing3.ogg", volume: 0.2 },
  computer_activate: { file: "computer_activate.ogg", volume: 0.4 },
  computerbeep14: { file: "computerbeep14.ogg", volume: 0.3 },
  computerbeep20: { file: "computerbeep20.ogg", volume: 0.3 },
  energize: { file: "energize.ogg", volume: 0.45 },

  // Systems / movement
  sensor: { file: "sensor_seq.ogg", volume: 0.4 },
  sensor_alert: { file: "sensor_alert.ogg", volume: 0.4 },
  alert_sensors: { file: "alert_sensors.ogg", volume: 0.4 },
  warp: { file: "warp.ogg", volume: 0.55 },
  warp_exit: { file: "warp_exit.ogg", volume: 0.55 },
  warp_out: { file: "warp_out.ogg", volume: 0.55 },
  helm_engage: { file: "helm_engage.ogg", volume: 0.45 },
  helm_seq: { file: "helm_seq.ogg", volume: 0.4 },
  flyby: { file: "flyby1.ogg", volume: 0.45 },
  transporter: { file: "transporter.ogg", volume: 0.5 },
  transporter_fail: { file: "transporter_fail.ogg", volume: 0.5 },
  tractor: { file: "tractor.ogg", volume: 0.45 },
  cloak: { file: "cloak.ogg", volume: 0.45 },
  decloak: { file: "decloak.ogg", volume: 0.45 },
  power_up1: { file: "power_up1.ogg", volume: 0.45 },
  power_up2: { file: "power_up2.ogg", volume: 0.45 },
  power_down: { file: "power_down.ogg", volume: 0.45 },
  powering_down: { file: "powering_down.ogg", volume: 0.45 },
  engineering: { file: "engineering_seq.ogg", volume: 0.35 },
  tactical: { file: "tactical_seq.ogg", volume: 0.35 },
  ops_seq: { file: "ops_seq.ogg", volume: 0.35 },
  tricorder: { file: "tricorder.ogg", volume: 0.4 },
  forcefield: { file: "forcefield_on.ogg", volume: 0.4 },
  forcefield_off: { file: "forcefield_off.ogg", volume: 0.4 },
  forcefield_disable: { file: "forcefield_disable.ogg", volume: 0.4 },
  forcefield_hit: { file: "forcefield_hit.ogg", volume: 0.45 },
  probe: { file: "probe_launch.ogg", volume: 0.5 },
  replicator: { file: "replicator.ogg", volume: 0.45 },
  hypospray: { file: "hypospray.ogg", volume: 0.45 },
  holodeck_on: { file: "holodeck_on.ogg", volume: 0.45 },
  holodeck_off: { file: "holodeck_off.ogg", volume: 0.45 },
  turbolift: { file: "turbolift.ogg", volume: 0.35 },
  turbolift_start: { file: "turbolift_start.ogg", volume: 0.4 },
  turbolift_stop: { file: "turbolift_stop.ogg", volume: 0.4 },
  door: { file: "door_open.ogg", volume: 0.35 },
  door_open2: { file: "door_open2.ogg", volume: 0.35 },
  door_close: { file: "door_close.ogg", volume: 0.35 },
  tng_chime: { file: "tng_chime.ogg", volume: 0.35 },
  viewscreen_on: { file: "viewscreen_on.ogg", volume: 0.55 },
  viewscreen_off: { file: "viewscreen_off.ogg", volume: 0.5 },
};

/** @type {Map<string, HTMLAudioElement[]>} */
const pools = new Map();
let unlocked = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let duckTimer = null;
/** Throttle same one-shot within a turn */
let lastPlayed = new Map();
let lastTypeTickAt = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let processingLoopId = null;

/** Looping red-alert klaxon bed */
/** @type {HTMLAudioElement | null} */
let redAlertAudio = null;
let redAlertDesired = false;
let redAlertLatched = false;
const RED_ALERT_LOOP_VOLUME = 0.22;
const RED_ALERT_LOOP_DUCKED = 0.1;

/** Optional scene beds (engineering / sickbay) — short use */
/** @type {HTMLAudioElement | null} */
let sceneBedAudio = null;
let sceneBedKey = null;

function sfxOn() {
  return isLcarsSfxEnabled();
}

function ensureRedAlertAudio() {
  if (redAlertAudio) return redAlertAudio;
  const meta = CATALOG.red_alert;
  redAlertAudio = new Audio(`${BASE}/${meta.file}`);
  redAlertAudio.loop = true;
  redAlertAudio.preload = "auto";
  redAlertAudio.volume = RED_ALERT_LOOP_VOLUME;
  try {
    redAlertAudio.setAttribute("playsinline", "true");
  } catch {
    /* ignore */
  }
  return redAlertAudio;
}

/**
 * @param {object | null | undefined} state
 */
export function isRedAlertState(state) {
  if (!state || state.phase !== "playing") return false;

  const flags = state.mission?.flags;
  if (Array.isArray(flags)) {
    for (const f of flags) {
      if (/red[_\s-]?alert/i.test(String(f))) return true;
    }
  }

  if (redAlertLatched) return true;

  const ship = state.ship;
  if (!ship) return false;

  const maxHull =
    typeof ship.maxIntegrity === "number" && ship.maxIntegrity > 0
      ? ship.maxIntegrity
      : 100;
  const hull =
    typeof ship.integrity === "number" ? ship.integrity : maxHull;
  if (hull / maxHull <= 0.4) return true;

  const shield =
    typeof ship.shieldIntegrity === "number" ? ship.shieldIntegrity : 0;
  if (shield <= 0) return true;

  const systems = ship.systems || {};
  for (const k of Object.keys(systems)) {
    if (systems[k] === "destroyed") return true;
  }

  return false;
}

/**
 * @param {object | null | undefined} state
 */
function canClearRedAlertLatch(state) {
  if (!state || state.phase !== "playing") return true;
  const flags = state.mission?.flags;
  if (Array.isArray(flags)) {
    for (const f of flags) {
      if (/red[_\s-]?alert/i.test(String(f))) return false;
    }
  }
  const ship = state.ship;
  if (!ship) return true;
  const maxHull =
    typeof ship.maxIntegrity === "number" && ship.maxIntegrity > 0
      ? ship.maxIntegrity
      : 100;
  const hull =
    typeof ship.integrity === "number" ? ship.integrity : maxHull;
  if (hull / maxHull <= 0.5) return false;
  const shield =
    typeof ship.shieldIntegrity === "number" ? ship.shieldIntegrity : 0;
  if (shield <= 0) return false;
  const systems = ship.systems || {};
  for (const k of Object.keys(systems)) {
    if (systems[k] === "destroyed") return false;
  }
  return true;
}

/**
 * @param {boolean} on
 */
export function setRedAlertLoop(on) {
  redAlertDesired = Boolean(on) && sfxOn();
  const a = ensureRedAlertAudio();
  if (!redAlertDesired) {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    return;
  }
  if (typeof document !== "undefined" && document.hidden) return;
  unlockTrekAudio();
  a.loop = true;
  a.volume = RED_ALERT_LOOP_VOLUME;
  if (a.paused) {
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }
}

/**
 * @param {object | null | undefined} state
 */
export function syncRedAlertFromState(state) {
  if (!state || state.phase !== "playing") {
    redAlertLatched = false;
    setRedAlertLoop(false);
    return;
  }
  if (redAlertLatched && canClearRedAlertLatch(state)) {
    redAlertLatched = false;
  }
  setRedAlertLoop(isRedAlertState(state));
}

/** @param {boolean} on */
export function setRedAlertDucked(on) {
  if (!redAlertAudio || !redAlertDesired) return;
  try {
    redAlertAudio.volume = on ? RED_ALERT_LOOP_DUCKED : RED_ALERT_LOOP_VOLUME;
  } catch {
    /* ignore */
  }
}

function ensurePool(key) {
  if (pools.has(key)) return pools.get(key);
  const meta = CATALOG[key];
  if (!meta) return [];
  const list = [0, 1].map(() => {
    const a = new Audio(`${BASE}/${meta.file}`);
    a.preload = "auto";
    a.volume = meta.volume;
    return a;
  });
  pools.set(key, list);
  return list;
}

export function unlockTrekAudio() {
  if (unlocked) return;
  unlocked = true;
  for (const key of [
    "phaser",
    "torpedo",
    "shield_sizzle",
    "hull_hit",
    "damage_alarm",
    "incoming_hail",
    "engage",
    "input_ok",
    "keyok1",
    "viewscreen_on",
  ]) {
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
 * @param {keyof typeof CATALOG | string} name
 * @param {{ delayMs?: number, force?: boolean, minGapMs?: number }} [opts]
 */
export function playTrekSfx(name, opts = {}) {
  if (!sfxOn() || !CATALOG[name]) return;
  const delayMs = opts.delayMs || 0;
  const minGap = opts.minGapMs ?? 400;
  const run = () => {
    if (!sfxOn()) return;
    const now = performance.now();
    if (!opts.force) {
      const last = lastPlayed.get(name) || 0;
      if (now - last < minGap) return;
    }
    lastPlayed.set(name, now);
    unlockTrekAudio();
    const pool = ensurePool(name);
    const meta = CATALOG[name];
    const audio = pool.find((a) => a.paused || a.ended) || pool[0];
    if (!audio) return;
    try {
      audio.volume = meta.volume;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      if (String(name).startsWith("voice_")) {
        duckAmbientBrief(Math.min(4500, (audio.duration || 3) * 1000));
      }
    } catch {
      /* ignore */
    }
  };
  if (delayMs > 0) setTimeout(run, delayMs);
  else run();
}

function duckAmbientBrief(ms) {
  setBridgeAmbientDucked(true);
  setRedAlertDucked(true);
  if (duckTimer != null) clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    setBridgeAmbientDucked(false);
    setRedAlertDucked(false);
    duckTimer = null;
  }, ms);
}

/**
 * UI intent → TrekCore computer SFX (works both themes when SFX on).
 * @param {string} intent
 */
export function playTrekUi(intent) {
  switch (intent) {
    case "primary":
    case "ok":
      return playTrekSfx("input_ok");
    case "engage":
      return playTrekSfx("engage");
    case "secondary":
    case "soft":
      return playTrekSfx("keyok2");
    case "open":
      return playTrekSfx("scrshow");
    case "close":
      return playTrekSfx("screen_off");
    case "nav":
    case "theme-lcars":
      return playTrekSfx("computerbeep14");
    case "theme-classic":
      return playTrekSfx("keyok3");
    case "deny":
    case "error":
      return playTrekSfx("deny");
    case "failed":
      return playTrekSfx("input_failed");
    case "ok2":
      return playTrekSfx("input_ok2");
    case "ok3":
      return playTrekSfx("input_ok3");
    case "new-game":
      return playTrekSfx("computer_activate");
    case "delete":
      return playTrekSfx("deny");
    case "dismiss":
      return playTrekSfx("keyok3");
    case "history-open":
      return playTrekSfx("padd");
    case "history-close":
      return playTrekSfx("screen_off");
    case "voice-toggle":
      return playTrekSfx("comm_chirp");
    case "voice-menu":
      return playTrekSfx("scrshow");
    case "voice-pause":
      return playTrekSfx("keyok1");
    case "voice-stop":
      return playTrekSfx("end_transmission");
    case "voice-speed":
      return playTrekSfx("keyok2");
    case "scroll":
      return playTrekSfx("scrscroll", { minGapMs: 500 });
    case "scar-open":
      return playTrekSfx("console_warning");
    case "scar-close":
      return playTrekSfx("keyok4");
    case "replay":
      return playTrekSfx("chirp2");
    case "waiting":
      return startProcessingLoop();
    case "waiting-end":
      return stopProcessingLoop();
    case "type":
      return playTypeTick();
    case "incoming":
      return playIncomingCommTrek();
    case "chime":
      return playTrekSfx("tng_chime");
    default:
      return playTrekSfx("keyok1");
  }
}

/** Soft typewriter tick — throttled. */
export function playTypeTick(opts = {}) {
  if (!sfxOn()) return;
  const now = performance.now();
  if (!opts.force && now - lastTypeTickAt < 70) return;
  lastTypeTickAt = now;
  const keys = ["keyok1", "keyok2", "keyok3", "keyok4", "keyok5", "keyok6"];
  const name = keys[Math.floor(Math.random() * keys.length)];
  // quieter type ticks
  const meta = CATALOG[name];
  if (!meta) return;
  unlockTrekAudio();
  const pool = ensurePool(name);
  const audio = pool.find((a) => a.paused || a.ended) || pool[0];
  if (!audio) return;
  try {
    audio.volume = 0.08;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* ignore */
  }
}

export function startProcessingLoop() {
  if (!sfxOn()) return;
  stopProcessingLoop();
  playTrekSfx("processing", { force: true });
  processingLoopId = setInterval(() => {
    if (!sfxOn()) {
      stopProcessingLoop();
      return;
    }
    const variants = ["processing", "processing2", "processing3"];
    playTrekSfx(variants[Math.floor(Math.random() * variants.length)], {
      minGapMs: 1800,
    });
  }, 2200);
}

export function stopProcessingLoop() {
  if (processingLoopId != null) {
    clearInterval(processingLoopId);
    processingLoopId = null;
  }
}

/**
 * Keyword match on player order / option text.
 * @param {string} text
 * @param {{ ship?: object }} [ctx]
 * @returns {string[]}
 */
export function cuesForOrderText(text, ctx = {}) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return [];
  const ship = ctx.ship || null;
  const cues = [];
  const push = (name) => {
    if (name && !cues.includes(name)) cues.push(name);
  };

  // Self-destruct first (specific)
  if (/self[-\s]?destruct|auto[-\s]?destruct/.test(t)) {
    if (/cancel|abort|stop|terminate|disarm/.test(t)) {
      push("voice_self_destruct_cancel");
    } else {
      push("voice_self_destruct");
      redAlertLatched = true;
    }
    return cues;
  }

  // Weapons
  if (/fire\s+all|full\s+spread|all\s+weapons/.test(t)) {
    if (ship?.systems?.torpedoes === "destroyed") push("voice_unable");
    else push("fire_all");
  } else if (/quantum\s+torpedo/.test(t)) {
    if (ship?.systems?.torpedoes === "destroyed") push("voice_unable");
    else push("quantum_torpedo");
  } else if (/torpedo|photon/.test(t)) {
    if (ship?.systems?.torpedoes === "destroyed") push("voice_unable");
    else push(Math.random() < 0.5 ? "torpedo" : "torpedo2");
  } else if (
    /phaser|beam\s+weapon|open\s+fire|weapons\s+free|target(ing)?\s+(the\s+)?/.test(
      t
    )
  ) {
    push(Math.random() < 0.5 ? "phaser" : "phaser2");
  } else if (/deflector(\s+dish)?|pulse\s+the\s+deflector/.test(t)) {
    push("deflector");
  }

  // Enemy flavor
  if (/klingon/.test(t) && /fire|weapon|disruptor|attack/.test(t)) {
    push("klingon_disruptor");
  }
  if (/romulan/.test(t) && /fire|weapon|disruptor|attack/.test(t)) {
    push("romulan_disruptor");
  }
  if (/borg/.test(t) && /fire|weapon|phaser|attack|beam/.test(t)) {
    push("borg_phaser");
  }

  // Warp / impulse / evasive
  if (
    /drop\s+out\s+of\s+warp|exit\s+warp|leave\s+warp|decelerat|full\s+stop|come\s+to\s+a\s+stop/.test(
      t
    )
  ) {
    push("warp_exit");
  } else if (
    /warp|emergency\s+jump|go\s+to\s+warp|maximum\s+warp|flee|retreat|disengage/.test(
      t
    )
  ) {
    if (ship?.systems?.warp === "destroyed") push("voice_nacelle");
    else push("warp");
  } else if (
    /evasive|hard\s+to\s+port|hard\s+to\s+starboard|come\s+about|impulse|thrusters?|maneuver/.test(
      t
    )
  ) {
    push("helm_engage");
    if (/evasive|flyby|pass/.test(t)) push("flyby");
  }

  // Transport
  if (
    /transport|beam\s+(up|down|over|aboard)|away\s+team/.test(t)
  ) {
    if (/fail|scrambl|pattern\s+loss|rematerial/.test(t)) push("transporter_fail");
    else push("transporter");
  } else if (/\benergize\b/.test(t)) {
    push("energize");
    push("transporter");
  }

  // Comms
  if (
    /end\s+(the\s+)?(transmission|hail|channel)|close\s+(the\s+)?(channel|frequencies)|sign\s+off/.test(
      t
    )
  ) {
    push("end_transmission");
  } else if (/hail|hailing|open\s+frequencies|negotiate|comm(unicat)?/.test(t)) {
    if (ship?.systems?.communications === "destroyed") push("comm_static");
    else push("hailing_open");
  }

  // Sensors / science
  if (/long[-\s]?range\s+scan/.test(t)) {
    if (ship?.systems?.sensors === "destroyed") push("voice_insufficient_sensors");
    else {
      push("sensor");
      push("voice_long_range");
    }
  } else if (/scan|sensor|probe|analysis/.test(t)) {
    if (ship?.systems?.sensors === "destroyed") push("voice_insufficient_sensors");
    else if (/tricorder/.test(t)) push("tricorder");
    else if (/\bprobe\b|launch\s+.*probe/.test(t)) push("probe");
    else push("sensor");
  } else if (/tricorder/.test(t)) {
    push("tricorder");
  } else if (/\bprobe\b|launch\s+.*probe/.test(t)) {
    push("probe");
  }

  if (/tractor/.test(t)) push("tractor");
  if (/\bdecloak\b/.test(t)) push("decloak");
  else if (/\bcloak(ed|ing)?\b/.test(t)) push("cloak");

  // Shields / power
  if (
    /lower\s+(the\s+)?shields|drop\s+(the\s+)?shields|shields\s+down|deactivate\s+shields/.test(
      t
    )
  ) {
    push("power_down");
  } else if (
    /divert|power\s+to\s+shields|reinforce\s+shields|raise\s+(the\s+)?shields|reroute/.test(
      t
    )
  ) {
    push("power_up1");
    push("engineering");
  } else if (/repair|restore|engineering|fix\s+it/.test(t)) {
    push("engineering");
  }

  // Security
  if (/board|boarding|intruder|repel/.test(t)) {
    push(Math.random() < 0.5 ? "intruder" : "intruder_nemesis");
  }
  if (
    /force\s*field\s+(off|down|disable)|drop\s+(the\s+)?force\s*field|deactivate\s+force/.test(
      t
    )
  ) {
    push("forcefield_off");
  } else if (/force\s*field|brig|security\s+lock/.test(t)) {
    push("forcefield");
  }

  if (/tactical|target\s+lock|weapons\s+lock/.test(t)) push("tactical");
  if (/proximity|incoming\s+vessel|contact\s+bearing/.test(t)) {
    push("voice_proximity");
  }

  // Flavor
  if (/replicat|coffee|tea,?\s+earl\s+grey|food\s+synthes/.test(t)) {
    push("replicator");
  }
  if (/hypo|sickbay|medical|triage|inject/.test(t)) {
    push("hypospray");
  }
  if (/holodeck|holo\s*program|end\s+program/.test(t)) {
    if (/end|off|exit|terminate/.test(t)) push("holodeck_off");
    else push("holodeck_on");
  }
  if (/turbolift|deck\s+\d+|take\s+us\s+to\s+deck/.test(t)) {
    push("turbolift_start");
  }
  if (/door|airlock|hatch|open\s+the\s+bay/.test(t)) {
    push("door");
  }

  // Alert condition orders
  if (/\bred\s*alert\b|\bbattle\s*stations\b|\bcondition\s*red\b/.test(t)) {
    redAlertLatched = true;
  } else if (/\byellow\s*alert\b|\bcondition\s*yellow\b/.test(t)) {
    push("yellow_alert");
    // yellow is softer — do not force red latch
  } else if (
    /\b(cancel|stand\s+down|end|secure)\s+red\s*alert\b|\ball\s*clear\b|\bstand\s+down\b/.test(
      t
    )
  ) {
    redAlertLatched = false;
    push("keyok3");
  }

  return cues;
}

/**
 * @param {string} text
 * @param {{ ship?: object, mission?: object, state?: object }} [ctx]
 */
export function playOrderCues(text, ctx = {}) {
  const cues = cuesForOrderText(text, ctx).slice(0, 4);
  cues.forEach((name, i) => playTrekSfx(name, { delayMs: i * 180 }));
  if (ctx.state) {
    syncRedAlertFromState(ctx.state);
  } else if (ctx.ship) {
    syncRedAlertFromState({
      phase: "playing",
      ship: ctx.ship,
      mission: ctx.mission || null,
    });
  }
  return cues;
}

/**
 * Diff ship/mission state and play damage / phase / objective / dice cues.
 * @param {object | null} prev
 * @param {object | null} next
 */
/** Catalog keys already played from a state-diff this render (skip in narrator SFX). */
let lastStateDeltaSfx = new Set();

export function playStateDeltaSfx(prev, next) {
  lastStateDeltaSfx = new Set();
  if (!next) {
    setRedAlertLoop(false);
    return;
  }

  syncRedAlertFromState(next);

  if (!sfxOn()) return;
  const prevShip = prev?.ship || null;
  const ship = next.ship || null;

  const cues = [];
  const push = (name, delayMs = 0) => {
    if (name === "red_alert" || name === "red_alert2") return;
    if (name) {
      lastStateDeltaSfx.add(name);
      cues.push({ name, delayMs });
    }
  };

  const prevPhase = prev?.phase;
  const phase = next.phase;
  const missionStatus = next.mission?.status;

  if (
    (phase === "debrief" || phase === "post_mission") &&
    prevPhase !== phase &&
    prevPhase !== "debrief" &&
    prevPhase !== "post_mission"
  ) {
    redAlertLatched = false;
    setRedAlertLoop(false);
    if (missionStatus === "success") push("voice_transfer", 200);
    else if (missionStatus === "failed") push("voice_abandon_ship", 200);
  }

  // Objectives complete / fail
  const prevObjs = prev?.mission?.objectives || [];
  const nextObjs = next.mission?.objectives || [];
  if (Array.isArray(nextObjs) && nextObjs.length) {
    for (let i = 0; i < nextObjs.length; i++) {
      const a = prevObjs[i];
      const b = nextObjs[i];
      if (!b) continue;
      const prevSt = a?.status;
      const st = b.status;
      if (st === prevSt) continue;
      if (st === "completed") push("voice_affirmative", 150);
      else if (st === "failed") push("critical", 150);
    }
  }

  // Dice criticals
  const prevRoll = prev?.turn?.lastRoll;
  const roll = next.turn?.lastRoll;
  if (roll && roll !== prevRoll) {
    const crit = roll.critical;
    if (crit === "success") push("voice_affirmative", 80);
    else if (crit === "failure") push("critical", 80);
    else if (roll.success === false && roll.die != null) {
      // soft fail tick only when new roll object
      if (!prevRoll || prevRoll.die !== roll.die) push("input_failed", 40);
    } else if (roll.success === true && (!prevRoll || prevRoll.die !== roll.die)) {
      push("input_ok", 40);
    }
  }

  // High / trap option risk on last player choice — inferred from turn options not reliable;
  // use mission flags when present
  const prevFlags = new Set(prev?.mission?.flags || []);
  const flags = next.mission?.flags || [];
  for (const f of flags) {
    if (prevFlags.has(f)) continue;
    if (/chose_trap|trap_option|critical_failure/i.test(String(f))) {
      push("console_warning", 100);
      redAlertLatched = true;
    }
    if (/red_alert/i.test(String(f))) redAlertLatched = true;
  }

  if (!ship) {
    for (const c of cues) playTrekSfx(c.name, { delayMs: c.delayMs });
    return;
  }

  if (!prevShip) {
    for (const c of cues) playTrekSfx(c.name, { delayMs: c.delayMs });
    return;
  }

  const prevShield =
    typeof prevShip.shieldIntegrity === "number" ? prevShip.shieldIntegrity : 0;
  const shield =
    typeof ship.shieldIntegrity === "number" ? ship.shieldIntegrity : 0;
  const prevHull =
    typeof prevShip.integrity === "number" ? prevShip.integrity : 0;
  const hull = typeof ship.integrity === "number" ? ship.integrity : 0;
  const maxHull =
    typeof ship.maxIntegrity === "number" ? ship.maxIntegrity : 100;

  const shieldDrop = prevShield - shield;
  const hullDrop = prevHull - hull;
  let combat = false;

  if (shieldDrop > 0 && shield > 0) {
    push(Math.random() < 0.3 ? "shield_sizzle2" : "shield_sizzle", 0);
    combat = true;
  }
  if (prevShield > 0 && shield <= 0 && shieldDrop > 0) {
    push("voice_shields_failing", 120);
    redAlertLatched = true;
    combat = true;
  }
  if (hullDrop > 0) {
    push("hull_hit", shieldDrop > 0 ? 220 : 0);
    redAlertLatched = true;
    combat = true;
    if (hull / Math.max(1, maxHull) <= 0.25) {
      push("voice_structural", 500);
    }
    if (hull / Math.max(1, maxHull) <= 0.1) {
      push("voice_structural_breach", 700);
    }
  }
  if (combat) {
    push(Math.random() < 0.4 ? "damage_alarm2" : "damage_alarm", 60);
  }

  const prevSys = prevShip.systems || {};
  const sys = ship.systems || {};
  for (const key of Object.keys({ ...prevSys, ...sys })) {
    const a = prevSys[key];
    const b = sys[key];
    if (a === b) continue;
    if (b === "destroyed" && a !== "destroyed") {
      redAlertLatched = true;
      if (key === "lifeSupport") push("voice_abandon_ship", 400);
      else if (key === "warp") push("voice_warp_core", 400);
      else if (key === "shields") push("voice_shields_failing", 300);
      else if (key === "communications") push("comm_static", 300);
      else if (key === "sensors") push("voice_insufficient_sensors", 300);
      else if (key === "torpedoes") push("console_explo3", 280);
      else push("console_explo3", 280);
      push(
        Math.random() < 0.5 ? "large_explosion" : "large_explosion2",
        350
      );
    } else if (b === "damaged" && a === "ok") {
      redAlertLatched = true;
      push(Math.random() < 0.5 ? "console_explo1" : "console_explo2", 240);
      if (key === "communications") push("comm_static", 400);
    } else if (b === "ok" && a && a !== "ok") {
      push("power_up2", 200);
    }
  }

  if (!combat && shield > prevShield + 2) {
    push("power_up2", 0);
  }

  const prevScars = Array.isArray(prevShip.scars) ? prevShip.scars.length : 0;
  const scars = Array.isArray(ship.scars) ? ship.scars.length : 0;
  if (scars > prevScars) {
    const last = String(ship.scars[ship.scars.length - 1] || "").toLowerCase();
    if (/board|intruder/.test(last)) push("intruder", 300);
    else push("small_explosion", 200);
    redAlertLatched = true;
  }

  syncRedAlertFromState(next);

  const seen = new Map();
  for (const c of cues) {
    if (!seen.has(c.name)) seen.set(c.name, c.delayMs);
  }
  let i = 0;
  for (const [name, delayMs] of seen) {
    playTrekSfx(name, { delayMs: delayMs + i * 40, minGapMs: 250 });
    i += 1;
  }
}

/** Mission begin / incoming communication cue */
export function playIncomingCommTrek() {
  playTrekSfx("incoming_hail", { force: true });
  playTrekSfx("start_transmission", { delayMs: 200 });
  playTrekSfx("voice_incoming", { delayMs: 480 });
}

/**
 * Play SFX cues authored by the Narrator (LLM) for this scene beat.
 * Accepts catalog keys or common aliases; max 4; staggered.
 * @param {string[] | null | undefined} cues
 * @param {{ force?: boolean }} [opts]
 */
export function playNarratorSfx(cues, opts = {}) {
  if (!sfxOn() || !Array.isArray(cues) || !cues.length) return;
  const ALIAS = {
    phasers: "phaser",
    phaser_fire: "phaser",
    weapons_fire: "phaser",
    torpedoes: "torpedo",
    photon: "torpedo",
    photons: "torpedo",
    quantum: "quantum_torpedo",
    fire_all_weapons: "fire_all",
    shield_hit: "shield_sizzle",
    shields_hit: "shield_sizzle",
    hull_damage: "hull_hit",
    explosion: "large_explosion",
    console_explode: "console_explo1",
    console_damage: "console_explo1",
    klaxon: "red_alert",
    battle_stations: "red_alert",
    intruder_alert: "intruder",
    proximity: "voice_proximity",
    proximity_alert: "voice_proximity",
    warp_engage: "warp",
    drop_out_of_warp: "warp_exit",
    impulse: "helm_engage",
    helm: "helm_engage",
    evasive: "flyby",
    transport: "transporter",
    beam: "transporter",
    tractor_beam: "tractor",
    shields_up: "power_up1",
    shields_down: "power_down",
    power_up: "power_up1",
    sensors: "sensor",
    scan: "sensor",
    hail: "hailing_open",
    hailing: "hailing_open",
    static: "comm_static",
    medical: "hypospray",
    holodeck: "holodeck_on",
    shields_failing: "voice_shields_failing",
    structural: "voice_structural",
    abandon_ship: "voice_abandon_ship",
    warp_core: "voice_warp_core",
    unable: "voice_unable",
    affirmative: "voice_affirmative",
    transfer_complete: "voice_transfer",
    self_destruct: "voice_self_destruct",
    klingon: "klingon_disruptor",
    romulan: "romulan_disruptor",
    borg: "borg_phaser",
    viewscreen: "viewscreen_on",
    alert: "alert01",
    warning: "console_warning",
    repair: "engineering",
  };

  const resolved = [];
  for (const raw of cues) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
    const name = ALIAS[key] || key;
    if (!CATALOG[name]) continue;
    if (!resolved.includes(name)) resolved.push(name);
    if (resolved.length >= 4) break;
  }

  for (let i = 0; i < resolved.length; i++) {
    const name = resolved[i];
    if (name === "red_alert" || name === "red_alert2") {
      redAlertLatched = true;
      setRedAlertLoop(true);
      continue;
    }
    // Don't replay combat one-shots the state-diff already fired (e.g. shields fail).
    if (lastStateDeltaSfx.has(name)) continue;
    if (
      lastStateDeltaSfx.has("voice_shields_failing") &&
      (name === "shield_sizzle" || name === "shield_sizzle2")
    ) {
      continue;
    }
    playTrekSfx(name, {
      delayMs: i * 200,
      force: Boolean(opts.force),
      minGapMs: 200,
    });
  }
}

/**
 * @param {"open" | "close"} [mode]
 */
export function playViewscreenSfx(mode = "open") {
  playTrekSfx(mode === "close" ? "viewscreen_off" : "viewscreen_on", {
    force: true,
  });
}

/** @deprecated */
export function playViewscreenOpen() {
  playViewscreenSfx("open");
}

export function playProcessingTick() {
  playTrekSfx("processing", { minGapMs: 2000 });
}

/**
 * Optional short scene bed (not full ambient replacement).
 * @param {"engineering"|"sickbay"|"bridge2"|null} kind
 */
export function setSceneBed(kind) {
  if (sceneBedAudio) {
    try {
      sceneBedAudio.pause();
    } catch {
      /* ignore */
    }
    sceneBedAudio = null;
    sceneBedKey = null;
  }
  if (!kind || !sfxOn()) return;
  const file =
    kind === "engineering"
      ? "engine_bed.ogg"
      : kind === "sickbay"
        ? "sickbay_bed.ogg"
        : kind === "bridge2"
          ? "bridge2.ogg"
          : null;
  if (!file) return;
  sceneBedKey = kind;
  sceneBedAudio = new Audio(`${BASE}/${file}`);
  sceneBedAudio.loop = true;
  sceneBedAudio.volume = 0.12;
  const p = sceneBedAudio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

export function initTrekSfx() {
  const unlock = () => {
    unlockTrekAudio();
    if (redAlertDesired) setRedAlertLoop(true);
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (redAlertAudio && !redAlertAudio.paused) {
        try {
          redAlertAudio.pause();
        } catch {
          /* ignore */
        }
      }
      if (sceneBedAudio && !sceneBedAudio.paused) {
        try {
          sceneBedAudio.pause();
        } catch {
          /* ignore */
        }
      }
    } else if (redAlertDesired && sfxOn()) {
      setRedAlertLoop(true);
      if (sceneBedKey) setSceneBed(sceneBedKey);
    }
  });

  // Preload catalog entries (lazy pools still work if some files missing)
  for (const key of Object.keys(CATALOG)) ensurePool(key);
  ensureRedAlertAudio();
}
