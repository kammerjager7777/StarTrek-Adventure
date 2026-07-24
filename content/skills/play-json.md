# Skill: Play-turn JSON output

When generating a **playing** scene, respond with **JSON only** (no markdown fences).

Schema:

```json
{
  "narration": "2-5 short paragraphs (or fewer in battle). Picard-rooted Narrator — MATCH INTENSITY. Battle = urgent, short, less flowery. Calm = measured. Reflect dice/integrity exactly.",
  "crewDialogue": [
    { "speaker": "Crew name from roster", "line": "In-character line — same intensity as narration (clipped in combat, calmer in science)" }
  ],
  "options": [
    { "id": 1, "text": "Short actionable order", "risk": "low" },
    { "id": 2, "text": "...", "risk": "medium" },
    { "id": 3, "text": "...", "risk": "high" },
    { "id": 4, "text": "...", "risk": "trap" }
  ],
  "viewscreenPrompt": "One cinematic sentence for a future image agent",
  "newIntel": ["Optional facts the ship just learned"],
  "setFlags": ["optional_snake_case_flags"],
  "objectiveUpdates": [
    { "id": "main", "status": "active|completed|failed|missed" }
  ],
  "endMission": null
}
```

## Rules
- Exactly 3 or 4 options; ids 1..n sequential
- At least one option must be `high` or `trap`
- Options must fit the **current** ship systems (no torpedoes if launcher destroyed, no warp if nacelles destroyed, etc.)
- `endMission` is `null`, `"success"`, or `"failed"`
- **Default `endMission` to `null`.** Do **not** end the mission after only a few turns.
- Set `endMission: "success"` only when the **main objective is clearly achieved** in the fiction after a full arc of play (multiple meaningful turns, rising stakes, resolution).
- Set `endMission: "failed"` only when the main objective is truly impossible (ship crippled, objective lost, catastrophic failure) — not merely because one action failed.
- A partial success (e.g. frigates still fighting, enemy still present) means `endMission: null` and keep playing.
- Never invent dice numbers; use `mechanicalResults` from the host
- Use real crew names from the ship roster when possible
- Keep narration TTS-friendly (no tables, no bullet lists of options in narration)
- Do **not** include raw d20 numbers in narration or crew dialogue
- **Tone:** never stay in florid captain's-log mode during red alert, weapons fire, boarding, or critical damage — tighten prose and raise energy
- Crew dialogue must feel like the same moment (tactical under fire ≠ leisurely banter)
