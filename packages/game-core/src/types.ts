/** Shared game types — play loop, viewscreen, and Phase 0 campaign contract. */

export type Difficulty = "easy" | "medium" | "hard" | "hardcore";

export type MissionType =
  | "science"
  | "exploration"
  | "search_rescue"
  | "battle"
  | "expanded";

export type Phase =
  | "boot"
  | "ask_name"
  | "tutorial_offer"
  | "tutorial"
  | "ship_select"
  | "ship_custom"
  | "mission_type"
  | "difficulty"
  | "mission_offer"
  | "mission_brief"
  | "playing"
  | "debrief"
  | "post_mission"
  /** Campaign hub after debrief — refit / recruit / next mission */
  | "starbase";

export type SystemStatus = "ok" | "damaged" | "destroyed";

export type ShipSystems = {
  shields: SystemStatus;
  torpedoes: SystemStatus;
  warp: SystemStatus;
  communications: SystemStatus;
  sensors: SystemStatus;
  lifeSupport: SystemStatus;
};

/** Canonical appearance used for consistent Imagine prompts */
export type VisualIdentity = {
  /** Stable short id for this visual subject */
  subjectId: string;
  /** Full locked description for image models (must stay stable across a run) */
  imagePrompt: string;
  /** Optional short tags */
  tags?: string[];
};

/**
 * Locked voice bible for Grok TTS consistency across a mission.
 * voiceId maps to an xAI built-in voice; voicePrompt is the delivery profile.
 */
export type VoiceIdentity = {
  /** xAI TTS voice_id (stable for the whole run) */
  voiceId: string;
  /** Human-readable voice label */
  voiceName: string;
  /**
   * Detailed locked prompt: speech tendencies, language style, Trek-lore
   * anchors, and emotional range. Must stay stable for a character.
   */
  voicePrompt: string;
  /** Default delivery tone when no scene emotion is supplied */
  baselineTone: string;
  /** Speech speed multiplier for TTS (0.7–1.5) */
  speed: number;
  tags?: string[];
  /** Bump when voice mapping changes so saves re-lock distinct profiles */
  profileVersion?: number;
};

/** Scene emotion hints used to lightly style TTS delivery */
export type VoiceEmotion =
  | "calm"
  | "warm"
  | "tense"
  | "urgent"
  | "somber"
  | "wonder"
  | "formal";

/** Multi-dimensional skill axes (0–100). Canonical Phase 0 campaign contract. */
export type SkillDimension =
  | "tactical"
  | "science"
  | "diplomacy"
  | "piloting"
  | "engineering"
  | "medical"
  | "command";

/**
 * Per-axis scores. Range is 0–100 at runtime (`clampSkill` in campaign.ts);
 * the type itself does not enforce bounds. Old saves may omit keys.
 */
export type SkillVector = Record<SkillDimension, number>;

export type CrewStatus = "active" | "injured" | "dead" | "transferred";

export type CrewMember = {
  id: string;
  name: string;
  role: string;
  species?: string;
  sex?: string;
  height?: string;
  skinTone?: string;
  hair?: string;
  eyes?: string;
  build?: string;
  clothing?: string;
  scarsMarks?: string;
  personality?: string;
  /** Short bio for crew dossier */
  bio?: string;
  /** Locked visual bible for Imagine consistency */
  visual?: VisualIdentity;
  /** Locked voice bible for Grok TTS consistency */
  voice?: VoiceIdentity;
  /** Generated portrait URL (local /media or remote) */
  imageUrl?: string | null;
  /** Portrait generation status for UI */
  portraitStatus?: "pending" | "ready" | "failed" | "none";
  /** Loyalty / attachment 0–100 */
  loyalty?: number;
  /** Role/experience skills (partial OK on older saves) */
  skills?: Partial<SkillVector>;
  /** Mechanical play turns served while active */
  serviceTurns?: number;
  /** Completed missions while alive */
  missionsServed?: number;
  status?: CrewStatus;
  deathCause?: string;
  joinedStardate?: string;
  /** Turns remaining before injured → active */
  injuryTurnsRemaining?: number;
  /** Recruitment quality tier (starbase hires) */
  quality?: RecruitQuality;
  /** Display rank, e.g. "Lt.", "Lt. Cmdr." */
  rank?: string;
};

/** Starbase recruit quality — scales starting skills */
export type RecruitQuality = "green" | "standard" | "veteran" | "elite";

export type ShipSkills = {
  /** From class / era baselines */
  base: SkillVector;
  /** Sum of living active crew contributions */
  fromCrew: SkillVector;
  /** base + fromCrew, clamped 0–100 */
  total: SkillVector;
};

export type Faction =
  | "federation"
  | "klingon"
  | "romulan"
  | "cardassian"
  | "borg"
  | "independent"
  | "other";

export type UniverseState = {
  stardate: string;
  globalTurn: number;
  factionReputation: Record<Faction, number>;
  knownLocations: string[];
  galacticFlags: string[];
  lastTickTurn: number;
  activeCrises: string[];
};

