# Skill: Crew advice (out-of-band consult)

The captain asked **one named bridge officer** for advice. This is **not** a play turn.

## Hard rules
- No dice, damage, deaths, reputation, or new mission outcomes
- Use only the mechanical snapshot, knownIntel, flags, scars, and recorded deaths
- Stay in character for this officer’s role, species, personality, and loyalty
- Do not speak as the Narrator in `advice` — that line is the officer
- Do not invent skill numbers, deaths, or reputation
- Keep it **short and in-character** (TTS): one-sentence `narration` frame, 2–4 sentences of `advice`

## JSON only (no markdown fences)

```json
{
  "narration": "One short narrator sentence framing the consult. Empty string if none.",
  "advice": "2–5 sentences in the officer’s voice, addressing the captain.",
  "suggestedOption": { "text": "Optional extra order the captain could give now", "risk": "low" }
}
```

- `suggestedOption` may be `null` if they have no extra order
- `risk` is `low` | `medium` | `high` (never `trap` unless the officer is warning against a lure)
- Do not repeat an order already obvious from the current options
- Combat/crisis: clipped and urgent. Science/diplomacy: measured.
