/**
 * Locked voice bibles for Narrator + crew — stable xAI voice_id + detailed
 * delivery prompt grounded in Star Trek lore and character bios.
 *
 * Narrator voice is reserved and never reused by crew so they never sound identical.
 */

import type {
  CrewMember,
  VoiceEmotion,
  VoiceIdentity,
} from "../../../../packages/game-core/src/index.js";

/** Bump to force re-lock of stored voices (e.g. after diversity / delivery fix). */
export const VOICE_PROFILE_VERSION = 3;

/** Subset of xAI built-in TTS voices with distinct character. */
const VOICES = {
  leo: { id: "leo", name: "Leo", feel: "authoritative and strong", gender: "male" },
  rex: { id: "rex", name: "Rex", feel: "confident and clear", gender: "male" },
  ara: { id: "ara", name: "Ara", feel: "warm and friendly", gender: "female" },
  eve: { id: "eve", name: "Eve", feel: "energetic and upbeat", gender: "female" },
  sal: { id: "sal", name: "Sal", feel: "smooth and balanced", gender: "male" },
  carina: { id: "carina", name: "Carina", feel: "soft and empathetic", gender: "female" },
  zagan: { id: "zagan", name: "Zagan", feel: "dramatic", gender: "male" },
  helix: { id: "helix", name: "Helix", feel: "bold and dynamic", gender: "male" },
  orion: { id: "orion", name: "Orion", feel: "cinematic storyteller", gender: "male" },
  luna: { id: "luna", name: "Luna", feel: "nurturing", gender: "female" },
  kepler: { id: "kepler", name: "Kepler", feel: "measured and cool", gender: "male" },
  atlas: { id: "atlas", name: "Atlas", feel: "deep and solid", gender: "male" },
  sirius: { id: "sirius", name: "Sirius", feel: "bright and clear", gender: "male" },
  celeste: { id: "celeste", name: "Celeste", feel: "soft and refined", gender: "female" },
  perseus: { id: "perseus", name: "Perseus", feel: "heroic and firm", gender: "male" },
  helios: { id: "helios", name: "Helios", feel: "bright command presence", gender: "male" },
  iris: { id: "iris", name: "Iris", feel: "clear and attentive", gender: "female" },
  ursa: { id: "ursa", name: "Ursa", feel: "grounded and strong", gender: "female" },
  castor: { id: "castor", name: "Castor", feel: "steady and practical", gender: "male" },
  cosmo: { id: "cosmo", name: "Cosmo", feel: "curious and lively", gender: "male" },
  altair: { id: "altair", name: "Altair", feel: "sharp and precise", gender: "male" },
  lux: { id: "lux", name: "Lux", feel: "polished and cool", gender: "male" },
  lumen: { id: "lumen", name: "Lumen", feel: "open and bright", gender: "male" },
  rigel: { id: "rigel", name: "Rigel", feel: "distant and analytical", gender: "male" },
  naksh: { id: "naksh", name: "Naksh", feel: "warm and resonant", gender: "male" },
} as const;

type VoiceKey = keyof typeof VOICES;

/** Picard-toned GM only — never assigned to bridge crew. */
const NARRATOR_VOICE: VoiceKey = "orion";

const MALE_POOL: VoiceKey[] = [
  "rex",
  "sal",
  "helix",
  "kepler",
  "atlas",
  "sirius",
  "perseus",
  "helios",
  "castor",
  "cosmo",
  "altair",
  "lux",
  "lumen",
  "rigel",
  "naksh",
  "zagan",
  "leo",
];

const FEMALE_POOL: VoiceKey[] = [
  "ara",
  "eve",
  "carina",
  "luna",
  "celeste",
  "iris",
  "ursa",
];

function pickVoice(key: VoiceKey): { voiceId: string; voiceName: string; feel: string } {
  const v = VOICES[key];
  return { voiceId: v.id, voiceName: v.name, feel: v.feel };
}

