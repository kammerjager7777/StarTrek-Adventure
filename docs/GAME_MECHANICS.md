# Star Trek Adventure — Game Mechanics

**Authoritative reference for how the game works in code.**  
Primary sources:

| Layer | Path |
|-------|------|
| Shared types | `packages/game-core/src/types.ts` |
| Pure rules | `packages/game-core/src/rules.ts` |
| Server tools | `server/src/tools/registry.ts` |
| Play loop + referee | `server/src/agents/gamemaster.ts` |
| LLM narrator | `server/src/agents/llmGamemaster.ts` |

**Design principle:** code is the **referee** (dice, shields, hull, systems, objectives, end conditions). The LLM is the **narrator** (prose, options, intel, flags, SFX cues). The model must treat mechanical results as absolute truth.

---

## 1. High-level loop

```
Setup phases → Mission brief → Begin
     ↓
PLAYING: player chooses option or free-text
     ↓
applyMechanics (dice + damage + systems + flags)
     ↓
LLM generates scene (narration, options, sfx, objective updates, …)
     ↓
apply scene side effects → next turn
     ↓
(debrief when mission ends)
```

During **playing**:

1. Player submits a **numbered option** or **free-text** order/question.
2. Server may run **mechanics** (always for options and non-question free text).
3. Server asks the **LLM Gamemaster** for the next scene.
4. State is saved; client renders narration, options, ship panel, SFX, TTS, viewscreen.

---

## 2. Game phases

| Phase | Purpose |
|-------|---------|
| `boot` | App start |
| `ask_name` | Captain name |
| `tutorial_offer` / `tutorial` | Optional training drill |
| `ship_select` / `ship_custom` | Choose or define a vessel + crew |
| `mission_type` | Science, Exploration, Search & Rescue, Battle, Expanded |
| `difficulty` | easy / medium / hard / hardcore |
| `mission_offer` | Pick among generated missions (or “more”) |
| `mission_brief` | Briefing; accept to begin |
| `playing` | Core mission loop |
| `debrief` | Success/failure wrap-up |
| `post_mission` | After debrief choices |

Run `status`: `active` | `completed` | `abandoned`.

---

## 3. Difficulty & dice

### 3.1 Threshold table

Defined as `DICE_THRESHOLDS` / `evaluateD20`:

| Difficulty | Base success threshold | Critical failure |
|------------|------------------------|------------------|
| **easy** | d20 ≥ **5** | natural **1** |
| **medium** | d20 ≥ **10** | natural **1** |
| **hard** | d20 ≥ **15** | natural **1** |
| **hardcore** | d20 ≥ **18** | natural **1–3** |

- **Natural 20** → always **critical success** (success + `critical: "success"`).
- **Natural 1** (or 1–3 on hardcore) → **critical failure**.
- Threshold is clamped to **2–20** after modifiers:  
  `threshold = clamp(base + actionModifier, 2, 20)`.

### 3.2 Action modifiers (before the roll)

Applied in `applyMechanics` when systems constrain the order:

| Condition | Effect on dice |
|-----------|----------------|
| Required system **destroyed** | Risk forced toward **trap**; `actionModifier += 4` |
| Each required system **damaged** | `actionModifier += 2`; risk escalates low→medium→high |
| Life support **damaged** | `+1` modifier |
| Life support **destroyed** | `+3` modifier + flag `life_support_critical` |
| High risk | Extra `+2` on the roll call |
| Trap risk | Extra `+3` on the roll call |

`actionModifier` **raises** the number needed to succeed (harder).

### 3.3 When dice are rolled

| Option risk / path | Roll? | Typical integrity stress (raw amount before shields) |
|--------------------|-------|------------------------------------------------------|
| **low** | No | No combat damage; may add **sensor intel** |
| **medium** | Yes | Fail → **5** (+3 if impaired systems) |
| **high** | Yes | Crit success → no hull package; success in firefight → **4**; fail → **15** (+ impaired×2); crit fail → **25** |
| **trap** | Yes | Success → **10**; fail → **20** (+ impaired×3); +5 if order used destroyed systems |
| Free-text **question** | No | No damage |
| Free-text **order** | Yes as **medium** | Same as medium |

