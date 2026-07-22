/**
 * GamemasterAgent (Narrotator)
 * Phase 1: structured setup + play via mock or xAI.
 * Future: ImagineAgent is separate; this agent only proposes viewscreenPrompt text.
 */

import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import type {
  Difficulty,
  GameState,
  Mission,
  MissionType,
  TurnOption,
} from "../../../packages/game-core/src/index.js";
import { loadSkillPacks, loadStockShips, shipChoicesText, templateToShip } from "../content/loader.js";

const MISSION_SEEDS: Record<
  MissionType,
  Array<{ title: string; summary: string; location: string; main: string; secondaries: string[] }>
> = {
  science: [
    {
      title: "The Whispering Lattice",
      summary: "A crystalline subspace lattice is rewriting local physics near a research outpost.",
      location: "Sector 441-B, lattice perimeter",
      main: "Stabilize or safely dismantle the lattice before the outpost is lost",
      secondaries: [
        "Recover the outpost's research logs",
        "Evacuate remaining scientists",
      ],
    },
    {
      title: "Chroniton Bloom",
      summary: "Temporal micro-anomalies are aging crew equipment in minutes.",
      location: "Nebula R-9",
      main: "Identify the chroniton source and neutralize the bloom",
      secondaries: ["Protect the ship's bio-neural systems", "Map safe transit corridors"],
    },
    {
      title: "Silent Algorithm",
      summary: "A derelict AI probe is broadcasting a mathematical plea no one can parse.",
      location: "Deep space buoy chain",
      main: "Decode the probe's message without triggering its defense protocols",
      secondaries: ["Preserve the probe intact", "Prevent signal contamination of nearby colonies"],
    },
  ],
  exploration: [
    {
      title: "First Light of Ka'reth",
      summary: "A pre-warp civilization has lit its first city-wide power grid — and detected your ship.",
      location: "Ka'reth system",
      main: "Uphold non-interference while preventing a cultural catastrophe",
      secondaries: ["Identify the faction that spotted you", "Secure a quiet withdrawal path"],
    },
    {
      title: "The Hollow Moon",
      summary: "A moon-sized construct opens every 19 years. It opened early.",
      location: "Outer rim of the Talis Expanse",
      main: "Explore the construct and determine its purpose",
      secondaries: ["Establish peaceful contact if inhabitants exist", "Chart an exit before the aperture closes"],
    },
    {
      title: "Cartographer's Debt",
      summary: "Starfleet needs a safe corridor through disputed space claimed by two rival powers.",
      location: "Border shoals of the Veylan Reach",
      main: "Chart a navigable corridor accepted by both powers",
      secondaries: ["Avoid sparking a border war", "Recover a missing survey drone"],
    },
  ],
  search_rescue: [
    {
      title: "Mayday from the Winter Finch",
      summary: "A civilian freighter's distress call cuts out mid-sentence near a plasma storm.",
      location: "Plasma storm front, grid 12",
      main: "Locate and rescue the Winter Finch survivors",
      secondaries: ["Salvage the freighter's cargo manifests", "Identify what attacked them"],
    },
    {
      title: "Away Team Overdue",
      summary: "An away team from another starship missed two check-ins on a Class-L world.",
      location: "Surface of PX-220",
      main: "Recover the away team alive",
      secondaries: ["Preserve local ecosystem balance", "Retrieve their tricorder data"],
    },
    {
      title: "Colony Blackout",
      summary: "New Hope Colony went silent after reporting 'visitors under the ice.'",
      location: "New Hope Colony",
      main: "Restore contact and ensure colonist survival",
      secondaries: ["Determine the nature of the visitors", "Re-establish planetary defenses"],
    },
  ],
  battle: [
    {
      title: "Ambush at Relay 9",
      summary: "A critical subspace relay is under attack by raiders using stolen cloaking tech.",
      location: "Relay 9",
      main: "Defend the relay until reinforcements arrive",
      secondaries: ["Minimize civilian traffic losses", "Capture a raider officer for intelligence"],
    },
    {
      title: "The Broken Line",
      summary: "Two allied frigates are pinned; a third hostile squadron is inbound.",
      location: "Kessik Flats",
      main: "Break the enemy pincer and extract the frigates",
      secondaries: ["Keep your ship above 40% integrity", "Protect the medical transport in the formation"],
    },
    {
      title: "Ghost Torpedoes",
      summary: "Unmarked torpedoes are striking border outposts with no launch signatures.",
      location: "Border outpost chain",
      main: "Identify and stop the source of the ghost torpedoes",
      secondaries: ["Prevent an outpost cascade failure", "Avoid open war with the nearest power"],
    },
  ],
  expanded: [
    {
      title: "Council of Knives",
      summary: "A peace summit, a missing ambassador, and a sabotage plot unfold at once.",
      location: "Neutral station Orryx",
      main: "Prevent war while recovering the ambassador",
      secondaries: [
        "Expose the saboteur",
        "Keep at least two factions at the table",
        "Protect station civilian decks",
      ],
    },
    {
      title: "Eclipse Protocol",
      summary: "A stellar engineering project is failing — and three fleets disagree on who is to blame.",
      location: "Binary star Velara",
      main: "Avert stellar catastrophe and a multi-fleet battle",
      secondaries: ["Secure scientific cooperation", "Stop a false-flag attack", "Evacuate research habitats"],
    },
    {
      title: "The Long Siege",
      summary: "A colony under siege needs supplies, diplomacy, and a surgical strike — in the wrong order.",
      location: "Colony world Marris III",
      main: "Lift the siege without glassing the planet",
      secondaries: ["Negotiate a humanitarian corridor", "Disable the siege command ship", "Rescue hostages"],
    },
  ],
};

