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
- [x] Header: TNG combadge + Star Trek Adventure (same icon as favicon)  
- [x] Mission log typewriter, options bar, Engage, soft errors  
- [x] Ship panel (hull, shields, systems)  
- [x] Starbase vessel card (scars / lasting damage log)  
- [x] Captain’s Ready Room (right rail under Objectives; skill bars + standing)  
- [x] Right rail: Objectives + Ready Room hug content; Meta fills leftover; expanding Run shrinks Meta  
- [x] Crew carousel (stacked portraits when collapsed; dots + one-card-per-scroll when expanded)  
- [x] Crew hail on open/switch; speaking officer border flash (hail, advice, log lines)  
- [x] Injured / deceased shown on the card (consult replaced or whole-card stamp)  
- [x] LCARS scan shimmer on panel titles including Crew  
- [x] Objectives panel with success/failure presentation  
- [x] Collapsible viewscreen + mission history strip  
- [x] Run history modal (resume / delete); in-mission Run panel collapsed by default  
- [x] New Game full-screen init (crew portraits / voice locks)  
- [x] Incoming Communication mission-start presentation  
- [x] Full-width LCARS starbase hub + decorative rails  
- [x] Mission board: type → difficulty (Expanded = Hardcore), hover details, briefing TTS  
- [x] In-app Feedback button (header) → Google Sheet + Drive screenshots  

### Narrator & media

- [x] xAI LLM Gamemaster (required for play)  
- [x] Skill packs in `content/skills/`  
- [x] Campaign-layer skill packs (no invented skills/deaths/reputation; starbase + advice flow)  
- [x] Session debug JSONL  
- [x] Grok TTS (auto-voice, speed, pause/stop, line replay)  
- [x] Locked voice identities (Narrator + crew; gender-matched)  
- [x] Viewscreen journey frames (Imagine) + visual bibles  
- [x] Crew portrait generation  

### Audio

- [x] TNG bridge ambient loop (TrekCore)  
- [x] LCARS interface beeps  
- [x] TrekCore combat / order / UI SFX catalog  
- [x] Red-alert looping bed from crisis state  
- [x] Narrator-authored `sfx[]` on play scenes  

### Campaign layer

- [x] Profile-centric saves (captain / ship / universe)  
- [x] Per-account data isolation (IAP email / ownerEmail + user dirs)  
- [x] Multi-dimensional ship + crew skills with dice modifiers  
- [x] Crew injury / death / service time (KIA badge + Ready Room skills)  
- [x] Loyalty + service progression (basic)  
- [x] Universe stardate + faction reputation ticks  
- [x] “Ask for advice” on crew cards  
- [x] Starbase hub after debrief (skills, crew status, reputation, campaign log)  
- [x] Richer recruitment / refit economy (quality tiers, sickbay, transfers, facility tier)  
- [x] Continue your story → resume mission, or reload the starbase hub  
- [x] LLM skill packs aligned with the referee  
- [x] Captain’s Ready Room (skill bars + standing)  
- [x] Player is the captain (not listed as a bridge officer)  

### Docs

- [x] [GAME_MECHANICS.md](./GAME_MECHANICS.md)  
- [x] [ARCHITECTURE.md](./ARCHITECTURE.md)  
- [x] [GAME_DESIGN.md](./GAME_DESIGN.md)  
- [x] Audio README under `apps/web/assets/sfx/`  

## Next (suggested)

### Continuity & campaigns

- [ ] Multi-mission story arcs with long callbacks  

### Crew & ship identity

- [ ] Deeper crew builder (player-authored rosters)  
- [ ] “Remember when…” callbacks from scars and flags (LLM-side polish)  

### Presentation polish

- [ ] Era-aware SFX packs (TOS vs TNG)  
- [ ] Battle bridge ambient swap under red alert  
- [ ] Richer debrief stats (lives saved, casualties) when data exists  
- [ ] Optional streaming narration  

### Platform

- [ ] Automated playtests in CI  
- [ ] Accessibility pass (keyboard, reduced motion, captions)  

## Explicitly out of scope (fan project)

- Commercial distribution with Paramount IP / TrekCore rips  
- Multiplayer real-time bridge  