Risk on numbered options is set by the LLM (`low` \| `medium` \| `high` \| `trap`). Setup guarantees at least one high/trap-leaning option in the list when normalizing.

### 3.4 Dice visibility

- Rolls are stored on `turn.lastRoll` and logged as `kind: "roll"`.
- The **mission log UI does not show raw d20 numbers** to the player; the LLM is instructed not to narrate them either.
- Crit success/fail can drive **client SFX** (affirmative / critical).

---

## 4. The ship

### 4.1 Core fields

| Field | Meaning |
|-------|---------|
| `integrity` / `maxIntegrity` | **Hull** (legacy name “integrity”) |
| `shieldIntegrity` / `maxShieldIntegrity` | Shield grid energy |
| `shieldGridOnline` | If false, grid collapsed / offline — no absorption |
| `shieldRechargeTurns` | Turns until grid can come back after collapse |
| `systems` | Six subsystems (see below) |
| `scars[]` | Lasting damage log (max 12 kept) |
| `registryNumber` | e.g. `NCC-#####` / `NX-##` (normalized) |
| `crew[]` | Officers with optional voice/visual locks |

Default full health is typically **100** hull and **100** (or hull-capped) shields.

### 4.2 Subsystems

Each system is `ok` | `damaged` | `destroyed`:

| Key | Label | Gameplay impact |
|-----|-------|-----------------|
| `shields` | Shield array | Destroyed → no grid, charge wiped; damaged → slower recharge / drip |
| `torpedoes` | Photon torpedo launcher | Destroyed → torpedo orders blocked |
| `warp` | Warp nacelles | Destroyed → warp/flee blocked; extra chance to finish if already damaged under heavy fire |
| `communications` | Communications | Destroyed → hail/negotiate blocked |
| `sensors` | Sensors | Destroyed → scan intel blocked; needed for many weapon locks |
| `lifeSupport` | Life support | Damaged/destroyed → global action modifiers |

### 4.3 System requirements for orders

`systemsRequiredForAction(text)` maps order text → required systems:

| Order keywords (examples) | Systems needed |
|---------------------------|----------------|
| warp, flee, emergency jump | `warp` |
| torpedo, photon, quantum salvo | `torpedoes` |
| phaser, fire weapons, target lock | `sensors` (+ torpedoes if torpedo text) |
| scan, sensor, probe, analyze | `sensors` |
| hail, negotiate, transmit | `communications` |
| raise/reinforce shields, divert…shield | `shields` |

`evaluateSystemConstraints`:

- **destroyed** → `severity: "blocked"` (order still may resolve as trap-level desperation)
- **damaged** → `severity: "impaired"` (harder dice, more failure cost)

The LLM is also instructed never to offer options that require destroyed systems as if they work.

---

## 5. Combat damage (shields first)

Implemented in `applyCombatDamage(ship, amount, kind)`.

### 5.1 Damage kinds

Inferred from order/scene text via `classifyDamageKind`:

| Kind | How classified | Shield behavior |
|------|----------------|-----------------|
| `phaser` / `laser` | phaser, beam, disruptor, … | High grid stress; leak rises as % falls |
| `torpedo` | torpedo, photon, quantum, … | Lower grid drain; still leaks when weak |
| `collision` | ram, asteroid, crash, … | Lower grid, substantial leak when weak |
| `boarding` / `internal` | boarding, intruder, sabotage, internal explosion | **Bypass shields entirely** |
| `general` | generic combat/attack language | Default external profile |

### 5.2 When shields are up

External damage hits the **shield grid first**. Shields **reduce** hull damage; they do not stop it once the grid is worn:

1. Compute **bleed ratio** from current shield % of **effective max** (linear: ~4–8% at full, ~25–30% at 75%, ~50% at half, most of the hit near empty).
2. That fraction of incoming hits the **hull**; the rest hits **shieldIntegrity** (scaled by `shieldMult`).
3. If shields hit **0** this strike:
   - Grid goes **offline**
   - **Overflow** of unabsorbed energy may hit hull
   - `shieldRechargeTurns` set to **2–3** (healthy) or **4–5** if the shield *system* is damaged
