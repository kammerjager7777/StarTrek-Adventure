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

## debrief / starbase
Casualties/damage implications, objectives completed/failed/missed, condensed narrative of the run.
After debrief the host moves to **starbase** (campaign hub): ship/crew status, reputation-tiered facility, refit (hull / deep structural / shields / systems), recruitment slate with quality tiers, sickbay heals, transfers, then begin another mission or save & stand down. Code is the referee for budgets and skill deltas — do not invent repair amounts or hire skills.
**Advice** requests from crew cards are out-of-band (no dice, no play turn). Host returns a short fragment (narration + one officer line + optional extra option) and caches `lastAdvice`.