function isFeminine(sex?: string): boolean {
  const s = (sex || "").toLowerCase();
  return s === "female" || s === "f" || s === "woman";
}

function isMasculine(sex?: string): boolean {
  const s = (sex || "").toLowerCase();
  return s === "male" || s === "m" || s === "man";
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function speciesVoiceHints(species?: string): {
  cadence: string;
  diction: string;
  lore: string;
  preferred?: VoiceKey[];
} {
  const sp = (species || "Human").toLowerCase();
  if (/vulcan/.test(sp)) {
    return {
      cadence: "Even, unhurried cadence with almost no filler. Slight pauses before conclusions.",
      diction: "Precise Standard; logical constructions; rarely raises volume; dry understatement.",
      lore: "Vulcan logic and emotional restraint (Surak). Avoids slang.",
      preferred: ["kepler", "rigel", "lux", "altair"],
    };
  }
  if (/klingon/.test(sp)) {
    return {
      cadence: "Forceful, clipped bursts; proud emphasis on honor and duty.",
      diction: "Direct, martial phrasing; occasional guttural edge without caricature.",
      lore: "Klingon warrior culture — honor and courage over soft diplomacy.",
      preferred: ["helix", "zagan", "atlas", "perseus"],
    };
  }
  if (/andorian/.test(sp)) {
    return {
      cadence: "Alert and slightly sharp; ready-to-act energy.",
      diction: "Crisp military Standard; passionate under discipline.",
      lore: "Andorian pride and martial readiness.",
      preferred: ["rex", "helios", "sirius", "castor"],
    };
  }
  if (/tellarite/.test(sp)) {
    return {
      cadence: "Gruff, argumentative rhythm; enjoys a good counterpoint.",
      diction: "Blunt, practical; technical when engineering is involved.",
      lore: "Tellarite debate and engineering pragmatism.",
      preferred: ["atlas", "castor", "naksh", "helix"],
    };
  }
  if (/betazoid/.test(sp)) {
    return {
      cadence: "Gentle, attentive pacing; listens between the lines.",
      diction: "Empathic, careful with others' feelings.",
      lore: "Betazoid sensitivity informs tone — never invasive.",
      preferred: ["carina", "luna", "iris", "ara"],
    };
  }
  if (/bajoran/.test(sp)) {
    return {
      cadence: "Measured, spiritually grounded calm under pressure.",
      diction: "Respectful, earnest Standard; quiet conviction.",
      lore: "Bajoran resilience and faith-colored perspective.",
      preferred: ["ara", "ursa", "celeste", "luna"],
    };
  }
  if (/trill/.test(sp)) {
    return {
      cadence: "Warm, reflective; occasional older-wisdom turns of phrase.",
      diction: "Articulate, layered; comfortable with complexity.",
      lore: "Joined Trill long memory and careful judgment.",
      preferred: ["sal", "celeste", "lumen", "naksh"],
    };
  }
  if (/android|synthetic|soong/.test(sp)) {
    return {
      cadence: "Even tempo; deliberate syllable clarity.",
      diction: "Formal, complete sentences; rare idioms used carefully.",
      lore: "Synthetic officer striving for humanity while retaining precision.",
      preferred: ["kepler", "lux", "altair", "rigel"],
    };
  }
  if (/bolian/.test(sp)) {
    return {
      cadence: "Cheerful mid-tempo; service-oriented brightness.",
      diction: "Friendly, efficient shipboard Standard.",
      lore: "Bolian hospitality and teamwork.",
      preferred: ["eve", "cosmo", "sirius", "iris"],
    };
  }
  return {
    cadence: "Natural Federation Standard pacing; professional but warm.",
    diction: "Clear bridge English; idioms sparingly; respectful of rank.",
    lore: "Human Starfleet officer — curiosity, duty, Federation ideals.",
  };
}

function roleVoiceHints(role: string): {
  posture: string;
  preferred?: VoiceKey[];
  speed: number;
  baseline: string;
} {
  const r = role.toLowerCase();
  if (/first officer|xo|executive/.test(r) && !/engineer/.test(r)) {
    return {
      posture: "Second-in-command steadiness; concise recommendations; dry wit allowed.",
      preferred: ["rex", "perseus", "helios", "ursa"],
      speed: 1.02,
      baseline: "formal",
    };
  }
  if (/science|sensor|astrometric/.test(r)) {
    return {
      posture: "Reports findings with precision; qualifies uncertainty; never sensationalizes.",
      preferred: ["sal", "kepler", "rigel", "altair", "iris"],
      speed: 0.98,
      baseline: "calm",
    };
  }
  if (/tactical|security|weapons|armory/.test(r)) {
    return {
      posture: "Threat-first clarity; short sentences under fire; no panicking.",
      preferred: ["rex", "helix", "perseus", "ursa", "zagan"],
      speed: 1.08,
      baseline: "tense",
    };
  }
  if (/engineer|ops|operations|transporter/.test(r)) {
    return {
      posture: "Technical competence; problem-solving optimism; jargon then plain summary.",
      preferred: ["helix", "castor", "cosmo", "atlas", "eve"],
      speed: 1.06,
      baseline: "warm",
    };
  }
  if (/medical|doctor|nurse|counselor/.test(r)) {
    return {
      posture: "Bedside calm; prioritizes life; softens grim news without lying.",
      preferred: ["carina", "luna", "ara", "naksh", "celeste"],
      speed: 0.96,
      baseline: "warm",
    };
  }
  if (/helm|conn|navigator|flight/.test(r)) {
    return {
      posture: "Crisp callouts; spatial awareness; calm hands on the stick.",
      preferred: ["sirius", "cosmo", "eve", "helios"],
      speed: 1.06,
      baseline: "calm",
    };
  }
  if (/comm|communications/.test(r)) {
    return {
      posture: "Clear channel etiquette; diplomatic phrasing when hailing.",
      preferred: ["celeste", "iris", "lumen", "ara"],
      speed: 1.0,
      baseline: "formal",
    };
  }
  return {
    posture: "Professional bridge officer; clear and duty-focused.",
    preferred: ["rex", "ara", "sal", "sirius", "castor"],
    speed: 1.02,
    baseline: "calm",
  };
}

function genderPool(sex?: string): VoiceKey[] {
  if (isFeminine(sex)) return [...FEMALE_POOL];
  if (isMasculine(sex)) return [...MALE_POOL];
  return [...FEMALE_POOL, ...MALE_POOL];
}

/**
 * Pick a unique voice key: prefer role/species matches, never narrator's voice,
 * stay in gender pool when possible, avoid already-used ids on this ship.
 */
function selectVoiceKey(
  member: { name: string; role?: string; species?: string; sex?: string },
  usedVoiceIds: Set<string>,
  narratorVoiceId: string
): VoiceKey {
  const species = speciesVoiceHints(member.species);
  const role = roleVoiceHints(member.role || "Bridge Officer");
  const pool = genderPool(member.sex);
  const reserved = new Set([narratorVoiceId, VOICES[NARRATOR_VOICE].id]);

  // Prefer role/species matches that also match gender
  const preferredInGender = [
    ...(species.preferred || []),
    ...(role.preferred || []),
  ].filter((k) => pool.includes(k) && !reserved.has(VOICES[k].id));

  const genderCandidates = [...new Set([...preferredInGender, ...pool])].filter(
    (k) => !reserved.has(VOICES[k].id)
  );

  // Last resort if a full bridge exhausted one gender: other voices except narrator
  const overflow = [...MALE_POOL, ...FEMALE_POOL].filter(
    (k) => !reserved.has(VOICES[k].id) && !genderCandidates.includes(k)
  );

  const tiers = [genderCandidates, overflow];
  const seed = hashString(`${member.name}|${member.role}|${member.species}`);

  for (const candidates of tiers) {
    if (!candidates.length) continue;
    const start = seed % candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      const key = candidates[(start + i) % candidates.length];
      if (!usedVoiceIds.has(VOICES[key].id)) return key;
    }
  }

  // Everything taken — still stay in gender pool for a stable pick
  return genderCandidates[seed % Math.max(1, genderCandidates.length)] || "rex";
}

