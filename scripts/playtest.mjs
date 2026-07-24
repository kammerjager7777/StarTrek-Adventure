/**
 * Automated playthrough harness — exercises setup + several play turns.
 * Usage: node scripts/playtest.mjs
 */
const BASE = process.env.STA_URL || "http://127.0.0.1:3000/api";

const issues = [];
function note(severity, msg, data = {}) {
  issues.push({ severity, msg, ...data });
  const tag = severity.toUpperCase();
  console.log(`  [${tag}] ${msg}`, data.detail ? `— ${data.detail}` : "");
}

async function api(path, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const ms = Math.round(performance.now() - t0);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body, ms };
}

function assert(cond, severity, msg, data) {
  if (!cond) note(severity, msg, data);
  return cond;
}

async function act(runId, text) {
  return api(`/games/${runId}/action`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

async function playOne(label, { missionType = 2, difficulty = 2, maxPlayTurns = 8 } = {}) {
  console.log(`\n======== PLAYTHROUGH: ${label} ========`);
  const tRun = performance.now();

  let r = await api("/games", { method: "POST" });
  assert(r.ok, "error", "new game failed", { detail: JSON.stringify(r.body).slice(0, 200) });
  if (!r.ok) return;
  let view = r.body;
  let s = view.state;
  const runId = s.runId;
  console.log(`  run=${runId.slice(0, 8)} createMs=${r.ms} phase=${s.phase}`);
  assert(s.phase === "ask_name", "bug", "expected ask_name after boot", { detail: s.phase });
  assert(s.narratorVoice?.voiceId, "bug", "missing narratorVoice on new game");
  assert(
    !/narrotator/i.test(s.pendingQuestion || ""),
    "bug",
    "greeting still says Narrotator",
    { detail: (s.pendingQuestion || "").slice(0, 80) }
  );

  // Name
  r = await act(runId, "Captain " + label.replace(/\s+/g, " "));
  assert(r.ok, "error", "name step failed", { detail: r.body?.reason || r.status });
  if (!r.ok) return;
  s = r.body.state;
  console.log(`  name → ${s.phase} (${r.ms}ms) player=${s.playerName}`);
  assert(s.phase === "tutorial_offer", "bug", "expected tutorial_offer", { detail: s.phase });
  assert(s.playerName && /[A-Z]/.test(s.playerName[0]), "bug", "name not capitalized", {
    detail: s.playerName,
  });

  // Skip tutorial
  r = await act(runId, "2");
  assert(r.ok, "error", "skip tutorial / ship gen failed", {
    detail: r.body?.reason || r.body?.error || r.status,
  });
  if (!r.ok) return;
  s = r.body.state;
  console.log(
    `  ships → ${s.phase} (${r.ms}ms) count=${(s.setupShips || []).length}`
  );
  assert(s.phase === "ship_select", "bug", "expected ship_select", { detail: s.phase });
  assert((s.setupShips || []).length >= 4, "bug", "expected 4 AI ships", {
    detail: String((s.setupShips || []).length),
  });
  if (s.setupShips?.length) {
    const names = s.setupShips.map((x) => x.name);
    console.log(`  ships: ${names.join(" | ")}`);
    const ids = new Set();
    // voices assigned after pick; check names unique
    assert(new Set(names).size === names.length, "warn", "duplicate ship names");
  }
  if (r.ms > 120_000) note("warn", "ship generation very slow", { detail: `${r.ms}ms` });

  // Pick ship 1
  r = await act(runId, "1");
  assert(r.ok, "error", "pick ship failed", { detail: r.body?.reason || r.status });
  if (!r.ok) return;
  s = r.body.state;
  console.log(
    `  ship picked → ${s.phase} (${r.ms}ms) ${s.ship?.name} crew=${s.ship?.crew?.length}`
  );
  assert(s.ship, "error", "no ship after select");
  assert(s.phase === "mission_type", "bug", "expected mission_type", { detail: s.phase });
  assert((s.ship?.crew || []).length >= 3, "warn", "few crew members", {
    detail: String(s.ship?.crew?.length),
  });

  // Voice uniqueness
  if (s.ship?.crew) {
    const voices = s.ship.crew.map((c) => c.voice?.voiceId).filter(Boolean);
    const narratorV = s.narratorVoice?.voiceId;
    assert(
      voices.every((v) => v !== narratorV),
      "bug",
      "crew shares narrator voice",
      { detail: `${narratorV} vs ${voices.join(",")}` }
    );
    assert(
      new Set(voices).size === voices.length,
      "warn",
      "duplicate crew voice ids",
      { detail: voices.join(",") }
    );
    console.log(
      `  voices: narrator=${narratorV} crew=${voices.join(",")}`
    );
  }

  // Mission type
  r = await act(runId, String(missionType));
  assert(r.ok, "error", "mission type failed", { detail: r.body?.reason || r.status });
  if (!r.ok) return;
  s = r.body.state;
  console.log(`  mission_type → ${s.phase} type=${s.missionType} (${r.ms}ms)`);

  if (s.phase === "difficulty") {
    r = await act(runId, String(difficulty));
    assert(r.ok, "error", "difficulty failed", { detail: r.body?.reason || r.status });
    if (!r.ok) return;
    s = r.body.state;
    console.log(`  difficulty → ${s.phase} (${r.ms}ms)`);
  }

  assert(s.phase === "mission_offer", "bug", "expected mission_offer", { detail: s.phase });
  assert((s.missionOffers || []).length >= 3, "bug", "expected 3 missions", {
    detail: String((s.missionOffers || []).length),
  });
  console.log(
    `  missions: ${(s.missionOffers || []).map((m) => m.title).join(" | ")}`
  );

  // Accept first mission
  r = await act(runId, "1");
  assert(r.ok, "error", "mission pick failed", { detail: r.body?.reason || r.status });
  if (!r.ok) return;
  s = r.body.state;
  console.log(`  brief → ${s.phase} (${r.ms}ms) ${s.mission?.title}`);
  assert(s.phase === "mission_brief", "bug", "expected mission_brief", { detail: s.phase });
  assert(s.mission?.objectives?.length >= 1, "bug", "mission missing objectives");

  // Accept / take bridge
  r = await act(runId, "1");
  assert(r.ok, "error", "accept mission failed", { detail: r.body?.reason || r.status });
  if (!r.ok) return;
  s = r.body.state;
  console.log(`  playing → ${s.phase} (${r.ms}ms) options=${(s.pendingChoices || []).length}`);
  assert(s.phase === "playing", "bug", "expected playing", { detail: s.phase });
  assert(
    (s.pendingChoices || []).length >= 3,
    "warn",
    "few play options",
    { detail: String((s.pendingChoices || []).length) }
  );
  assert(s.pendingQuestion?.trim(), "bug", "empty opening narration");

  // Play turns
  let turns = 0;
  while (s.phase === "playing" && turns < maxPlayTurns) {
    turns++;
    const opts = s.pendingChoices || s.turn?.options || [];
    // Prefer lower-risk options (id 1) to keep mission going
    const choice = opts[0] || { id: 1, text: "Continue carefully" };
    const text = `${choice.id}. ${choice.text}`;
    r = await act(runId, text);
    if (!r.ok) {
      note("error", `play turn ${turns} failed`, {
        detail: r.body?.reason || r.body?.error || String(r.status),
      });
      break;
    }
    const prevPhase = s.phase;
    s = r.body.state;
    const narration = s.pendingQuestion || s.turn?.narration || "";
    console.log(
      `  turn ${turns}: ${prevPhase}→${s.phase} (${r.ms}ms) integrity=${s.ship?.integrity} opts=${(s.pendingChoices || []).length} narrChars=${narration.length}`
    );

    if (s.phase === "playing") {
      assert(narration.trim(), "bug", `empty narration turn ${turns}`);
      assert(
        (s.pendingChoices || []).length >= 2,
        "warn",
        `few options turn ${turns}`,
        { detail: String((s.pendingChoices || []).length) }
      );
      // Premature end check: if playTurnCount low and debrief — bug
    }

    if (s.phase === "debrief") {
      console.log(`  debrief after ${turns} turns — success path or failure`);
      const debrief = s.debrief || s.pendingQuestion || "";
      const completeCount = (debrief.match(/Mission Complete/gi) || []).length;
      if (completeCount > 1) {
        note("bug", "duplicate Mission Complete banner", { detail: String(completeCount) });
      }
      assert(debrief.trim(), "bug", "empty debrief");
      // playTurnCount should be meaningful
      const ptc = s.mission?.playTurnCount ?? 0;
      if (ptc < 3 && s.mission?.status === "success") {
        note("bug", "mission success after too few play turns", { detail: `playTurnCount=${ptc}` });
      }
      break;
    }

    if (r.ms > 90_000) {
      note("warn", `slow play turn ${turns}`, { detail: `${r.ms}ms` });
    }
  }

  if (s.phase === "playing") {
    // Free-text question
    r = await act(runId, "What do sensors show?");
    if (r.ok) {
      s = r.body.state;
      console.log(`  freeform Q → ${s.phase} (${r.ms}ms)`);
      assert(s.phase === "playing", "bug", "question should not end mission", {
        detail: s.phase,
      });
    } else {
      note("warn", "freeform question failed", { detail: r.body?.reason });
    }

    // Meta status
    r = await act(runId, "mission status");
    if (r.ok) {
      s = r.body.state;
      console.log(`  meta status → ok (${r.ms}ms)`);
    }
  }

  console.log(
    `  done in ${Math.round(performance.now() - tRun)}ms final phase=${s.phase} status=${s.status}`
  );
}

async function main() {
  console.log("Star Trek Adventure — playtest harness");
  const health = await api("/health");
  console.log("health", health.body?.ai || health.body);
  if (!health.body?.ok && !health.body?.ai?.ready) {
    console.error("AI not ready — abort");
    process.exit(1);
  }

  await playOne("Alpha", { missionType: 2, difficulty: 1, maxPlayTurns: 6 });
  await playOne("Beta", { missionType: 1, difficulty: 2, maxPlayTurns: 5 });
  await playOne("Gamma", { missionType: 4, difficulty: 2, maxPlayTurns: 4 });

  console.log("\n======== ISSUE SUMMARY ========");
  if (!issues.length) {
    console.log("No issues recorded.");
  } else {
    const by = { error: 0, bug: 0, warn: 0 };
    for (const i of issues) {
      by[i.severity] = (by[i.severity] || 0) + 1;
      console.log(`- ${i.severity}: ${i.msg}${i.detail ? ` (${i.detail})` : ""}`);
    }
    console.log("counts", by);
  }

  const fatal = issues.filter((i) => i.severity === "error" || i.severity === "bug");
  process.exit(fatal.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
