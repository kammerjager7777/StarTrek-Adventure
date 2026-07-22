# Star Trek Adventure

AI Gamemaster text adventure inspired by Star Trek — D&D-style missions, dice, ship integrity, and a bridge console UI.

**Gamemaster persona:** Narrotator (Picard tone)  
**Phase:** 1 — playable core with extensible agents / skills / tools

## Quick start

```bash
cd ~/Projects/StarTrek-Adventure
npm install
cp .env.example .env   # optional: add XAI_API_KEY for richer narration
npm run dev
```

Open **http://127.0.0.1:3000**

Without an API key, the rules engine + mock mission flow still works end-to-end.

## Project layout

```
StarTrek-Adventure/
├── apps/web/                 # LCARS-inspired bridge UI
├── server/                   # Orchestrator, GM agent, tools, API
├── packages/game-core/       # Shared types + pure rules
├── content/                  # Ships, skill packs, (future missions/rosters)
├── data/saves/               # Persisted runs (gitignored)
└── docs/                     # Design, architecture, roadmap
```

## How to play

1. Enter your captain name  
2. Optional tutorial  
3. Pick a ship (or custom)  
4. Choose mission type + difficulty  
5. Accept a mission and pick **one numbered option** each turn  
6. Meta commands during play: `mission status`, `hint`, `recap`, `change difficulty hard`, `restart`, `new mission`

## Architecture (short)

- **Code is the referee** (dice, integrity, objectives, flags)  
- **LLM is the narrator** (optional xAI enrichment when `XAI_API_KEY` is set)  
- **Skill packs** in `content/skills/` guide GM behavior  
- **Tools** in `server/src/tools/` apply mechanical effects  
- **Saves** every turn → foundation for history / resume  

See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.

## Future phases (planned)

| Phase | Feature |
|---|---|
| 2 | Full history UX + cross-session continuity |
| 3 | **Imagine Agent** — Grok Imagine scene art |
| 4 | Voice mode narration |
| 5 | Custom crew builder + portraits |
| 6 | Attachment / campaign retention systems |

## GitHub

```bash
cd ~/Projects/StarTrek-Adventure
git remote add origin https://github.com/YOUR_USERNAME/StarTrek-Adventure.git
git push -u origin main
```

## License / IP

Personal fan project. Star Trek is a trademark of its owners. For public commercial use, switch content packs to original names/factions.
