/**
 * Multi-step setup + refresh persistence.
 * Run: npx tsx scripts/smoke-save-refresh-multistep.mts
 */
const BASE = process.env.STA_BASE || "http://127.0.0.1:3000";
const EMAIL = "persist.captain@test.local";

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Dev-User-Email": EMAIL,
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${path} ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

const start = await api("/games", { method: "POST" });
const runId = start.state.runId;
console.log("start", runId, start.state.phase, start.state.ownerEmail);
if (start.state.ownerEmail !== EMAIL) throw new Error("owner on create");

let view = await api(`/games/${runId}/action`, {
  method: "POST",
  body: JSON.stringify({ text: "Captain Archer" }),
});
console.log("after name", view.state.phase, view.state.playerName);
if (view.state.playerName !== "Captain Archer") throw new Error("name not saved");

view = await api(`/games/${runId}/action`, {
  method: "POST",
  body: JSON.stringify({ text: "1" }),
});
console.log(
  "after choice",
  view.state.phase,
  "log entries",
  view.state.log?.length
);
const phaseAfter = view.state.phase;
const logLen = view.state.log?.length || 0;

// Simulate full page refresh: only GET with same identity
const refreshed = await api(`/games/${runId}`);
console.log("refresh", {
  phase: refreshed.state.phase,
  playerName: refreshed.state.playerName,
  ownerEmail: refreshed.state.ownerEmail,
  logLen: refreshed.state.log?.length,
  runId: refreshed.state.runId,
});
if (refreshed.state.playerName !== "Captain Archer") throw new Error("name lost");
if (refreshed.state.ownerEmail !== EMAIL) throw new Error("owner lost");
if (refreshed.state.phase !== phaseAfter) throw new Error("phase lost");
if ((refreshed.state.log?.length || 0) < logLen) throw new Error("log shrunk");

const me = await api("/me");
console.log("me", me);
if (me.email !== EMAIL) throw new Error("me email mismatch");

const games = await api("/games");
const found = (games.games || []).find((g: { runId: string }) => g.runId === runId);
if (!found) throw new Error("not in history list");
console.log("history item", found.playerName, found.phase, found.ownerEmail);

// Second refresh after idle — still same
const again = await api(`/games/${runId}`);
if (again.state.phase !== phaseAfter || again.state.playerName !== "Captain Archer") {
  throw new Error("second refresh lost state");
}

console.log("OK multi-step refresh");
