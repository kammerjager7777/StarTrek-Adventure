# Star Trek Adventure — Game Design

Source: original Gamemaster prompt, structured for the application.

> **Full mechanics (dice, shields, systems, end conditions):** **[GAME_MECHANICS.md](./GAME_MECHANICS.md)** — code-aligned reference.  
> **Architecture / agents:** **[ARCHITECTURE.md](./ARCHITECTURE.md)** · **Roadmap:** **[ROADMAP.md](./ROADMAP.md)**

## Pitch

You command a Starfleet starship. An AI Gamemaster — **Narrator** — narrates in language rooted in Jean-Luc Picard, with **intensity that matches the moment** (urgent under fire, warmer in discovery). Missions are D&D-style: scenes, numbered choices, dice, consequences, and real failure.

## Voice

- Role: text-based adventure Gamemaster  
- Persona: Picard-rooted — moral, commanding, clear; **not** the same florid log every turn  
- Address: **Narrator** or **Gamemaster**  
- Fun, interesting, challenging; realistic consequences  
- A game is not a game without failure — always include ways to lose  
- Spoken aloud via Grok TTS when the player enables voice  

## Game stages

1. **Start** — Player name; optional tutorial  
2. **Ship selection** — Era-diverse stock ships, or custom ship  
3. **Starbase (campaign hub)** — Home whenever you are not in a mission. Refit, recruit, campaign log, then **Choose next mission**  
4. **Mission board** — List of assignments (and briefing). Return to starbase, or accept to begin  
5. **Playing** — Captain’s log, crew dialogue, 3–4 options (or free-text), challenges  
6. **End** — Debrief, then back to the starbase hub 

**Continue your story** (History) resumes an in-progress mission, or returns you to the **starbase hub**. The dock is home until you accept a mission from the board. You do not re-pick a captain or vessel.

## How a play turn feels

1. Narrator sets the situation (and may request bridge **SFX** for the moment).  
2. You choose a numbered option **or** type an order/question.  
3. The **referee** resolves dice and ship stress (shields first, then hull/systems).  
4. Narrator describes the outcome using those numbers as truth, then presents new options.  

Questions (“What do sensors show?”) do not burn a combat beat the same way orders do — see mechanics doc.

## Meta commands (during play)

| Command | Effect |
|---------|--------|
| Mission status | Objectives, location, ship hull/shields/systems |
| Hint | Guidance (**unavailable on Hardcore**) |
| Recap | Summary so far |
| Divert power to shields | Mechanical shield boost / faster restart |
| Change difficulty | Adjust d20 threshold mid-run |
| Restart | Restart current mission |
| New mission | Back toward mission selection |
| Enemy / anomaly status | **Known intel only** |

## Rules the code enforces (summary)

- One question at a time during setup  
- Multiple-choice options are numbered; player picks **one** (or free-text)  
- At least one option should lean high-risk / trap  
- d20 for medium+ risks; thresholds by difficulty  
- **Shields absorb external fire first**; boarding/internal can bypass  
- Six subsystems: shields, torpedoes, warp, communications, sensors, life support  
- System **destroyed** blocks related orders; **damaged** makes success harder  
- Hull **0** → mission failure  
- Early LLM win/loss is **clamped** so missions last a real arc  
- Scars record lasting combat damage (not player order text)  

### Dice thresholds (quick)

| Difficulty | Success on | Critical failure |
|------------|------------|------------------|
| Easy | ≥ 5 | 1 |
| Medium | ≥ 10 | 1 |
| Hard | ≥ 15 | 1 |
| Hardcore | ≥ 18 | 1–3 |

Natural **20** = critical success. Action modifiers can raise DCs further.

## Ship systems (examples)

| System | If destroyed / critical |
|--------|-------------------------|
| Shield array | No shield grid; cannot divert |
| Torpedo launcher | No photon/quantum salvos |
| Warp nacelles | No warp / emergency jump |
| Communications | Cannot hail / coordinate |
| Sensors | No scans / weak targeting |
| Life support | Global performance penalties; crisis flags |

## Long-term consequences

Decisions set **flags** (trap choices, critical failures, diplomatic fallout, `red_alert_active`, etc.) that color later scenes and can drive UI/audio (e.g. red-alert bed).

## Campaign progression (player-facing)

Your ship and crew persist between missions.

- **Skills** — Seven ship scores (tactical, science, diplomacy, piloting, engineering, medical, command). Officers add to the total; the Ready Room shows the bars. Strong skills make related orders easier on the dice.
- **Crew** — Officers serve, can be **Injured** or **KIA**, and accrue service time on their cards. Ask a living officer for advice without spending a turn. Hire replacements at starbase.
- **Standing** — Faction reputation and galactic flags shift over time and after missions. Hostile powers yield harsher assignment lists; high Federation standing favors relief and diplomacy.
- **Starbase** — Home when you are not flying a mission. Refit, recruit, read the **campaign log**, then choose the next assignment.
- **Continue** — History resumes a mid-mission beat, or puts you back on the dock with the same ship, living crew, skills, and universe.

Campaigns persist **ship skills**, **living crew**, **faction reputation**, and a **campaign log** of missions.

## Bridge presentation (product)

- **Themes:** Classic or LCARS (LCARS titles share a scan shimmer, including Crew)  
- **Header:** TNG combadge + Star Trek Adventure  
- **Ready Room:** Skill bars and faction standing (right rail, under Objectives). The section hugs its content so Meta can use leftover height. Expanding **Run** shrinks Meta, not Ready Room.  
- **Crew:** Collapse to an equal stacked portrait list (carousel off); expand for the vertical carousel (side dots, one officer per scroll). Hail when opening from the stack or switching officers — not when the open card is clicked again. While that officer’s audio plays (hail, advice, or a mission-log line), the card border flashes purple↔yellow. Injured replaces consult; deceased stamps the card. The player captain is not on the roster.  
- **Scars:** Lasting damage record on the starbase vessel card (not the in-mission panel)  
- **Viewscreen:** Journey-book images; Incoming Communication at mission start  
- **Voice:** Auto-play Narrator + crew (gender-matched locks); per-line replay  
- **Audio:** TNG bridge ambient + TrekCore SFX (orders, combat, narrator cues)  
- **History:** Resume / delete prior runs  
- **Starbase hub:** Full-width LCARS home when not in a mission — campaign log, yard, personnel. **Choose next mission** opens the board (type, difficulty; Expanded locked to Hardcore). Hover a card for the briefing; speaker pip reads it aloud.  

## Related

| Doc | Role |
|-----|------|
| [GAME_MECHANICS.md](./GAME_MECHANICS.md) | Exhaustive rules |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Code structure |
| [ROADMAP.md](./ROADMAP.md) | What’s shipped vs next |
| [../apps/web/assets/sfx/README.md](../apps/web/assets/sfx/README.md) | Sound assets |
