# Bridge audio assets

## LCARS interface SFX

Source: [lcars-monitor](https://lcars-monitor.netlify.app/) (`/sounds/*.ogg`).

| File | Use in our UI |
|------|----------------|
| `panel_beep_03.ogg` | Soft / secondary clicks; quiet typewriter ticks |
| `panel_beep_07.ogg` | Primary actions (Engage, options) |
| `panel_beep_08.ogg` | Close panel / leave LCARS |
| `panel_beep_13.ogg` | Open panel / expand; hail open |
| `panel_beep_14.ogg` | Theme/nav; waiting pulse; hail lock |
| `deny_beep_01.ogg` | Errors / empty submit |

SFX play only when **UI theme = LCARS** and **LCARS SFX** is enabled (Voice ▾ menu).

## Bridge ambient

| File | Use |
|------|-----|
| `bridge_ambient.ogg` | ~36s looping deck bed |

**Baked into the loop:** warp-core hum, life-support air, distant unintelligible murmur (filtered/modulated noise “chatter”), soft console beeps, data ticks, occasional scanner sweeps.

**Live overlay:** while ambient is on, the client also fires irregular quiet panel chirps (`panel_beep_*.ogg` at very low volume) so the deck never feels like a pure loop.

Plays in **both** themes when **Bridge ambient** is enabled (Voice ▾ menu, default on). Ducks under narrator/crew TTS; pauses when the tab is hidden.

### Sequences
- **Narrator typing:** soft ticks while the current message typewriters in
- **Narrator responding:** soft waiting pulse every ~2.2s during LLM wait
- **Crew card expand:** incoming transmission (13→14→03), then TTS greeting in that officer’s locked voice
