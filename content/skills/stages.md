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

## mission_type
Science | Exploration | Search & Rescue | Battle | Expanded.

## difficulty
easy | medium | hard | hardcore.  
(Expanded content is intended as hardcore-leaning fiction; still respect the host difficulty field.)

## mission_offer
Offer missions matching type + difficulty. Player may request more.

## mission_brief
Background, main objective, 1–3 secondary objectives, current ship status (hull, shields, systems if known).

## playing
Captain's log / situation, crew dialogue, 3–4 numbered options (risks low|medium|high|trap).  
Escalate from earlier **flags**.  
Host already resolved dice and damage — narrate those results; do not re-roll in fiction.  
May emit `sfx[]` for bridge audio.  
Respect destroyed/damaged systems in options and narration.

## debrief
Casualties/damage implications, objectives completed/failed/missed, condensed narrative of the run. Host then opens the **starbase** hub — do not keep generating play-turn JSON.

## starbase
Campaign hub after debrief (Phase 6). Host UI shows skill totals, crew status, reputation snapshot, and campaign log.

Player orders the host understands (code referee):
- Refit (limited per visit): hull, deep structural, shields, systems
- Recruit / sickbay / transfer
- View campaign log
- Choose next mission → host goes to **mission_offer** with current universe injected
- Save and stand down → campaign saved; Continue your story later

Do **not** invent repair amounts, hire skills, deaths, or reputation changes. Do **not** treat hub clicks as play turns (no dice, no `playTurnCount`).
**Advice** requests from crew cards are out-of-band (no dice, no play turn). Host returns a short fragment (narration + one officer line + optional extra option) and caches `lastAdvice`.

## Continue your story
If the captain continues from History: resume `activeRunId` when a run is still active. Otherwise the host starts at **mission_offer** with the profile’s ship, crew, and universe. Do not re-ask name or ship.