4. Hull reduced by bleed + overflow.

**Damaged shield emitters** also lower **effective max capacity** to **65%** of `maxShieldIntegrity` until repaired.

### 5.3 When shields are offline or bypassed

- Offline grid → full `amount` to hull (with event text).
- Boarding/internal → full amount to hull (bypass).

### 5.4 System damage rolls

After hull damage:

- Chance rises with hull damage taken, weak/down shields, and shield collapse.
- Only rolls if `hullDamage >= 4` and RNG passes (capped ~78%).
- Shield **hardware** can only be damaged/destroyed when the grid is down/collapsing.
- Escalation: `ok` → usually `damaged` (rare instant destroy ~12%); `damaged` → often `destroyed` (~55%).
- System wounds add a **scar** (deduped by system + status).

### 5.5 Damaged shield emitters

If shields system is `damaged` and grid is online, ~35% chance of a small passive **drip** (2–5) that can drop the grid offline.

### 5.6 Structural scars

In addition to system scars, `toolUpdateIntegrity` adds a structural scar when:

- Hull damage this hit **≥ 15**, or  
- Ship **destroyed** (integrity 0).

Scars list is capped at **12** entries. Scars are **never** the player’s order text — only lasting damage records.

### 5.7 Hull 0 = mission failure

If integrity reaches 0:

- Mission `status: failed`
- Main objectives → `failed`; other actives → `missed`
- Phase forced toward **debrief** / failure path
- `abandonSuggested` is true when hull is **1–15** (narrator guidance)

---

## 6. Shield recharge & divert power

### 6.1 Start-of-beat tick (`tickShieldRecharge`)

Runs at the beginning of every mechanical play beat:

| Grid state | Effect |
|------------|--------|
| Shields system **destroyed** | Charge 0, offline offline, no recharge |
| **Online** | Slow passive fill: **+2**/turn (or **+1** if damaged), up to **effective max** (65% cap if emitters damaged) |
| **Offline**, turns left > 0 | Countdown `shieldRechargeTurns` by 1 (longer if emitters damaged) |
| Countdown hits 0 | Grid online at ~30% of **effective max** |

### 6.2 Divert power to shields

Triggered by orders matching divert/reinforce/emergency shield language (and meta command):

| Situation | Result |
|-----------|--------|
| Emitters **destroyed** | Fail — cannot divert |
| Grid offline | Shorten recharge by 1 turn; may force online at **35** (or **22** damaged) |
| Grid online | Instant boost **+20** (or **+12** damaged), clamped to max |

---

## 7. Play turn accounting

- `mission.playTurnCount` increments on:
  - Numbered option selection
  - Free-text **orders** (not pure questions)
- Does **not** increment on Accept / brief, or free-text questions.

Used for end-mission clamps and long-mission safety.

---

## 8. Mission end conditions

### 8.1 LLM requests (`endMission`)

Clamped by `clampEndMission`:

| Request | Allowed when |
|---------|----------------|
| **success** | Main objective already `completed`, **or** `playTurnCount ≥ 6` |
| **failed** | Main already `failed`, or hull ≤ 0, or (hull ≤ 15 and turns ≥ 3), or turns ≥ 5 |
| Too early | Forced back to `null` (keep playing) |

### 8.2 Safety valve

If `playTurnCount ≥ 20` and the LLM has not ended the mission, the server may force **success** so runs do not infinite-loop.

### 8.3 Hull collapse

Immediate failure path via integrity tool (see §5.7), independent of LLM.

### 8.4 Objective updates

LLM may send `objectiveUpdates: [{ id, status }]`.  
Statuses: `active` | `completed` | `failed` | `missed`.

On forced success end, any still-`active` **main** objective is marked `completed`.

---

## 9. Mission structure

| Field | Role |
|-------|------|
| `type` | science \| exploration \| search_rescue \| battle \| expanded |
| `difficulty` | Locked from setup (changeable via meta) |
| `objectives` | Main + secondaries |
| `status` | active \| success \| failed |
| `knownIntel[]` | Facts the ship has learned (sensor maps, etc.) |
| `flags[]` | Long-term consequence tags |
| `playTurnCount` | Mechanical beat counter |