function needsVoiceRebuild(
  voice: VoiceIdentity | undefined,
  narratorVoiceId: string,
  usedVoiceIds: Set<string>
): boolean {
  if (!voice?.voiceId) return true;
  if (voice.profileVersion !== VOICE_PROFILE_VERSION) {
    return true;
  }
  // Collides with narrator or duplicate on ship
  if (voice.voiceId === narratorVoiceId || voice.voiceId === VOICES[NARRATOR_VOICE].id) {
    return true;
  }
  if (usedVoiceIds.has(voice.voiceId)) return true;
  return false;
}

/**
 * Build a locked voice identity for a crew member from bio/role/species.
 */
export function buildCrewVoiceIdentity(
  member: Pick<
    CrewMember,
    "name" | "role" | "species" | "sex" | "personality" | "bio"
  >,
  opts?: { usedVoiceIds?: Set<string>; narratorVoiceId?: string }
): VoiceIdentity {
  const narratorVoiceId = opts?.narratorVoiceId || VOICES[NARRATOR_VOICE].id;
  const used = opts?.usedVoiceIds || new Set<string>([narratorVoiceId]);
  const key = selectVoiceKey(member, used, narratorVoiceId);
  const voice = pickVoice(key);
  const species = speciesVoiceHints(member.species);
  const role = roleVoiceHints(member.role || "Bridge Officer");
  const personality = member.personality || "Dedicated Starfleet officer";
  const bio = member.bio || `${member.name} serves as ${member.role}.`;

  const voicePrompt = [
    `VOICE LOCK for ${member.name}, ${member.role} (${member.species || "Humanoid"}).`,
    `xAI voice_id="${voice.voiceId}" (${voice.voiceName}: ${voice.feel}) — unique on this bridge; never the Narrator voice.`,
    `Personality core: ${personality}`,
    `Bio anchor: ${bio}`,
    `Cadence: ${species.cadence}`,
    `Diction / language style: ${species.diction}`,
    `Bridge posture: ${role.posture}`,
    `Trek lore grounding: ${species.lore}`,
    `Speech tendencies: address the captain by rank when reporting; prefer concrete sensor/ship facts over speculation; stay in character as this Starfleet officer; no modern slang; no fourth-wall jokes.`,
    `Emotional range: default ${role.baseline}; UNDER FIRE / RED ALERT: clipped, urgent, less formal — short facts, raised energy, no leisurely banter; joy is restrained wonder; grief is quiet and brief.`,
    `Delivery stability: keep the same voice_id and character identity, but vary energy with the scene (calm ops vs battle stations).`,
  ].join(" ");

  return {
    voiceId: voice.voiceId,
    voiceName: voice.voiceName,
    voicePrompt,
    baselineTone: role.baseline,
    speed: Math.min(1.5, Math.max(0.7, role.speed)),
    tags: [
      member.role,
      member.species || "Human",
      member.sex || "unspecified",
      voice.voiceId,
      `v${VOICE_PROFILE_VERSION}`,
    ].filter(Boolean),
    profileVersion: VOICE_PROFILE_VERSION,
  };
}

