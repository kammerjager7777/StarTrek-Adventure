# Skill: Play-turn JSON output

When generating a **playing** scene, respond with **JSON only** (no markdown fences).

Schema:

```json
{
  "narration": "1–3 short paragraphs (or fewer in battle). Picard-rooted Narrator — MATCH INTENSITY. Battle = urgent, short, less flowery. Calm = measured. Reflect dice/hull/shields/systems exactly.",
  "crewDialogue": [
    { "speaker": "Crew name from roster", "line": "In-character line — same intensity as narration (clipped in combat, calmer in science)" }
  ],
  "options": [
    { "id": 1, "text": "Short actionable order", "risk": "low" },
    { "id": 2, "text": "...", "risk": "medium" },
    { "id": 3, "text": "...", "risk": "high" },
    { "id": 4, "text": "...", "risk": "trap" }
  ],
  "viewscreenPrompt": "One cinematic sentence for the viewscreen image agent",
  "newIntel": ["Optional facts the ship just learned"],
  "setFlags": ["optional_snake_case_flags"],
  "objectiveUpdates": [
    { "id": "main", "status": "active|completed|failed|missed" }
  ],
  "endMission": null,
  "sfx": ["phaser", "shield_hit"],
  "reputationDeltas": { "klingon": -5, "federation": 2 }
}
```

Optional `reputationDeltas` are **suggestions only** (host clamps ±15). Do not invent skill numbers or crew deaths — host applies those.

**Crew advice** is a separate host path (`POST /crew/advice`), not a play scene. Do not emit an advice consult as a normal playing JSON turn.

## Rules
- Exactly 3 or 4 options; ids 1..n sequential
- At least one option must be `high` or `trap`
- Options must fit the **current** ship systems (no torpedoes if launcher destroyed, no warp if nacelles destroyed, no full sensor sweep if sensors destroyed, no hails if comms destroyed)
- Damaged systems: options may still try, but acknowledge impairment
- `endMission` is `null`, `"success"`, or `"failed"`
- **Default `endMission` to `null`.** Do **not** end the mission after only a few turns
- Set `endMission: "success"` only when the **main objective is clearly achieved** after a full arc (multiple meaningful turns)
- Set `endMission: "failed"` only when the main objective is truly lost or the ship is finished — not merely because one action failed
- Partial progress = `endMission: null` and keep playing
- Never invent dice numbers; use `mechanicalResults` from the host
- Do **not** include raw d20 numbers in narration or crew dialogue
- Use real crew names from the ship roster when possible
- Keep narration TTS-friendly (no tables, no bullet lists of options in narration)
- **Tone:** never stay in florid captain's-log mode during red alert, weapons fire, boarding, or critical damage — tighten prose and raise energy
- Crew dialogue must feel like the same moment (tactical under fire ≠ leisurely banter)

## sfx[] (bridge audio)
- Optional string array, **0–4** cues, played when this scene lands
- Use for events the bridge would **hear** this beat
- Prefer precise cues; use `[]` if nothing distinctive happens
- Do **not** invent names outside the allowlist

**Valid examples:**  
`phaser`, `torpedo`, `quantum_torpedo`, `fire_all`, `shield_hit`, `hull_hit`, `explosion`, `red_alert`, `yellow_alert`, `intruder`, `warp`, `warp_exit`, `transporter`, `tractor`, `cloak`, `decloak`, `hail`, `end_transmission`, `scan`, `probe`, `shields_up`, `shields_down`, `engineering`, `forcefield`, `door`, `medical`, `holodeck`, `klingon`, `romulan`, `borg`, `shields_failing`, `structural`, `damage_alarm`, `critical`, `proximity`, `static`, `viewscreen`

**Guidance:**  
- Weapons fire → `phaser` / `torpedo` / …  
- Hit taken with shields up → `shield_hit` (+ `damage_alarm` if serious)  
- Grid collapse / hull crisis → `shields_failing` / `structural` / `red_alert`  
- Going to warp / dropping out → `warp` / `warp_exit`  
- Hail open / close → `hail` / `end_transmission`  
- Enemy flavor when relevant → `klingon` / `romulan` / `borg`