### 9.1 Flags (examples set by code)

| Flag | Source |
|------|--------|
| `system_blocked_order` | Order needed destroyed system |
| `life_support_critical` | Life support destroyed |
| `critical_failure_event` | High-risk crit fail |
| `chose_trap_option` | Trap path taken |

LLM may also append narrative flags via `setFlags` (e.g. `red_alert_active`). Client uses some flags (e.g. red alert) for audio/UI.

### 9.2 Low-risk intel

On **low** risk success path with sensors not destroyed:

- Adds known intel: “Detailed sensor map acquired” or “Partial sensor map (arrays damaged)”.

---

## 10. Player input modes (playing)

### 10.1 Numbered options

- Parse choice id from input (`1`, `1.`, full option text, etc.).
- Log player choice → bump turn → `applyMechanics(option.text, option.risk)` → LLM scene.

### 10.2 Free-text questions

Detected by `?` or question-like prefixes (`what`, `status`, `sensors`, …):

- **No dice**, no play-turn bump.
- LLM answers with known intel only; should not end mission.
- May keep previous option list if the model returns a weak set.

### 10.3 Free-text orders

- Count as a play turn.
- Mechanics at **medium** risk.
- Full scene generation with mechanical snapshot.

### 10.4 Meta commands

From `metaCommandList` (during play / brief):

| Command | Notes |
|---------|--------|
| `mission status` | Objectives, location, ship summary |
| `hint` | **Disabled on hardcore** |
| `recap` | Story summary so far |
| `divert power to shields` | Mechanical divert (§6.2) |
| `change difficulty` | Adjust DC mid-run |
| `restart` | Restart current mission |
| `new mission` | Back toward mission selection |
| `enemy status` | Known intel only |

---

## 11. Division of responsibility: code vs LLM

| Responsibility | Owner |
|----------------|--------|
| d20 roll & threshold | Code |
| Hull / shield numbers | Code (`applyCombatDamage`) |
| System ok/damaged/destroyed | Code (combat + rare warp-kill under strain) |
| Scars | Code |
| Play turn count | Code |
| Clamp early win/loss | Code |
| Hull-zero fail | Code |
| Narration & crew dialogue | LLM |
| Next options + risk labels | LLM (normalized) |
| `newIntel`, `setFlags`, objective updates | LLM (applied by code) |
| `endMission` request | LLM (clamped by code) |
| `viewscreenPrompt` | LLM → Imagine/viewscreen agent |
| `sfx[]` | LLM → client audio (see §12) |

Mechanical snapshot passed to the LLM includes: player action, risk, roll, integrity before/after, system changes, flags, and human-readable notes (shield events, constraints, etc.).

---

## 12. Audio tied to mechanics (client)

Not “rules,” but driven by mechanical state:

| Trigger | Behavior |
|---------|----------|
| Player order keywords | Immediate weapon/warp/hail/… cues |
| Shield/hull/system deltas | Combat package (sizzle, hull hit, alarms, voices) |
| Red alert conditions | Looping klaxon while crisis / flags / latch |
| `turn.sfx[]` from narrator | Situation cues when the scene lands |
| Objective complete/fail | Affirmative / critical SFX |
| Dice crit | Affirmative / critical SFX |

SFX toggle: Voice menu → **LCARS SFX** (applies to TrekCore cues in both themes).

---

## 13. Setup summary (non-combat)

1. **Name** → optional **tutorial** (teaches numbered options; may mention integrity thematically).  
2. **Ship select** — stock or custom; crew portraits/voices may initialize.  
3. **Mission type** + **difficulty**.  
4. **Mission offers** — pick one or request more.  
5. **Brief** — Accept / return to list.  
6. **Begin** → opening captain’s log (`generateOpeningScene`) → first options.

Expanded mission type is designed as always-hardcore style content in the design docs; difficulty is still a separate setup field in types.

---

## 14. Worked examples

### Example A — Medium risk, shields up

