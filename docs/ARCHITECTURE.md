# Architecture

## Principle

**Code is the referee. The LLM is the narrator.**

The Gamemaster may describe outcomes and request SFX; only **tools / pure rules** may change dice results, hull, shields, systems, scars, and objective statuses that the referee owns. The model must treat `mechanicalResults` as absolute truth.

Full rules: **[GAME_MECHANICS.md](./GAME_MECHANICS.md)**.

## Layout

```
StarTrek-Adventure/
├── apps/web/                 Bridge UI (vanilla ES modules)
│   ├── js/
│   │   ├── bridge.js         UI state, turns, TTS, panels
│   │   ├── trekSfx.js        TrekCore SFX + narrator sfx[]
│   │   ├── lcarsFx.js        LCARS panel beeps
│   │   └── bridgeAmbient.js  TNG bridge bed loop
│   └── assets/sfx/           Ogg assets (+ README)
├── server/
│   ├── src/agents/           gamemaster, llmGamemaster, setup, viewscreen
│   ├── src/tools/            Mechanical tool registry
│   ├── src/services/         xAI TTS, portraits, Imagine
│   └── src/api/              HTTP routes
├── packages/game-core/       Shared types + pure rules
├── content/skills/           Markdown skill packs loaded into prompts
├── data/users/{emailSlug}/   Per-account isolation
│   ├── saves/                GameState JSON per run
│   ├── profiles/             Campaign profiles
│   └── debug/                JSONL session logs (migrated)
├── data/media/               Portraits / viewscreen / TTS (run UUID paths)
└── docs/                     This folder
```

## Multi-user (email scoping)

Identity comes from **Cloud IAP** (production) or **dev fallbacks** (local). Every game/profile API call after `/api/health` and `/api/ai/status` requires a user. Saves and campaigns live under `data/users/{slug}/` and carry `ownerEmail`. Another account never sees or resumes foreign runs.

## Runtime flow

```
Player action (UI)
  → POST /api/games/:id/action
  → Gamemaster (phase router)
      ├─ setup stages → structured / setupContent LLM
      └─ playing
           ├─ parse option | freeform
           ├─ applyMechanics (dice, shields, systems, flags)
           ├─ llmGamemaster → JSON scene (narration, options, sfx, …)
           ├─ applySceneSideEffects + endMission clamps
           └─ save GameState
  → PublicGameView to client
  → bridge.js render
      ├─ typewriter + options
      ├─ ship/crew/objectives panels
      ├─ playStateDeltaSfx + playNarratorSfx(turn.sfx)
      ├─ autoSpeakBeat (Grok TTS)
      └─ viewscreen playlist (Imagine frames)
```

## Agents & services

| Component | Role |
|-----------|------|
| **Gamemaster** (`gamemaster.ts`) | Phase machine, play turn referee, mission end |
| **LLM Gamemaster** (`llmGamemaster.ts`) | Play scenes via xAI chat completions |
| **Setup content** | Ships, missions, tutorial beats, greetings |
| **ViewscreenAgent** | Journey-book stills from locked visual bibles |
| **Voice identity** | Locked `voiceId` + prompts for Narrator & crew |
| **TTS service** | Grok speech for narration / crew lines |
| **Portraits** | Crew image generation during init |

**Note:** New games require a healthy xAI connection (`/api/ai/status`). There is no mock play-turn narrator for active missions.

### Play turn pipeline

1. Player picks a numbered option **or** free-text order/question  
2. **Code referee** runs `applyMechanics` (unless pure question)  
3. **LLM** receives state snapshot + `mechanicalResults` → JSON scene  
4. Code applies `newIntel`, `setFlags`, `objectiveUpdates`; clamps `endMission`  
5. Client plays mechanics SFX, **narrator `sfx[]`**, TTS, viewscreen updates  
6. Debug log records user, tools, and LLM previews  

## Tools (mechanical)

| Tool | Effect |
|------|--------|
| `roll_d20` | Roll vs difficulty + actionModifier; stores `lastRoll` |
| `update_ship_integrity` | `applyCombatDamage` (shields-first, scars, hull-zero fail) |
| `set_system_status` | Force system ok/damaged/destroyed |
| `divert_power_to_shields` | Recharge / boost shield grid |
| `set_objective_status` | Objective status changes |
| `set_mission_flag` | Long-term flags |
| `get_mission_status` | Status text for meta |
| `give_hint` | Blocked on hardcore |
| `change_difficulty` / `restart_mission` / `new_mission` | Meta flow |
| `toolApplyCrewDeath` | KIA: skills, scar, `crew_loss_<role>` flag; last living officer → injury |
| `toolSetCrewStatus` | `active` / `injured` / `dead` / `transferred` |
| `toolTickCrewService` | Service clocks + injury recovery each mechanical beat |

Pure rules live in `packages/game-core/src/rules.ts` (dice, combat, recharge, constraints).

## Client audio

| Module | Responsibility |
|--------|----------------|
| `bridgeAmbient.js` | Looping TNG bridge bed; ducks under speech |
| `lcarsFx.js` | LCARS theme panel beeps (LCARS theme only) |
| `trekSfx.js` | TrekCore catalog: orders, combat deltas, UI, **narrator sfx[]**, red-alert loop |

Toggle: Voice ▾ → **LCARS SFX** / **Bridge ambient**. Catalog: `apps/web/assets/sfx/README.md`.

## Narrator-controlled SFX

LLM scenes may include `sfx: string[]` (0–4 cues). Server normalizes aliases → catalog keys; client plays once per `turn.sceneId`. Stacks with keyword + mechanics SFX.

## Extensibility

- New mission types → content / setup prompts  
- New GM behavior → `content/skills/*.md`  
- New mechanical effects → `game-core` rules + tools  
- New audio cues → download asset + catalog entry + optional LLM alias  

## Persistence

Durable campaigns are **profile-centric** (Phase 1), scoped per account:

| What | Path | API |
|------|------|-----|
| Campaign profile | `data/users/{slug}/profiles/{id}.json` | `GET/POST /api/profiles`, `GET/DELETE /api/profiles/:id`, `POST /api/profiles/:id/continue` |
| Mid-mission run | `data/users/{slug}/saves/{runId}.json` | `GET /api/games`, `POST /api/games/:id/action` |

`updateProfileFromRun` merges ship, living crew, skills, and universe into the profile on debrief (and appends `campaignLog`). Continue resumes `activeRunId` if present; otherwise starts the next mission from the profile.

The Campaign modal lists captains/ships first; session runs without a `profileId` are marked legacy.

Debug JSONL lives under `data/users/{slug}/debug/` (legacy flat `data/debug/` may be migrated).
