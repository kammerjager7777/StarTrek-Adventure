/** Shared game types — Phase 1 core, future-ready hooks */

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
  | "post_mission";

export type SystemStatus = "ok" | "damaged" | "destroyed";

export type ShipSystems = {
  shields: SystemStatus;
  torpedoes: SystemStatus;
  warp: SystemStatus;
  communications: SystemStatus;
  sensors: SystemStatus;
  lifeSupport: SystemStatus;
};

export type CrewMember = {
  id: string;
  name: string;
  role: string;
  species?: string;
  personality?: string;
  /** Phase 5: generated portrait URL */
  imageUrl?: string | null;
  /** Phase 5: loyalty / attachment */
  loyalty?: number;
};

export type Ship = {
  id: string;
  name: string;
  className: string;
  era: string;
  stardate: string;
  description: string;
  capabilities: string[];
  integrity: number;
  maxIntegrity: number;
  systems: ShipSystems;
  crew: CrewMember[];
  /** Permanent scars for attachment / history */
  scars: string[];
};

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

export type Turn = {
  sceneId: string;
  narration: string;
  crewDialogue: CrewLine[];
  options: TurnOption[];
  /** Phase 3: Imagine Agent consumes this */
  viewscreenPrompt?: string;
  /** Pending dice context shown to player */
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

export type GameSettings = {
  speechOn: boolean;
  imagesOn: boolean;
  tutorialCompleted: boolean;
  voiceMode: "off" | "on"; // Phase 4
};

export type GameState = {
  runId: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed" | "abandoned";
  phase: Phase;
  playerName: string;
  difficulty: Difficulty | null;
  missionType: MissionType | null;
  ship: Ship | null;
  mission: Mission | null;
  turn: Turn | null;
  log: LogEntry[];
  settings: GameSettings;
  /** Setup UI helpers */
  pendingQuestion: string | null;
  pendingChoices: TurnOption[] | null;
  setupNotes: string[];
  missionOffers: Array<{
    id: string;
    title: string;
    summary: string;
    type: MissionType;
  }> | null;
  debrief: string | null;
};

export type PublicGameView = {
  state: GameState;
  metaCommands: string[];
  canHint: boolean;
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