function numbered(options: string[]): TurnOption[] {
  return options.map((text, i) => ({
    id: i + 1,
    text,
    risk: i === options.length - 1 ? "trap" : i === options.length - 2 ? "high" : "medium",
  }));
}

function pushLog(state: GameState, kind: GameState["log"][0]["kind"], text: string): GameState {
  return {
    ...state,
    log: [
      ...state.log,
      { at: new Date().toISOString(), phase: state.phase, kind, text },
    ],
  };
}

export async function advanceSetup(
  state: GameState,
  playerText: string
): Promise<GameState> {
  const input = playerText.trim();
  let next = { ...state };

  switch (state.phase) {
    case "boot":
    case "ask_name": {
      if (state.phase === "boot") {
        next = {
          ...next,
          phase: "ask_name",
          pendingQuestion:
            "I am the Narrotator, your Gamemaster. Before we cast off — what is your name, Captain?",
          pendingChoices: null,
        };
        return pushLog(next, "narration", next.pendingQuestion!);
      }
      if (!input) {
        next.pendingQuestion = "I must know how to address you. What is your name?";
        return next;
      }
      next.playerName = input;
      next.phase = "tutorial_offer";
      next.pendingQuestion = `Welcome aboard, Captain ${input}. Would you like to run an optional tutorial mission first?`;
      next.pendingChoices = numbered([
        "Yes — teach me the ropes (tutorial)",
        "No — take me to ship selection",
      ]);
      return pushLog(next, "player", input);
    }

    case "tutorial_offer": {
      const choice = parseChoice(input, next.pendingChoices);
      if (choice === 1) {
        next.settings = { ...next.settings, tutorialCompleted: false };
        next.phase = "tutorial";
        next.pendingQuestion =
          "Tutorial: You will face one simple decision. Options are numbered; pick only one. Risky actions may call for a d20. Choose:";
        next.pendingChoices = numbered([
          "Scan the anomaly carefully before approaching (safer)",
          "Charge in at full impulse to impress the crew (risky)",
        ]);
        next.turn = {
          sceneId: "tutorial-1",
          narration: next.pendingQuestion,
          crewDialogue: [
            {
              speaker: "Operations",
              line: "Captain, sensors show a low-risk training buoy. Perfect for a drill.",
            },
          ],
          options: next.pendingChoices,
          viewscreenPrompt: "Starship bridge viewscreen showing a distant training buoy",
        };
      } else if (choice === 2) {
        next = await goShipSelect(next);
      } else {
        next.pendingQuestion = "Please select option 1 or 2.";
      }
      return pushLog(next, "player", input);
    }

    case "tutorial": {
      const choice = parseChoice(input, next.pendingChoices);
      if (!choice) {
        next.pendingQuestion = "Select a single numbered option (1 or 2).";
        return next;
      }
      next.settings = { ...next.settings, tutorialCompleted: true };
      if (choice === 2) {
        next = pushLog(
          next,
          "system",
          "Tutorial note: that was the riskier path. In a real mission, a d20 might decide the outcome — and failure can cost ship integrity."
        );
      } else {
        next = pushLog(
          next,
          "system",
          "Tutorial note: careful scanning is often the wiser first move. Dice still matter when stakes rise."
        );
      }
      next = await goShipSelect(next);
      return pushLog(next, "player", input);
    }

    case "ship_select": {
      const ships = await loadStockShips();
      const choice = parseChoice(input, next.pendingChoices);
      if (choice && choice >= 1 && choice <= ships.length) {
        next.ship = templateToShip(ships[choice - 1]);
        next.phase = "mission_type";
        next.pendingQuestion = `You have the bridge of ${next.ship.name}. What manner of mission do you seek?`;
        next.pendingChoices = numbered([
          "Science — technology and problem-solving",
          "Exploration — discovery and diplomacy",
          "Search & Rescue — find and save those in peril",
          "Battle — starship combat and strategy",
          "Expanded — complex multi-skill Hardcore scenario",
        ]);
      } else if (choice === ships.length + 1 || /custom/i.test(input)) {
        next.phase = "ship_custom";
        next.setupNotes = [];
        next.pendingQuestion =
          "Custom vessel. First: what is your ship's name?";
        next.pendingChoices = null;
      } else {
        next.pendingQuestion = "Select a numbered ship, or choose the custom option.";
      }
      return pushLog(next, "player", input);
    }

    case "ship_custom": {
      // Simple multi-step custom ship via setupNotes length
      if (next.setupNotes.length === 0) {
        if (!input) {
          next.pendingQuestion = "What is your ship's name?";
          return next;
        }
        next.setupNotes = [input];
        next.pendingQuestion =
          "Select a ship class:\n1. Galaxy class\n2. Intrepid class\n3. Constitution class\n4. Shepard class\n5. Type another class name";
        next.pendingChoices = numbered([
          "Galaxy class",
          "Intrepid class",
          "Constitution class",
          "Shepard class",
          "Other (type the class after selecting 5, or just type it)",
        ]);
        return pushLog(next, "player", input);
      }
      if (next.setupNotes.length === 1) {
        const classes = [
          "Galaxy class",
          "Intrepid class",
          "Constitution class",
          "Shepard class",
        ];
        const choice = parseChoice(input, next.pendingChoices);
        let className = input;
        if (choice && choice <= 4) className = classes[choice - 1];
        else if (choice === 5) className = "Custom class";
        next.setupNotes = [...next.setupNotes, className];
        // Build ship
        const eraGuess = className.includes("Constitution")
          ? "23rd century"
          : className.includes("Shepard")
            ? "mid-23rd century"
            : "24th century";
        const stardate = className.includes("Constitution")
          ? "2268.1"
          : className.includes("Shepard")
            ? "2259.4"
            : "47600.2";
        next.ship = {
          id: randomUUID(),
          name: next.setupNotes[0],
          className,
          era: eraGuess,
          stardate,
          description: `Custom ${className} under your command.`,
          capabilities: ["Warp drive", "Phasers", "Photon torpedoes", "Shields", "Sensors"],
          integrity: 100,
          maxIntegrity: 100,
          systems: {
            shields: "ok",
            torpedoes: "ok",
            warp: "ok",
            communications: "ok",
            sensors: "ok",
            lifeSupport: "ok",
          },
          crew: [
            {
              id: randomUUID(),
              name: "Cmdr. Arel Voss",
              role: "First Officer",
              species: "Human",
              imageUrl: null,
              loyalty: 55,
            },
            {
              id: randomUUID(),
              name: "Lt. Soven",
              role: "Science Officer",
              species: "Vulcan",
              imageUrl: null,
              loyalty: 50,
            },
            {
              id: randomUUID(),
              name: "Lt. Kira Mendez",
              role: "Tactical",
              species: "Human",
              imageUrl: null,
              loyalty: 50,
            },
            {
              id: randomUUID(),
              name: "Lt. Cmdr. Oryn",
              role: "Chief Engineer",
              species: "Tellarite",
              imageUrl: null,
              loyalty: 50,
            },
          ],
          scars: [],
        };
        next.phase = "mission_type";
        next.pendingChoices = numbered([
          "Science — technology and problem-solving",
          "Exploration — discovery and diplomacy",
          "Search & Rescue — find and save those in peril",
          "Battle — starship combat and strategy",
          "Expanded — complex multi-skill Hardcore scenario",
        ]);
        next.pendingQuestion = `The ${next.ship.name} (${className}, stardate ${stardate}) is ready. Crew stands by. What mission type?`;
        return pushLog(next, "player", input);
      }
      return next;
    }

    case "mission_type": {
      const map: Record<number, MissionType> = {
        1: "science",
        2: "exploration",
        3: "search_rescue",
        4: "battle",
        5: "expanded",
      };
      const choice = parseChoice(input, next.pendingChoices);
      if (!choice || !map[choice]) {
        next.pendingQuestion = "Select a mission type by number.";
        return next;
      }
      next.missionType = map[choice];
      if (next.missionType === "expanded") {
        next.difficulty = "hardcore";
        next = await offerMissions(next);
      } else {
        next.phase = "difficulty";
        next.pendingQuestion = "Select difficulty:";
        next.pendingChoices = numbered(["Easy", "Medium", "Hard", "Hardcore"]);
      }
      return pushLog(next, "player", input);
    }

    case "difficulty": {
      const map: Record<number, Difficulty> = {
        1: "easy",
        2: "medium",
        3: "hard",
        4: "hardcore",
      };
      const choice = parseChoice(input, next.pendingChoices);
      if (!choice || !map[choice]) {
        next.pendingQuestion = "Select difficulty 1–4.";
        return next;
      }
      next.difficulty = map[choice];
      next = await offerMissions(next);
      return pushLog(next, "player", input);
    }

    case "mission_offer": {
      if (/more/i.test(input)) {
        next = await offerMissions(next, true);
        return pushLog(next, "player", input);
      }
      const choice = parseChoice(input, next.pendingChoices);
      const offers = next.missionOffers || [];
      if (!choice || choice < 1 || choice > offers.length) {
        next.pendingQuestion =
          "Select a mission by number, or type 'more' for new options.";
        return next;
      }
      const pick = offers[choice - 1];
      const seed = findSeed(pick.type, pick.title);
      const mission = buildMission(pick, seed, next.difficulty || "medium");
      next.mission = mission;
      next.phase = "mission_brief";
      next.pendingQuestion = formatBrief(next);
      next.pendingChoices = numbered([
        "Accept mission and take the bridge",
        "Return to mission list",
      ]);
      return pushLog(next, "player", input);
    }

    case "mission_brief": {
      const choice = parseChoice(input, next.pendingChoices);
      if (choice === 2) {
        next = await offerMissions(next);
        return pushLog(next, "player", input);
      }
      if (choice === 1) {
        next = startPlaying(next);
        return pushLog(next, "player", input);
      }
      next.pendingQuestion = "Select 1 to begin or 2 to return to the list.";
      return next;
    }

    case "playing": {
      // Handled by orchestrator play path
      return next;
    }

    case "debrief":
    case "post_mission": {
      const choice = parseChoice(input, next.pendingChoices);
      if (choice === 1 || /new mission/i.test(input)) {
        next.mission = null;
        next.turn = null;
        next.debrief = null;
        next.missionOffers = null;
        next.phase = "mission_type";
        next.status = "active";
        next.pendingQuestion = `Captain ${next.playerName}, what manner of mission next?`;
        next.pendingChoices = numbered([
          "Science",
          "Exploration",
          "Search & Rescue",
          "Battle",
          "Expanded (Hardcore)",
        ]);
        // Repair ship partially between missions for Phase 1
        if (next.ship) {
          next.ship = {
            ...next.ship,
            integrity: Math.min(
              next.ship.maxIntegrity,
              next.ship.integrity + 25
            ),
          };
        }
      }
      return pushLog(next, "player", input);
    }

    default:
      return next;
  }
}

