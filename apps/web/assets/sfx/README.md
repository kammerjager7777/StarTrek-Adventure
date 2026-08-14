# Bridge audio assets

Companion docs: [GAME_MECHANICS.md](../../../../docs/GAME_MECHANICS.md) (when SFX fire) · [ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md) (client modules).

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

LCARS panel beeps play only when **UI theme = LCARS** and **LCARS SFX** is enabled (layered under TrekCore UI sounds).

## Bridge ambient

| File | Use |
|------|-----|
| `bridge_ambient.ogg` | ~228s TNG bridge bed loop |

**Source:** [TrekCore](https://www.trekcore.com/audio/background/tng_bridge_1.mp3) — converted to Ogg Vorbis.

Plays in **both** themes when **Bridge ambient** is enabled (Voice ▾ menu, default on). Ducks under narrator/crew TTS; pauses when the tab is hidden.

Optional scene beds in `trek/` (engineering / sickbay / bridge2) may duck under speech when narration mentions those locations.

## TrekCore game + UI SFX (`trek/`)

~120 Ogg files from [trekcore.com/audio](https://www.trekcore.com/audio/). Enabled by **LCARS SFX** (both themes).

Implementation: `apps/web/js/trekSfx.js` (wired from `bridge.js`).

### Trigger kinds

| Kind | When |
|------|------|
| **UI intents** | `playTrekUi` — buttons, menus, modals, typewriter, waiting, replay |
| **Order keywords** | phaser, torpedo, warp, warp exit, hail, end transmission, scan, transport, cloak, tractor, red/yellow alert, self-destruct, medical, holodeck, door, turbolift, … |
| **Ship delta** | shield/hull damage, system damage/destroy, scars, shields restore |
| **Mission / dice** | debrief success/fail, objective complete/fail, critical success/fail |
| **Narrator (LLM)** | `turn.sfx[]` from gamemaster JSON — situation cues when the scene lands (`playNarratorSfx`) |
| **Red alert bed** | **Loops** while crisis / `red_alert*` flags / combat latch |
| **Viewscreen** | TNG Viewscreen On/Off + frame scroll |

### Narrator-controlled SFX

The LLM Gamemaster may return `sfx: ["phaser","shield_hit",…]` (0–4 cues) with each play scene. Server normalizes aliases to catalog keys; the client plays them once per `turn.sceneId`. This stacks with keyword + mechanics SFX (not a replacement).

### Catalog (local → TrekCore path)

| Local | TrekCore path | Use |
|-------|---------------|-----|
| `red_alert1.ogg` | `redalertandklaxons/tng_red_alert1.mp3` | Red alert loop |
| `yellow_alert.ogg` | `computer/alert03.mp3` | Yellow alert |
| `phaser.ogg` / `phaser2.ogg` | `weapons/tng_phaser*_clean.mp3` | Phaser fire |
| `torpedo.ogg` / `torpedo2.ogg` | `weapons/tng_torpedo*_clean.mp3` | Torpedoes |
| `quantum_torpedo.ogg` | `weapons/quantumtorpedoes.mp3` | Quantum torpedoes |
| `fire_all_weapons.ogg` | `weapons/tng_fireallweapons_ep.mp3` | Fire all |
| `deflector.ogg` | `weapons/deflector_enterpriseb_clean.mp3` | Deflector dish |
| `shield_sizzle.ogg` | `explosions/shield_sizzle.mp3` | Shield hit |
| `hull_hit.ogg` | `explosions/tng_phaser_strike.mp3` | Hull damage |
| `console_explo1–3.ogg` | `explosions/console_explo_0N.mp3` | System damage |
| `large_explosion.ogg` | `explosions/largeexplosion1.mp3` | System destroyed |
| `small_explosion.ogg` | `explosions/smallexplosion1.mp3` | Scar / minor |
| `damage_alarm.ogg` / `2` | `computer/damagealarm*.mp3` | Combat tick |
| `critical.ogg` | `computer/critical.mp3` | Crit fail / obj fail |
| `console_warning.ogg` | `computer/consolewarning.mp3` | High/trap option |
| `voice_shields_failing.ogg` | `computer/voice/warningprimaryshieldsfailing_ep.mp3` | Shield collapse |
| `voice_structural*.ogg` | structural integrity voices | Hull crisis |
| `voice_abandon_ship.ogg` | life support failure voice | Mission fail / LS destroyed |
| `voice_warp_core.ogg` | warp core collapse voice | Warp destroyed |
| `voice_nacelle.ogg` | nacelle not functional | Warp order blocked |
| `voice_unable.ogg` | unable to comply | Weapons blocked |
| `voice_transfer_complete.ogg` | transfer complete | Mission success |
| `voice_affirmative.ogg` | affirmative | Obj complete / crit success |
| `voice_incoming_tx.ogg` | incoming transmission | Mission boot |
| `voice_proximity.ogg` | proximity alert | Contact |
| `voice_long_range.ogg` | long range scan complete | Long-range scan |
| `voice_insufficient_sensors.ogg` | insufficient sensor data | Sensors destroyed |
| `voice_self_destruct*.ogg` | self-destruct start/stop | Self-destruct orders |
| `incoming_hail.ogg` | `computer/incoming_hail1.mp3` | Incoming channel |
| `hailing_open.ogg` | hailing frequencies open | Hail order |
| `end_transmission.ogg` | communications end | Close channel |
| `start_transmission.ogg` | communications start | Boot |
| `comm_chirp.ogg` / `chirp2–3` | TNG communicator chirps | UI / replay |
| `comm_static.ogg` | TOS comm static | Comms destroyed |
| `sensor_seq.ogg` | sensor sequence | Scan |
| `warp.ogg` / `warp_exit.ogg` / `warp_out.ogg` | TNG warp pack | Warp engage / exit |
| `helm_engage.ogg` / `helm_seq.ogg` | helm engage / sequence | Impulse / evasive |
| `flyby1.ogg` | TNG flyby | Evasive flavor |
| `transporter.ogg` / `transporter_fail.ogg` | TNG transporter pack | Beam / fail |
| `tractor.ogg` | TNG tractor | Tractor |
| `cloak.ogg` / `decloak.ogg` | Romulan cloak pack | Cloak |
| `power_up1–2.ogg` / `power_down.ogg` | power up/down | Shields / divert |
| `engineering_seq.ogg` / `ops_seq.ogg` / `tactical_seq.ogg` | console sequences | Repair / ops / tactical |
| `forcefield_on/off/disable/hit.ogg` | brig forcefield pack | Security |
| `intruder_alert.ogg` / `intruder_nemesis.ogg` | intruder alerts | Boarding |
| `probe_launch.ogg` | probe launch | Probe |
| `replicator.ogg` | TNG replicator | Replicator orders |
| `hypospray.ogg` | hypospray | Medical |
| `holodeck_on/off.ogg` | holodeck pack | Holodeck |
| `door_*.ogg` / `tng_chime.ogg` | TNG doors | Door / airlock |
| `turbolift*.ogg` | TNG turbolift | Deck change |
| `viewscreen_on/off.ogg` | TNG viewscreen | Panel expand/collapse |
| `scrshow.ogg` / `screen_off.ogg` / `scrscroll1.ogg` | computer screen | UI open/close/scroll |
| `padd1.ogg` | PADD | History modal |
| `keyok1–6.ogg` | keypresses | UI soft + typewriter |
| `input_ok*.ogg` / `input_failed.ogg` / `deny.ogg` / `engage.ogg` | computer UI | Accept / deny / Engage |
| `processing*.ogg` | processing | Narrator wait loop |
| `computer_activate.ogg` | computer activate | New Game |
| `computerbeep14/20.ogg` | computer beeps | Theme nav |
| `energize.ogg` | energize | Energize order |
| `klingon_disruptor.ogg` / `romulan_disruptor.ogg` / `borg_phaser.ogg` | alien weapons | Enemy flavor |
| `bridge2.ogg` / `engine_bed.ogg` / `sickbay_bed.ogg` | background beds | Optional scene beds |

## Rights

Trek audio is © Paramount / CBS. TrekCore hosts fan resources; use for **personal/fan projects only** and respect their terms and rights holders. Not cleared for commercial shipping.