1. Player picks option risk `medium`: “Hold and scan the freighter.”  
2. d20 vs 10 (medium). Fail → raw integrity stress **5**.  
3. Classified as `general` damage → almost all absorbed by full shields; hull ~0.  
4. LLM narrates a tense near-miss; options refresh.

### Example B — High risk firefight, shields collapse

1. Option risk `high`: “Fire phasers at the raider.”  
2. d20 with +2 action mod. Fail → raw **15**.  
3. Kind `phaser` → heavy shield drain; may collapse grid → recharge 2–3 turns; possible hull overflow.  
4. Possible system damage roll if hull took ≥4.  
5. LLM must reflect shield collapse; may set `sfx: ["phaser","shield_hit","red_alert"]`.

### Example C — Destroyed warp + flee order

1. Player: “Emergency warp jump.”  
2. Constraints: warp destroyed → blocked → trap path, +4 modifier.  
3. Harsh integrity package; flag `system_blocked_order`.  
4. Narration: nacelles dead, jump fails; SFX may include `voice_nacelle` / `unable`.

### Example D — Free-text question

1. “What do sensors show?”  
2. No dice, no turn bump.  
3. LLM answers from `knownIntel` + fiction; mission continues.

---

## 15. Implementation map (for developers)

| Concern | Function / type |
|---------|-----------------|
| Dice | `rollD20`, `evaluateD20`, `successThreshold` |
| Damage pipeline | `applyCombatDamage`, `classifyDamageKind` |
| Shield tick / divert | `tickShieldRecharge`, `divertPowerToShields` |
| System gates | `systemsRequiredForAction`, `evaluateSystemConstraints` |
| Play referee | `applyMechanics` in `gamemaster.ts` |
| End clamps | `clampEndMission`, `finalizePlayScene` |
| Tools | `toolRollD20`, `toolUpdateIntegrity`, `toolDivertPowerToShields`, `toolSetSystem` |
| Narrator scene | `LlmScene` + `normalizeScene` in `llmGamemaster.ts` |
| Client SFX | `apps/web/js/trekSfx.js` |

---

## 16. Campaign layer (skills, crew, universe, profiles)

Phase 0 types in `packages/game-core/src/types.ts` are the canonical contract (`SkillVector`, `CrewMember` campaign fields, `ShipSkills`, `UniverseState`, `CampaignProfile`). Old JSON saves may omit campaign fields; runtime fills them via `normalizeCrewMember` / `emptyUniverse` in `campaign.ts`.

### 16.1 Skills
- Seven dimensions: tactical, science, diplomacy, piloting, engineering, medical, command (0–100).
- **Ship total** = class/era baseline (`baselineShipSkills`) + contribution from **active** crew (`baselineSkillsForRole` then XP). Dead/injured do not contribute.
- On each order, `skillModifierForAction` adjusts the d20 `actionModifier` (clamped ±4; negative = easier). Score 50 is neutral. Destroyed systems still hard-block regardless of skill.
- Low-risk scans: science ≥ 65 yields a high-resolution map; science < 40 yields a partial map even with healthy sensors.
- Mission end applies XP via `calculateSkillGains` to **participating crew**, then `computeShipSkills` refreshes `profile.skills`. Extra XP if the main objective completed; command tick if any secondary completed.
- Mechanical snapshot sent to the LLM includes `skillTotals` and `skillModifier` — the model must not invent numbers.
- UI shows skill bars plus a 10-point band (`b0`–`b10`) for later badge work.

### 16.2 Crew lifecycle
- Status: `active` | `injured` | `dead` | `transferred`.
- Mechanical play turns (numbered options and free-text **orders**, not questions) call `tickCrewService`: `serviceTurns += 1` for **active** crew; injured officers count down `injuryTurnsRemaining` then return to active.
- After significant hull damage or boarding/internal hits, the referee rolls `canCrewDie` (higher chance if life support is damaged/destroyed). A miss may still **injure**.
- Death is applied by `toolApplyCrewDeath`: recomputes `computeShipSkills` (dead/injured do not contribute), adds a scar, and sets `crew_loss_<role>` + `crew_casualty`.
- The **last living officer cannot be killed** — the tool converts that hit to injury instead.
- On debrief, living crew gain `missionsServed` and a small loyalty bump on success (`updateProfileFromRun`).
- Replacement officers are hired at starbase (`hireRecruit`) with role baseline skills.