export type CampaignLogEntry = {
  missionId: string;
  title: string;
  stardate: string;
  outcome: "success" | "failed" | "abandoned";
  keyFlags: string[];
  casualties: string[];
  skillGains: Partial<SkillVector>;
  reputationDeltas: Partial<Record<Faction, number>>;
};

/** Durable captain/ship campaign (profile-centric save) */
export type CampaignProfile = {
  id: string;
  captainName: string;
  createdAt: string;
  updatedAt: string;
  ship: Ship;
  crew: CrewMember[];
  skills: ShipSkills;
  universe: UniverseState;
  campaignLog: CampaignLogEntry[];
  /** Optional mid-mission resume */
  activeRunId?: string | null;
  /** Last selected mission type — used when Continue skips setup. */
  lastMissionType?: MissionType | null;
  /** Last selected difficulty — used when Continue skips setup. */
  lastDifficulty?: Difficulty | null;
  /**
   * Account that owns this campaign (normalized email).
   * All profile list/load/continue is scoped by this field + user data dir.
   */
  ownerEmail?: string | null;
};

export type Ship = {
  id: string;
  name: string;
  /**
   * Starfleet registry, e.g. "NCC-1701" or "NX-01".
   * Always present on new ships; may be synthesized for older saves.
   */
  registryNumber: string;
  className: string;
  era: string;
  stardate: string;
  description: string;
  capabilities: string[];
  /** Hull integrity (legacy field name: integrity) */
  integrity: number;
  maxIntegrity: number;
  /** Shield grid energy 0–max; absorbs fire while online */
  shieldIntegrity: number;
  maxShieldIntegrity: number;
  /**
   * When false, the grid collapsed and is recharging — no shield absorption
   * until shieldRechargeTurns hits 0 and a partial restore occurs.
   */
  shieldGridOnline: boolean;
  /** Turns remaining until shield grid can restore after collapse */
  shieldRechargeTurns: number;
  systems: ShipSystems;
  crew: CrewMember[];
  /** Permanent scars for attachment / history */
  scars: string[];
  /** Locked exterior / bridge look for Imagine consistency */
  visual?: VisualIdentity;
  /** Optional exterior hero image */
  exteriorImageUrl?: string | null;
  /** Cached ship skill totals (recomputed on crew change) */
  skills?: ShipSkills;
};

/** How incoming damage interacts with shields vs hull */
export type DamageKind =
  | "phaser"
  | "laser"
  | "torpedo"
  | "collision"
  | "boarding"
  | "internal"
  | "general";

export type ObjectiveStatus = "active" | "completed" | "failed" | "missed";

export type Objective = {
  id: string;
  title: string;
  description: string;
  kind: "main" | "secondary";
  status: ObjectiveStatus;
};

export type Mission = {
  id: string;
  title: string;
  type: MissionType;
  difficulty: Difficulty;
  background: string;
  brief: string;
  location: string;
  objectives: Objective[];
  status: "active" | "success" | "failed";
  knownIntel: string[];
  /** Long-term consequence flags */
  flags: string[];
  /** Combat/play turns after mission start (does not include Accept) */
  playTurnCount?: number;
};

export type OptionRisk = "low" | "medium" | "high" | "trap";

export type TurnOption = {
  id: number;
  text: string;
  risk: OptionRisk;
};

export type CrewLine = {
  speaker: string;
  line: string;
};

/** Optional extra order suggested by an officer consult (Phase 5). */
export type AdviceSuggestedOption = {
  text: string;
  risk: OptionRisk;
};

/**
 * Last out-of-band crew consult. Run-scoped cache only — not a play turn.
 * Does not increment playTurnCount and does not store dice.
 */
export type LastAdvice = {
  memberId: string;
  memberName: string;
  question?: string;
  narration: string;
  advice: string;
  suggestedOption?: AdviceSuggestedOption | null;
  atTurn: number;
};

export type Turn = {
  sceneId: string;
  narration: string;
  crewDialogue: CrewLine[];
  options: TurnOption[];
  /** Beat summary for the Viewscreen / Imagine agent */
  viewscreenPrompt?: string;
  /**
   * Bridge SFX cues requested by the Narrator for this beat
   * (catalog keys or aliases, e.g. "phaser", "shield_hit", "red_alert").
   * Client plays when the turn lands; max ~4.
   */
  sfx?: string[];
  /** Pending dice context (server/debug; not shown in UI) */
  lastRoll?: {
    die: number;
    threshold: number;
    success: boolean;
    critical: "none" | "success" | "failure";
    reason: string;
  };
};

export type LogEntry = {
  at: string;
  phase: Phase;
  kind: "narration" | "player" | "system" | "roll" | "debrief";
  text: string;
};

/** One frame in the viewscreen journey book */
export type ViewscreenFrame = {
  id: string;
  createdAt: string;
  /** Short caption under / over the image */
  caption: string;
  /** Scene moment description used to generate the frame */
  momentPrompt: string;
  /** Final Imagine prompt (with visual bible baked in) */
  fullPrompt: string;
  imageUrl: string | null;
  status: "pending" | "ready" | "failed";
  /** Optional subjects featured (crew ids / ship) */
  subjects?: string[];
  turnSceneId?: string;
  phase?: Phase;
};