/** Picard-toned Narrator — reserved cinematic voice, never used by crew. */
export function buildNarratorVoiceIdentity(): VoiceIdentity {
  const voice = pickVoice(NARRATOR_VOICE);
  const voicePrompt = [
    "VOICE LOCK for the Narrator (Gamemaster), Picard-rooted Starfleet storyteller.",
    `xAI voice_id="${voice.voiceId}" (${voice.voiceName}: ${voice.feel}) — RESERVED for narration only; crew must use other voice_ids.`,
    "Identity: authoritative, moral, commanding — same voice across the voyage.",
    "DEFAULT (calm ops / diplomacy / briefings): measured, eloquent; complete sentences; gentle gravitas; light captain's-log feel without purple excess.",
    "BATTLE / RED ALERT / BOARDING: drop the flowers. Short, urgent sentences. Present-tense action. Immediate stakes. Energy up; pauses short. Still Picard-commanding, not shouting chaos or slang.",
    "DISCOVERY / WONDER: warmer, slightly slower; room for awe.",
    "LOSS / DEBRIEF FAILURE: spare, somber; few words; weight without melodrama.",
    "Speech tendencies: open with situational clarity; invite the captain's choice without bullying; never reveal dice or meta rules out loud.",
    "Trek lore grounding: TNG / Strange New Worlds — exploration, diplomacy, ethics, and real combat when it comes.",
  ].join(" ");

  return {
    voiceId: voice.voiceId,
    voiceName: voice.voiceName,
    voicePrompt,
    baselineTone: "formal",
    // Slightly brisker base so calm scenes are not sleepy; urgency layers on top
    speed: 1.02,
    tags: ["narrator", "picard", "gamemaster", voice.voiceId, `v${VOICE_PROFILE_VERSION}`],
    profileVersion: VOICE_PROFILE_VERSION,
  };
}

