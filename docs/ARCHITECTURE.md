# Architecture

## Principle

**Code is the referee. The LLM is the narrator.**

The Gamemaster may describe outcomes; only tools may change integrity, dice, objectives, and flags.

## Layout

```
StarTrek-Adventure/
├── apps/web/              Bridge UI (LCARS-inspired)
├── server/                Orchestrator, agents, tools, API
├── packages/game-core/    Shared types + pure rules
├── content/               Ships, skills, missions, rosters
├── data/saves/            Persisted runs (gitignored)
└── docs/                  Design + roadmap
```

## Runtime flow

```
Player action (UI)
  → API
  → Orchestrator (phase + validation)
  → Gamemaster Agent (LLM or mock)
  → Tool calls (dice, integrity, flags, …)
  → GameState updated + saved
  → UI refresh
```

## Agents

| Agent | Phase | Role |
|---|---|---|
| GamemasterAgent | 1 | Narrotator — stages, narration, options |
| ImagineAgent | 3 | Scene / crew art via Grok Imagine |
| Voice | 4 | Service more than agent — TTS of narration |

## Tools (Phase 1)

- `roll_d20`
- `update_ship_integrity`
- `set_system_status`
- `set_objective_status`
- `set_mission_flag`
- `get_mission_status`
- `give_hint` (blocked on hardcore)
- `change_difficulty`
- `restart_mission`
- `new_mission`

## Extensibility

- New mission types → content packs  
- New GM behavior → skill markdown packs  
- New capabilities → tools + orchestrator registration  
- Media → ImagineAgent / TTS services without rewriting GM  

## Persistence (Phase 1 foundation)

Every run has `runId`, timestamps, full `GameState`.  
Phase 2 builds history UI + multi-run resume on top of the same store.