export type ViewscreenState = {
  /** Playlist of journey frames (oldest → newest) */
  playlist: ViewscreenFrame[];
  /** Index currently preferred for display (-1 = latest ready) */
  activeIndex: number;
  /** True while an Imagine job is running */
  generating: boolean;
  lastError?: string | null;
};

export type GameSettings = {
  /** Auto-play Grok TTS for narrator + crew lines */
  speechOn: boolean;
  imagesOn: boolean;
  tutorialCompleted: boolean;
  /** Alias kept for older saves; prefer speechOn */
  voiceMode: "off" | "on";
  /** Auto-generate viewscreen journey frames during play */
  viewscreenEnabled: boolean;
};

export type GameState = {
  runId: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed" | "abandoned";
  phase: Phase;
  playerName: string;
  /**
   * Account that owns this run (normalized email).
   * Saves live under data/users/{slug}/saves — never shared across accounts.
   */
  ownerEmail?: string | null;
  difficulty: Difficulty | null;
  missionType: MissionType | null;
  ship: Ship | null;
  mission: Mission | null;
  turn: Turn | null;
  log: LogEntry[];
  settings: GameSettings;
  /** Locked Narrator voice (Picard-toned GM) for the run */
  narratorVoice?: VoiceIdentity | null;
  /** Visual journey book for the viewscreen banner */
  viewscreen: ViewscreenState;
  /** Setup UI helpers */
  pendingQuestion: string | null;
  pendingChoices: TurnOption[] | null;
  setupNotes: string[];
  /**
   * Link to durable CampaignProfile. The active run still carries full
   * ship/crew; the profile is the source of truth on load / continue.
   */
  profileId?: string | null;
  /** Living galaxy state for this captain (mirrors profile.universe) */
  universe?: UniverseState | null;
  /** Soft advice cooldowns: crewId → last playTurnCount when advised */
  adviceCooldowns?: Record<string, number> | null;
  /** Temporary cache of the most recent officer consult (Phase 5). */
  lastAdvice?: LastAdvice | null;
  /** Snapshot of the campaign log for the starbase hub (mirrors profile). */
  campaignLog?: CampaignLogEntry[] | null;
  /** AI-generated ship offers during ship_select */
  setupShips?: Array<{
    id: string;
    name: string;
    registryNumber?: string;
    className: string;
    era: string;
    stardate: string;
    description: string;
    capabilities: string[];
    shipVisualPrompt: string;
    crew: Array<Record<string, unknown>>;
  }> | null;
  missionOffers: Array<{
    id: string;
    title: string;
    summary: string;
    type: MissionType;
    location?: string;
    background?: string;
    main?: string;
    secondaries?: string[];
  }> | null;
  debrief: string | null;
  /**
   * Temporary starbase session state (recruitment slate + refit counters).
   * Cleared when leaving hub for a new mission.
   */
  starbase?: StarbaseSession | null;
};

/** Yard class derived from Federation reputation */
export type StationClass = "outpost" | "starbase" | "fleet_yards";

/** One visit to the campaign hub between missions */
export type StarbaseSession = {
  /** Free hull restoration used this visit */
  hullRefitUsed: boolean;
  /** Free shield restoration used this visit */
  shieldRefitUsed: boolean;
  /** System keys repaired this visit */
  systemsRepaired: string[];
  /** Max system repairs allowed this visit (usually 1–3) */
  systemRepairBudget: number;
  /** Officers offered for recruitment (not yet hired) */
  recruitOffers: CrewMember[];
  /** How many hires allowed this visit */
  recruitBudget: number;
  recruitsHired: number;
  /** Sickbay treatments used this visit */
  medicalUsed: number;
  /** Max injured officers treatable this visit */
  medicalBudget: number;
  /** Crew transfers (off roster) used this visit */
  transfersUsed: number;
  /** Max transfers this visit */
  transferBudget: number;
  /** Structural deep-refit (big hull restore) used */
  deepRefitUsed: boolean;
  /** Facility tier — drives budgets and recruit quality */
  stationClass: StationClass;
  /** Visit initialized */
  ready: boolean;
};

export type PublicGameView = {
  state: GameState;
  metaCommands: string[];
  canHint: boolean;
  /** Live narrator mode — always LLM when a game is active */
  narrator: "llm";
  model: string;
};

export const DICE_THRESHOLDS: Record<Difficulty, number> = {
  easy: 5,
  medium: 10,
  hard: 15,
  hardcore: 18,
};

export const DEFAULT_SYSTEMS: ShipSystems = {
  shields: "ok",
  torpedoes: "ok",
  warp: "ok",
  communications: "ok",
  sensors: "ok",
  lifeSupport: "ok",
};

export function emptyViewscreen(): ViewscreenState {
  return {
    playlist: [],
    activeIndex: -1,
    generating: false,
    lastError: null,
  };
}
