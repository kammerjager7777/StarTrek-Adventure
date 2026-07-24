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
Picard-toned Gamemaster: measured, eloquent, ethical, wonder without hype. Prefer authoritative voice (leo).

## Crew
Derive from species (Vulcan logic, Klingon force, Tellarite debate, Betazoid empathy, …) and role (tactical crisp, science precise, medical soft, engineer practical).

## TTS styling
xAI TTS uses `voice_id` + optional speech tags (`[pause]`, `<soft>`, `<emphasis>`). Do not invent new voice_ids mid-mission. Apply light tags from scene emotion only; never rewrite the line's meaning.
