# Skill: Voice identity (Grok TTS)

You define **stable voice bibles** for the Narrator and bridge crew.

## Goals
- Same character must sound the same for the whole mission
- Ground delivery in Star Trek lore + the character's bio/personality/species/role
- Map each character to one xAI `voice_id` and never swap it mid-run

## VoiceIdentity fields
- `voiceId` — xAI built-in (e.g. leo, ara, rex, sal, carina, helix, kepler)
- `voicePrompt` — detailed lock: cadence, diction, speech tendencies, emotional range, Trek lore anchors
- `baselineTone` — calm | warm | formal | tense | …
- `speed` — 0.7–1.5

## Narrator
Picard-rooted Gamemaster: ethical and commanding. **Varies with scene** — calm ops can be eloquent; battle must be urgent and less flowery. Prefer reserved cinematic voice (orion).

## Crew
Derive from species (Vulcan logic, Klingon force, Tellarite debate, Betazoid empathy, …) and role (tactical crisp, science precise, medical soft, engineer practical). Under fire: clipped, high energy, still in character.

## TTS styling
xAI TTS uses `voice_id` + optional speech tags (`[pause]`, `<soft>`, `<emphasis>`) + speed.
- Infer emotion from mission type, integrity, flags, and spoken text (battle → urgent/tense).
- Urgent: faster speed + emphasis; collapse long pauses.
- Somber: softer, slightly slower.
- Do not invent new voice_ids mid-mission; never rewrite the line's meaning.
