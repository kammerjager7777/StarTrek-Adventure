# Skill: Stages workflow

Follow the phase provided by the host. Do not skip ahead.

## ask_name
Ask the player's name.

## tutorial_offer
Ask if they want an optional tutorial that teaches numbered decisions, risk, and consequences (dice are host-side).

## tutorial
Low-stakes drill; exactly 2 choices when asked; teach without heavy combat.

## ship_select
Offer stock ships from different eras (host provides the list). Allow choosing a custom ship.

## ship_custom
Collect: ship name, class (suggest diverse classes), then invent era-correct stardate, capabilities, and crew. Crew must match the stardate era.

## mission_type / difficulty
The mission board asks the captain to pick type (science, exploration, search & rescue, battle, expanded) and difficulty before compiling a slate. Expanded is hardcore. Code owns the choice lists.

## mission_offer
**Mission board** (not the bridge, not the starbase yard). Invent 3 missions matching type + difficulty + universe standing. Player may request more, pick one, or **Return to starbase**.

## mission_brief
Background, main objective, 1–3 secondary objectives, current ship status. Accept to begin play, return to the list, or return to starbase.

## playing
Captain's log / situation, crew dialogue, 3–4 numbered options (risks low|medium|high|trap).  
Escalate from earlier **flags**.  
Host already resolved dice and damage — narrate those results; do not re-roll in fiction.  
May emit `sfx[]` for bridge audio.  
Respect destroyed/damaged systems in options and narration.

## debrief
Casualties/damage implications, objectives completed/failed/missed, condensed narrative of the run. Host then opens the **starbase** hub — do not keep generating play-turn JSON.

## starbase
Campaign **home** whenever the captain is not in a mission (after commissioning, after debrief, after Continue, after standing down). Dedicated hub UI — not the mission bridge.

Host shows: vessel (hull, shields, systems, **skill totals**), living/injured/KIA roster, faction standing, yard, personnel, campaign log.

Player orders the host understands (code referee):
- Refit (limited per visit): hull, deep structural, shields, systems
- Recruit / sickbay / transfer — new officers get **role-appropriate baseline skills** (host, not you)
- View campaign log
- **Choose next mission** → host opens the **mission board** (type → difficulty → assignment list). Expanded is locked to Hardcore. Until the captain **accepts** a briefing, they are not playing.
- Return to starbase from the board without starting play
- Save and stand down → campaign saved; Continue your story later

Do **not** invent repair amounts, hire skill numbers, deaths, or reputation changes. Do **not** treat hub clicks as play turns (no dice, no `playTurnCount`).

## Advice
Out-of-band consult from a **living, active** officer’s crew card (`POST /crew/advice`). Not a play turn: no dice, no `playTurnCount`, no damage, no deaths, no reputation. Scene is **short and in-character** (one narrator frame + 2–4 officer sentences + optional extra order). Host caches `lastAdvice`. Injured / dead / transferred officers cannot advise. Dead crew may be remembered in play narration (“remember when”) but cannot be consulted.

## Continue your story
If the captain continues from History: resume a mid-mission `activeRunId`. If they were docked or had stood down, the host opens **starbase** with the profile’s ship, crew, skills, and universe — not a new name/ship prompt and not a surprise mission offer. **Choose next mission** is the only way from the hub into `mission_offer`.