async function goShipSelect(state: GameState): Promise<GameState> {
  const ships = await loadStockShips();
  const choices = [
    ...ships.map((s) => `${s.name} — ${s.className} (${s.era})`),
    "Create a custom ship",
  ];
  return {
    ...state,
    phase: "ship_select",
    pendingQuestion: `Select your command vessel:\n\n${shipChoicesText(ships)}\n\n${
      ships.length + 1
    }. Create a custom ship`,
    pendingChoices: numbered(choices),
  };
}

async function offerMissions(state: GameState, reshuffle = false): Promise<GameState> {
  const type = state.missionType || "exploration";
  const seeds = MISSION_SEEDS[type];
  const shuffled = [...seeds].sort(() => Math.random() - 0.5).slice(0, 3);
  const offers = shuffled.map((s) => ({
    id: randomUUID(),
    title: s.title,
    summary: s.summary,
    type,
  }));
  const text = offers
    .map((o, i) => `${i + 1}. ${o.title}\n   ${o.summary}`)
    .join("\n\n");
  return {
    ...state,
    phase: "mission_offer",
    missionOffers: offers,
    pendingQuestion: `${reshuffle ? "New options:\n\n" : ""}${text}\n\nSelect 1–3, or type "more" for different missions.`,
    pendingChoices: numbered(offers.map((o) => o.title)),
  };
}