/**
 * Ensure every crew member has a distinct locked voice (≠ narrator).
 * Re-locks when profile version is stale or collisions exist.
 */
export function ensureCrewVoices(
  crew: CrewMember[],
  narratorVoiceId?: string
): CrewMember[] {
  const narratorId = narratorVoiceId || VOICES[NARRATOR_VOICE].id;
  const used = new Set<string>([narratorId]);
  return crew.map((c) => {
    if (!needsVoiceRebuild(c.voice, narratorId, used)) {
      used.add(c.voice!.voiceId);
      return c;
    }
    const voice = buildCrewVoiceIdentity(c, {
      usedVoiceIds: used,
      narratorVoiceId: narratorId,
    });
    used.add(voice.voiceId);
    return { ...c, voice };
  });
}

/**
 * Split long text into speakable chunks for progressive TTS (faster first audio).
 * Prefers sentence boundaries; falls back to word boundaries.
 */
export function chunkTextForTts(text: string, maxChunk = 420): string[] {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunk) return [cleaned];

  const parts: string[] = [];
  // Split on sentence-ish boundaries
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
      // Hard-wrap very long sentences on words
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
 * TTS speed multiplier from scene emotion (applied on top of locked voice.speed).
 * Range stays within xAI limits 0.7–1.5.
 */
export function ttsSpeedForEmotion(
  baseSpeed: number,
  emotion?: VoiceEmotion | string | null
): number {
  const emo = (emotion || "calm").toLowerCase();
  let mult = 1;
  if (emo === "urgent") mult = 1.14;
  else if (emo === "tense") mult = 1.08;
  else if (emo === "warm") mult = 1.02;
  else if (emo === "wonder") mult = 0.98;
  else if (emo === "somber") mult = 0.92;
  else if (emo === "formal") mult = 0.97;
  else mult = 1.0;
  return Math.min(1.5, Math.max(0.7, (baseSpeed || 1) * mult));
}

/**
 * Style spoken text with xAI speech tags from locked voice + scene emotion.
 * Urgent scenes get firmer delivery; avoid heavy tags on very long clips.
 */
