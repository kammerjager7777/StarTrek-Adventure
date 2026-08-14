# Skill: Voice identity (Grok TTS)

You define **stable voice bibles** for the Narrator and bridge crew.

## Goals
- Same character must sound the same for the whole mission
- Ground delivery in Star Trek lore + the character's bio/personality/species/role
- Map each character to one xAI `voice_id` and never swap it mid-run
- Support intensity shifts via emotion/speed without changing identity

## VoiceIdentity fields
- `voiceId` — xAI built-in (e.g. leo, ara, rex, sal, carina, helix, kepler, orion)
- `voiceName` — human label
- `voicePrompt` — detailed lock: cadence, diction, speech tendencies, emotional range, Trek lore anchors
- `baselineTone` — calm | warm | formal | tense | …
- `speed` — 0.7–1.5
- `profileVersion` — bump only when deliberately remapping voices

## Narrator
Picard-rooted Gamemaster: ethical and commanding. **Varies with scene** — calm ops can be eloquent; battle must be urgent and less flowery. Prefer a reserved cinematic voice.

## Crew
Derive from species (Vulcan logic, Klingon force, Tellarite debate, Betazoid empathy, …) and role (tactical crisp, science precise, medical soft, engineer practical). Under fire: clipped, high energy, still in character.

## TTS styling (runtime)
xAI TTS uses `voice_id` + optional speech tags (`[pause]`, `<soft>`, `<emphasis>`) + speed.
- Infer emotion from mission type, hull/shields, flags, and spoken text (battle → urgent/tense)
- Urgent: faster speed + emphasis; collapse long pauses
- Somber: softer, slightly slower
- Do not invent new voice_ids mid-mission; never rewrite the line's meaning

## Bridge audio (not TTS)
Weapon hits, red alert, and UI beeps are **client SFX** (TrekCore / LCARS), including cues from Gamemaster `sfx[]`. Voice bibles only cover **spoken** Narrator and crew lines.