function findSeed(type: MissionType, title: string) {
  return (
    MISSION_SEEDS[type].find((s) => s.title === title) || MISSION_SEEDS[type][0]
  );
}

function buildMission(
  pick: { id: string; title: string; summary: string; type: MissionType },
  seed: (typeof MISSION_SEEDS)["science"][0],
  difficulty: Difficulty
): Mission {
  return {
    id: pick.id,
    title: pick.title,
    type: pick.type,
    difficulty,
    background: seed.summary,
    brief: seed.summary,
    location: seed.location,
    status: "active",
    knownIntel: [seed.summary],
    flags: [],
    objectives: [
      {
        id: "main",
        title: seed.main,
        description: seed.main,
        kind: "main",
        status: "active",
      },
      ...seed.secondaries.map((s, i) => ({
        id: `sec-${i + 1}`,
        title: s,
        description: s,
        kind: "secondary" as const,
        status: "active" as const,
      })),
    ],
  };
}

function formatBrief(state: GameState): string {
  const m = state.mission!;
  const ship = state.ship!;
  const objs = m.objectives
    .map((o) => `- (${o.kind}) ${o.title}`)
    .join("\n");
  return [
    `Mission Brief — ${m.title}`,
    `Stardate ${ship.stardate} | ${ship.name}`,
    "",
    m.background,
    "",
    "Objectives:",
    objs,
    "",
    `Ship status: integrity ${ship.integrity}/${ship.maxIntegrity}, systems nominal.`,
    "",
    "Accept this mission?",
  ].join("\n");
}