### 16.3 Universe
- New profiles get `emptyUniverse(stardateForEra(ship.era))` — Federation standing starts at **+5**, others **0**.
- `tickUniverse` every **5** mission play turns and on debrief: advance stardate, mild reputation drift toward 0, chance of a galactic crisis, hostility flags at low standing (Klingon/Romulan/Cardassian ≤ −40, Borg ≤ −20).
- `lastTickTurn` is **per mission** (reset to 0 when play starts) so a new assignment still ticks.
- LLM may send `reputationDeltas`; host clamps ±15 via `applyReputation`. Debrief also applies `reputationDeltaFromFlags`.
- Mission offers receive current standing, flags, and crises so antagonists/ports reflect the campaign.

### 16.4 Profiles & account isolation
- All durable data is **scoped by signed-in email** (IAP `X-Goog-Authenticated-User-Email`, or local browser account).
- **Local play:** the bridge stores `sta-user-email` in `localStorage` and sends `X-Dev-User-Email` on every API call. Opening **History** always shows **Signed in as** that email (and can switch local accounts).
- Paths: `data/users/{emailSlug}/profiles/{id}.json`, `data/users/{emailSlug}/saves/{runId}.json`.
- `GameState.ownerEmail` and `CampaignProfile.ownerEmail` stamp ownership; list/get/delete/continue refuse cross-account access.
- API: `GET /api/me`, `GET/POST /api/profiles`, `GET/DELETE /api/profiles/:id`, `POST /api/profiles/:id/continue` (all require auth after health probes).
- History UI shows only that account’s captains/ships with **Continue**.
- Optional one-time legacy import: set `LEGACY_OWNER_EMAIL` to the account that should claim pre-multiuser flat `data/saves` + `data/profiles`.

### 16.5 Advice
- `POST /api/games/:runId/crew/advice` with `{ memberId }` — no dice, no playTurnCount.
- One advice per officer per play turn (cooldown).
- Crew card button **Ask for advice**.

### 16.6 Starbase (campaign hub)
- After debrief, phase `starbase`: hub summary, refit, recruitment, then next mission or save & stand down.
- **Facility tier** from Federation reputation:
  - `outpost` (rep &lt; 5): limited repairs/recruits
  - `starbase` (rep ≥ 5): standard yards
  - `fleet_yards` (rep ≥ 35): priority facilities, more billets, destroyed→ok system jumps
- **Refit (per visit):**
  - Hull plating restore (gain scales with facility; outpost 28 / starbase 40 / fleet yards 55)
  - Deep structural refit when hull ≤ 55% (uses hull slot + one system bay)
  - Full shield grid recharge (requires emitters not destroyed)
  - System repairs within `systemRepairBudget` (damaged→ok; destroyed→damaged, or →ok at fleet yards)
- **Personnel:**
  - Recruit slate (2–4 offers) biased toward understaffed roles
  - Quality tiers: `green` | `standard` | `veteran` | `elite` (rep-weighted rolls; skills + rank scale)
  - Hire shows ship skill delta; soft cap 8 living officers
  - Sickbay: clear injured officers (`medicalBudget`)
  - Transfer: free a billet (`transferBudget`; cannot transfer last active officer)
- Session state on `GameState.starbase` (`StarbaseSession`); cleared when leaving for a new mission.

---

## 17. Related docs

| Doc | Contents |
|-----|----------|
| [GAME_DESIGN.md](./GAME_DESIGN.md) | Pitch, voice, stage overview (product design) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Agents, server layout, client audio modules |
| [ROADMAP.md](./ROADMAP.md) | Shipped vs planned features |
| [../apps/web/assets/sfx/README.md](../apps/web/assets/sfx/README.md) | Audio catalog & triggers |
| [../README.md](../README.md) | Quick start |
| [../content/skills/](../content/skills/) | LLM skill packs (core-gm, play-json, stages, …) |

---

*This document tracks the implementation as of the current codebase. If rules and this file diverge, **trust the code** and update this file.*
