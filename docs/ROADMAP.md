# Roadmap

Status reflects the **current codebase** (playable bridge + LLM referee/narrator split).

## Shipped

### Core loop

- [x] Repo scaffold: agents / tools / skills / content  
- [x] Game design encoded from original GM prompt  
- [x] State machine for all stages (name → ship → mission → play → debrief)  
- [x] Rules: d20, **shields-first combat**, systems, scars, objectives, meta-commands  
- [x] Play-turn clamps (no instant win/loss; hull-zero fail)  
- [x] Persist `GameState` each turn  
- [x] Free-text questions vs orders  
- [x] Divert power to shields + shield recharge ticks  

### Bridge UI

- [x] Classic + LCARS themes  
- [x] Mission log typewriter, options bar, Engage, soft errors  
- [x] Ship panel (hull, shields, systems, scars)  
- [x] Crew cards + expand hail  
- [x] Objectives panel with success/failure presentation  
- [x] Collapsible viewscreen + mission history strip  
- [x] Run history modal (resume / delete)  
- [x] New Game full-screen init (crew portraits / voice locks)  
- [x] Incoming Communication mission-start presentation  

### Narrator & media

- [x] xAI LLM Gamemaster (required for play)  
- [x] Skill packs in `content/skills/`  
- [x] Session debug JSONL  
- [x] Grok TTS (auto-voice, speed, pause/stop, line replay)  
- [x] Locked voice identities (Narrator + crew)  
- [x] Viewscreen journey frames (Imagine) + visual bibles  
- [x] Crew portrait generation  

### Audio

- [x] TNG bridge ambient loop (TrekCore)  
- [x] LCARS interface beeps  
- [x] TrekCore combat / order / UI SFX catalog  
- [x] Red-alert looping bed from crisis state  
- [x] Narrator-authored `sfx[]` on play scenes  

### Docs

- [x] [GAME_MECHANICS.md](./GAME_MECHANICS.md)  
- [x] [ARCHITECTURE.md](./ARCHITECTURE.md)  
- [x] [GAME_DESIGN.md](./GAME_DESIGN.md)  
- [x] Audio README under `apps/web/assets/sfx/`  

## Next (suggested)

### Continuity & campaigns

- [x] Profile-centric saves (captain / ship / universe)  
- [x] Multi-dimensional ship + crew skills with dice modifiers  
- [x] Crew injury / death / service time  
- [x] Universe stardate + faction reputation ticks  
- [x] “Ask for advice” on crew cards  
- [x] Starbase hub after debrief  
- [x] Richer recruitment / refit economy (quality tiers, sickbay, transfers, facility tier)  
- [ ] Multi-mission story arcs with long callbacks  

### Crew & ship identity

- [x] Loyalty + service progression (basic)  
- [ ] Deeper crew builder (player-authored rosters)  
- [ ] “Remember when…” callbacks from scars and flags (LLM-side polish)  

### Presentation polish

- [ ] Era-aware SFX packs (TOS vs TNG)  
- [ ] Battle bridge ambient swap under red alert  
- [ ] Richer debrief stats (lives saved, casualties) when data exists  
- [ ] Optional streaming narration  

### Platform

- [x] Per-account data isolation (IAP email / ownerEmail + user dirs)  
- [ ] Automated playtests in CI  
- [ ] Accessibility pass (keyboard, reduced motion, captions)  

## Explicitly out of scope (fan project)

- Commercial distribution with Paramount IP / TrekCore rips  
- Multiplayer real-time bridge  