function startPlaying(state: GameState): GameState {
  const ship = state.ship!;
  const mission = state.mission!;
  const xo = ship.crew[0];
  const tactical = ship.crew.find((c) => /tactical|security|armory/i.test(c.role)) || ship.crew[1];

  const narration = [
    `Captain's Log, Stardate ${ship.stardate}.`,
    `We have arrived at ${mission.location}. ${mission.background}`,
    `Our primary objective: ${mission.objectives[0]?.title}.`,
    "The crew is at readiness. I must choose our first action carefully.",
  ].join(" ");

  const options = numbered([
    "Run a full sensor sweep and hold position",
    "Open hailing frequencies and attempt diplomatic contact",
    "Launch a probe toward the anomaly / target",
    "Raise shields and approach at full impulse",
  ]);
  // Mark last as trap-ish
  options[3].risk = "trap";
  options[2].risk = "medium";
  options[0].risk = "low";
  options[1].risk = "medium";

  return {
    ...state,
    phase: "playing",
    pendingQuestion: narration,
    pendingChoices: options,
    turn: {
      sceneId: randomUUID(),
      narration,
      crewDialogue: [
        {
          speaker: xo?.name || "First Officer",
          line: "All departments report ready, Captain. Awaiting your orders.",
        },
        {
          speaker: tactical?.name || "Tactical",
          line: "I recommend caution until we understand the local threat picture.",
        },
      ],
      options,
      viewscreenPrompt: `Star Trek style bridge viewscreen, ${mission.location}, cinematic, ${ship.name}`,
    },
  };
}