export function styleTextForTts(
  text: string,
  voice: VoiceIdentity,
  emotion?: VoiceEmotion | string | null
): string {
  let cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return cleaned;

  // Unary TTS hard limit
  if (cleaned.length > 14_500) {
    cleaned = cleaned.slice(0, 14_500);
  }

  const emo = (emotion || voice.baselineTone || "calm").toLowerCase();

  // Urgent/tense: collapse long pauses so delivery does not drag
  if (emo === "urgent" || emo === "tense") {
    cleaned = cleaned
      .replace(/\[long-pause\]/gi, "[pause]")
      .replace(/\n\n+/g, "\n")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // Prefer tagging a lead sentence for long clips (full wrap can sound flat or slow)
  const leadMatch = cleaned.match(/^(.+?[.!?…])(\s+|$)/s);
  const lead = leadMatch?.[1]?.trim() || "";
  const rest = leadMatch ? cleaned.slice(leadMatch[0].length).trim() : "";

  const wrapLead = (open: string, close: string) => {
    if (!lead || lead.length > 280) {
      if (cleaned.length <= 420) return `${open}${cleaned}${close}`;
      return cleaned;
    }
    return rest
      ? `${open}${lead}${close} ${rest}`
      : `${open}${lead}${close}`;
  };

  if (emo === "urgent") {
    return wrapLead("<emphasis>", "</emphasis>");
  }
  if (emo === "tense") {
    // Firm without full shout
    return wrapLead("<emphasis>", "</emphasis>");
  }
  if (emo === "somber") {
    if (cleaned.length <= 420) return `<soft>${cleaned}</soft>`;
    return wrapLead("<soft>", "</soft>");
  }
  if (emo === "wonder" && cleaned.length <= 360) {
    return cleaned;
  }
  return cleaned;
}

const COMBAT_TEXT =
  /\b(battle|combat|fire|phaser|torpedo|shields?|boarding|boarded|raid|raider|cloak|ambush|incoming|red alert|weapons|evasive|hull breach|under fire|enemy ship|squadron|dogfight|volley|impact|critical hit|destroyer|warship)\b/i;

const WONDER_TEXT =
  /\b(wonder|first contact|uncharted|anomaly|nebula|ancient|beauty|awe|discovery|strange new)\b/i;

const SOMBER_TEXT =
  /\b(casualt|lost|fail|wreck|dead|dying|grief|funeral|destroyed|no survivors|sacrifice)\b/i;

/**
 * Infer delivery emotion for TTS from mission state + spoken text.
 * Battle / red-alert → urgent; discovery → wonder; etc.
 */
export function inferSceneEmotion(input: {
  phase?: string;
  integrity?: number;
  missionStatus?: string | null;
  missionType?: string | null;
  flags?: string[];
  /** Text about to be spoken (narration or crew line) */
  text?: string | null;
  /** Last player action / option risk if known */
  lastRisk?: string | null;
  location?: string | null;
  title?: string | null;
}): VoiceEmotion {
  if (input.phase === "debrief") {
    return input.missionStatus === "failed" ? "somber" : "warm";
  }
  if (input.phase === "tutorial" || input.phase === "tutorial_offer") {
    return "warm";
  }
  if (input.phase === "mission_brief" || input.phase === "ask_name") {
    return "formal";
  }

  const integrity = input.integrity ?? 100;
  const flags = (input.flags || []).join(" ").toLowerCase();
  const blob = [
    input.text || "",
    flags,
    input.missionType || "",
    input.location || "",
    input.title || "",
    input.lastRisk || "",
  ]
    .join(" ")
    .toLowerCase();

  // Hard urgency: ship dying or explicit combat fiction
  if (integrity <= 30) return "urgent";
  if (COMBAT_TEXT.test(blob) || input.missionType === "battle") {
    if (integrity <= 55 || /critical|trap|board|destroy|breach/.test(blob)) {
      return "urgent";
    }
    return "tense";
  }
  if (/critical_failure|chose_trap|boarding|combat|raid|cloak|under_fire/.test(flags)) {
    return "urgent";
  }
  if (input.lastRisk === "high" || input.lastRisk === "trap") {
    return integrity <= 70 ? "urgent" : "tense";
  }
  if (SOMBER_TEXT.test(blob) && integrity <= 60) return "somber";
  if (integrity <= 50) return "tense";
  if (WONDER_TEXT.test(blob) || input.missionType === "exploration") {
    return "wonder";
  }
  if (input.missionType === "search_rescue" && integrity < 80) return "tense";
  if (input.missionType === "science") return "calm";

  return "calm";
}
