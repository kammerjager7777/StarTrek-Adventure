/**
 * E2E: account-scoped save + "refresh" resume via GET /games/:id
 * Run against local dev: npx tsx scripts/smoke-save-refresh.mts
 */
const BASE = process.env.STA_BASE || "http://127.0.0.1:3000";
const ALICE = "alice.refresh@test.local";
const BOB = "bob.refresh@test.local";

async function api(
  path: string,
  email: string,
  init: RequestInit = {}
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Dev-User-Email": email,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

console.log("1) /me as Alice");
{
  const { status, body } = await api("/me", ALICE);
  assert(status === 200, `/me failed ${status}`);
  assert(body.email === ALICE, `expected ${ALICE}, got ${body.email}`);
  console.log("   ok", body);
}

console.log("2) Start new game as Alice");
let runId = "";
let phase = "";
{
  const { status, body } = await api("/games", ALICE, { method: "POST" });
  assert(status === 201, `start game ${status}: ${JSON.stringify(body)}`);
  assert(body.state?.runId, "missing runId");
  assert(
    body.state.ownerEmail === ALICE,
    `ownerEmail ${body.state.ownerEmail} !== ${ALICE}`
  );
  runId = body.state.runId;
  phase = body.state.phase;
  console.log("   runId", runId, "phase", phase, "owner", body.state.ownerEmail);
}

console.log("3) Simulate refresh — GET same run as Alice");
{
  const { status, body } = await api(`/games/${runId}`, ALICE);
  assert(status === 200, `refresh GET ${status}`);
  assert(body.state?.runId === runId, "runId mismatch after refresh");
  assert(body.state.ownerEmail === ALICE, "owner lost on refresh");
  assert(body.state.phase === phase, `phase changed: ${body.state.phase}`);
  console.log("   ok phase", body.state.phase);
}

console.log("4) Player action then re-fetch (persist after turn)");
{
  // Pick first choice if available, else free text
  const before = await api(`/games/${runId}`, ALICE);
  const choices = before.body?.state?.pendingChoices || [];
  const text =
    choices.length > 0 ? String(choices[0].id) : "1";
  const { status, body } = await api(`/games/${runId}/action`, ALICE, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  assert(status === 200, `action ${status}: ${JSON.stringify(body)?.slice?.(0, 200)}`);
  const afterPhase = body.state.phase;
  console.log("   after action phase", afterPhase);

  // "Refresh" again
  const refresh = await api(`/games/${runId}`, ALICE);
  assert(refresh.status === 200, "refresh after action failed");
  assert(
    refresh.body.state.phase === afterPhase,
    `phase not persisted: ${refresh.body.state.phase} vs ${afterPhase}`
  );
  assert(refresh.body.state.ownerEmail === ALICE, "owner lost after action");
  console.log("   persisted after refresh");
}

console.log("5) Bob cannot load Alice's run");
{
  const { status, body } = await api(`/games/${runId}`, BOB);
  assert(status === 404, `Bob should 404, got ${status} ${JSON.stringify(body)}`);
  console.log("   ok 404 for Bob");
}

console.log("6) List games — Alice sees run, Bob does not");
{
  const a = await api("/games", ALICE);
  const b = await api("/games", BOB);
  assert(a.status === 200, "alice list failed");
  assert(b.status === 200, "bob list failed");
  const aIds = (a.body.games || []).map((g: any) => g.runId);
  const bIds = (b.body.games || []).map((g: any) => g.runId);
  assert(aIds.includes(runId), "Alice list missing her run");
  assert(!bIds.includes(runId), "Bob list leaked Alice run");
  console.log("   alice games", aIds.length, "bob games", bIds.length);
}

console.log("7) Disk file under data/users/{slug}/saves/");
{
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const savePath = path.join(
    root,
    "data",
    "users",
    ALICE,
    "saves",
    `${runId}.json`
  );
  const raw = await fs.readFile(savePath, "utf8");
  const parsed = JSON.parse(raw);
  assert(parsed.ownerEmail === ALICE, "disk ownerEmail wrong");
  assert(parsed.runId === runId, "disk runId wrong");
  console.log("   file ok", savePath.replace(root + "/", ""));
}

console.log("\nOK — saves persist across refresh and stay account-scoped");