export async function resolvePlayTurn(
  state: GameState,
  playerText: string
): Promise<GameState> {
  const input = playerText.trim();
  const choice = parseChoice(input, state.turn?.options || state.pendingChoices);
  if (!choice) {
    return {
      ...state,
      pendingQuestion:
        "You may select only one numbered option. Please choose a single course of action.",
    };
  }

  const option = (state.turn?.options || []).find((o) => o.id === choice);
  let next = pushLog(state, "player", option?.text || input);

  // Mechanical resolution without LLM for Phase 1 reliability
  const risk = option?.risk || "medium";
  let narration = "";
  let integrityDelta = 0;
  let flag: string | null = null;
  let completeMain = false;

  if (risk === "low") {
    narration = `Sensors paint a clearer picture. ${next.mission?.knownIntel[0] || "The situation stabilizes slightly."} Your measured approach buys the crew time.`;
    next.mission = next.mission
      ? {
          ...next.mission,
          knownIntel: [
            ...next.mission.knownIntel,
            "Detailed sensor map acquired",
          ],
        }
      : next.mission;
  } else if (risk === "medium") {
    // light dice
    const { toolRollD20 } = await import("../tools/registry.js");
    const roll = toolRollD20(next, option?.text || "action", 0);
    if (roll.state) next = roll.state;
    const success = roll.data?.success;
    narration = success
      ? `Your order succeeds. The crew executes with precision. Progress toward the objective is real.`
      : `The attempt falters. ${next.ship?.crew[0]?.name || "Your first officer"} reports complications — recoverable, but costly in time.`;
    if (!success) integrityDelta = 5;
  } else if (risk === "high") {
    const { toolRollD20 } = await import("../tools/registry.js");
    const roll = toolRollD20(next, option?.text || "high-risk action", 2);
    if (roll.state) next = roll.state;
    const success = roll.data?.success;
    const critical = roll.data?.critical;
    if (critical === "success") {
      narration =
        "A brilliant maneuver! Critical success — the crew will speak of this for years.";
      completeMain = Math.random() > 0.4;
    } else if (critical === "failure") {
      narration =
        "Critical failure. Alarms cascade across the bridge. The ship shudders under the consequences of boldness unchecked.";
      integrityDelta = 25;
      flag = "critical_failure_event";
      const { toolSetSystem } = await import("../tools/registry.js");
      const sys = toolSetSystem(next, "shields", "damaged");
      if (sys.state) next = sys.state;
    } else if (success) {
      narration = "High risk, hard won. You advance the mission under fire.";
      completeMain = Math.random() > 0.6;
    } else {
      narration = "The gamble fails. Systems strain; options narrow.";
      integrityDelta = 15;
    }
  } else {
    // trap
    const { toolRollD20 } = await import("../tools/registry.js");
    const roll = toolRollD20(next, "dangerous impulse action", 3);
    if (roll.state) next = roll.state;
    narration =
      "That course proves perilous. What seemed decisive becomes a snare — the enemy, the anomaly, or simple physics answers harshly.";
    integrityDelta = roll.data?.success ? 10 : 20;
    flag = "chose_trap_option";
  }

  if (integrityDelta > 0) {
    const { toolUpdateIntegrity } = await import("../tools/registry.js");
    const dmg = toolUpdateIntegrity(next, integrityDelta, narration.slice(0, 80));
    if (dmg.state) next = dmg.state;
  }
  if (flag && next.mission) {
    next.mission = {
      ...next.mission,
      flags: [...new Set([...next.mission.flags, flag])],
    };
  }

  // Progress / end conditions
  if (next.phase === "debrief") {
    next.debrief = buildDebrief(next, false);
    next.pendingQuestion = next.debrief;
    next.pendingChoices = numbered(["New mission", "Remain on debrief"]);
    return pushLog(next, "debrief", next.debrief);
  }

  // Simple mission length: after several player actions or main complete
  const playTurns = next.log.filter((l) => l.kind === "player" && l.phase === "playing").length;
  if (completeMain || playTurns >= 5) {
    if (next.mission) {
      next.mission = {
        ...next.mission,
        status: "success",
        objectives: next.mission.objectives.map((o) =>
          o.kind === "main" ? { ...o, status: "completed" } : o
        ),
      };
    }
    next.phase = "debrief";
    next.status = "completed";
    next.debrief = buildDebrief(next, true);
    next.pendingQuestion = next.debrief;
    next.pendingChoices = numbered(["New mission", "Remain on debrief"]);
    next.turn = {
      sceneId: randomUUID(),
      narration: next.debrief,
      crewDialogue: [
        {
          speaker: next.ship?.crew[0]?.name || "First Officer",
          line: "Mission archived, Captain. The crew awaits your next command.",
        },
      ],
      options: next.pendingChoices,
      viewscreenPrompt: "Quiet stars from orbit after a hard-fought mission",
    };
    return pushLog(next, "debrief", next.debrief);
  }

  // Next scene
  const options = numbered([
    "Hold and reassess with a senior staff briefing",
    "Commit to the primary objective with a focused plan",
    "Divert to a secondary objective that just became visible",
    "Force the issue with an aggressive play",
  ]);
  options[0].risk = "low";
  options[1].risk = "medium";
  options[2].risk = "medium";
  options[3].risk = "trap";

  const crewName = next.ship?.crew[Math.floor(Math.random() * (next.ship.crew.length || 1))]?.name;

  next.turn = {
    sceneId: randomUUID(),
    narration,
    crewDialogue: crewName
      ? [
          {
            speaker: crewName,
            line: "Your orders, Captain?",
          },
        ]
      : [],
    options,
    viewscreenPrompt: `${next.mission?.location || "deep space"}, tension rising, starship bridge viewscreen`,
    lastRoll: next.turn?.lastRoll,
  };
  next.pendingQuestion = narration;
  next.pendingChoices = options;
  next = pushLog(next, "narration", narration);
  return next;
}

function buildDebrief(state: GameState, success: boolean): string {
  const ship = state.ship;
  const mission = state.mission;
  const objs =
    mission?.objectives
      .map((o) => `- [${o.status}] ${o.title}`)
      .join("\n") || "n/a";
  return [
    success ? "=== Mission Complete ===" : "=== Mission Failed ===",
    mission ? `Mission: ${mission.title}` : "",
    ship ? `Ship: ${ship.name} — integrity ${ship.integrity}/${ship.maxIntegrity}` : "",
    ship?.scars.length ? `Damage log: ${ship.scars.join("; ")}` : "Damage log: none recorded",
    "",
    "Objectives:",
    objs,
    "",
    "Narrative:",
    success
      ? `Captain ${state.playerName} navigated peril with the crew of the ${ship?.name}. Not every choice was gentle, but the core objective was secured. The stars remain uncaring — and still worth the voyage.`
      : `Captain ${state.playerName}, the ${ship?.name} paid a heavy price. Study this debrief. Failure is a teacher; the next mission need not rhyme with this one.`,
    "",
    "Select an option to continue.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseChoice(
  input: string,
  choices: TurnOption[] | null | undefined
): number | null {
  const m = input.match(/^(\d+)\b/);
  if (m) {
    const n = Number(m[1]);
    if (!choices || choices.some((c) => c.id === n)) return n;
    if (!choices) return n;
  }
  // match full option text
  if (choices) {
    const found = choices.find(
      (c) => c.text.toLowerCase() === input.toLowerCase()
    );
    if (found) return found.id;
  }
  return null;
}

/** Optional LLM enrichment when XAI_API_KEY is set */
export async function enrichNarrationWithXai(
  state: GameState,
  baseNarration: string
): Promise<string> {
  const key = process.env.XAI_API_KEY;
  if (!key) return baseNarration;

  try {
    const skills = await loadSkillPacks();
    const client = new OpenAI({
      apiKey: key,
      baseURL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    });
    const model = process.env.XAI_MODEL || "grok-4.5";
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `${skills}\n\nRewrite the mission beat in Picard-like Narrotator voice. Keep facts identical. 2-4 short paragraphs max. No options list.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            player: state.playerName,
            ship: state.ship?.name,
            stardate: state.ship?.stardate,
            mission: state.mission?.title,
            integrity: state.ship?.integrity,
            flags: state.mission?.flags,
            baseNarration,
          }),
        },
      ],
      temperature: 0.8,
    });
    return response.choices[0]?.message?.content?.trim() || baseNarration;
  } catch (err) {
    console.warn("xAI enrichment failed, using base narration:", err);
    return baseNarration;
  }
}
