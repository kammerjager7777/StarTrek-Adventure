/** Star Trek Adventure — Bridge UI (Phase 1) */

const els = {
  log: document.getElementById("mission-log"),
  options: document.getElementById("options-bar"),
  form: document.getElementById("command-form"),
  input: document.getElementById("command-input"),
  phase: document.getElementById("phase-badge"),
  ship: document.getElementById("ship-panel"),
  crew: document.getElementById("crew-panel"),
  objectives: document.getElementById("objectives-panel"),
  meta: document.getElementById("meta-panel"),
  run: document.getElementById("run-panel"),
  viewscreen: document.getElementById("viewscreen-content"),
  btnNew: document.getElementById("btn-new"),
  btnHistory: document.getElementById("btn-history"),
  btnCloseHistory: document.getElementById("btn-close-history"),
  historyModal: document.getElementById("history-modal"),
  historyList: document.getElementById("history-list"),
};

let current = null;
const STORAGE_KEY = "sta-active-run";

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function setActiveRun(runId) {
  localStorage.setItem(STORAGE_KEY, runId);
}

function getActiveRun() {
  return localStorage.getItem(STORAGE_KEY);
}

function render(view) {
  current = view;
  const s = view.state;
  setActiveRun(s.runId);

  els.phase.textContent = s.phase;
  els.run.innerHTML = [
    `Run: ${s.runId.slice(0, 8)}…`,
    `Captain: ${s.playerName || "—"}`,
    `Status: ${s.status}`,
    `Difficulty: ${s.difficulty || "—"}`,
  ].join("\n");

  renderShip(s.ship);
  renderCrew(s.ship);
  renderObjectives(s.mission);
  renderMeta(view.metaCommands, s.phase);
  renderLog(s);
  renderOptions(s.pendingChoices || s.turn?.options || []);
  renderViewscreen(s);
}

function renderShip(ship) {
  if (!ship) {
    els.ship.className = "panel-body muted";
    els.ship.textContent = "No ship selected";
    return;
  }
  els.ship.className = "panel-body";
  const systems = Object.entries(ship.systems)
    .map(
      ([k, v]) =>
        `<div class="sys-row"><span>${k}</span><span class="sys-${v}">${v}</span></div>`
    )
    .join("");
  els.ship.innerHTML = [
    `<strong>${escapeHtml(ship.name)}</strong>`,
    escapeHtml(ship.className),
    `Stardate ${escapeHtml(ship.stardate)}`,
    `Integrity: ${ship.integrity}/${ship.maxIntegrity}`,
    "",
    systems,
    ship.scars?.length
      ? `\nScars:\n${ship.scars.map(escapeHtml).join("\n")}`
      : "",
  ].join("\n");
}

function renderCrew(ship) {
  if (!ship?.crew?.length) {
    els.crew.className = "panel-body muted";
    els.crew.textContent = "—";
    return;
  }
  els.crew.className = "panel-body";
  els.crew.textContent = ship.crew
    .map((c) => `${c.name} — ${c.role}`)
    .join("\n");
}

function renderObjectives(mission) {
  if (!mission) {
    els.objectives.className = "panel-body muted";
    els.objectives.textContent = "—";
    return;
  }
  els.objectives.className = "panel-body";
  els.objectives.textContent = [
    mission.title,
    `@ ${mission.location}`,
    "",
    ...mission.objectives.map((o) => `[${o.status}] ${o.title}`),
  ].join("\n");
}

function renderMeta(commands, phase) {
  els.meta.innerHTML = "";
  const usable =
    phase === "playing" || phase === "mission_brief" ? commands : [];
  if (!usable.length) {
    els.meta.innerHTML =
      '<span class="muted">Meta commands unlock during the mission.</span>';
    return;
  }
  for (const cmd of usable) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = cmd;
    btn.addEventListener("click", () => sendAction(cmd));
    els.meta.appendChild(btn);
  }
}

function renderLog(state) {
  els.log.innerHTML = "";

  // Show latest question / narration prominently if present
  if (state.pendingQuestion) {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.innerHTML = `<div class="who">Narrotator</div><div class="text"></div>`;
    entry.querySelector(".text").textContent = state.pendingQuestion;

    if (state.turn?.crewDialogue?.length) {
      for (const line of state.turn.crewDialogue) {
        const d = document.createElement("div");
        d.className = "crew-line";
        d.textContent = `${line.speaker}: "${line.line}"`;
        entry.appendChild(d);
      }
    }
    if (state.turn?.lastRoll) {
      const r = state.turn.lastRoll;
      const d = document.createElement("div");
      d.className = "crew-line";
      d.textContent = `d20: ${r.die} vs ${r.threshold}+ → ${
        r.critical !== "none" ? r.critical : r.success ? "success" : "failure"
      } (${r.reason})`;
      entry.appendChild(d);
    }
    els.log.appendChild(entry);
  }

  // Recent history (skip duplicate of pending)
  const recent = [...state.log].slice(-12).reverse();
  for (const item of recent) {
    if (item.text === state.pendingQuestion) continue;
    const entry = document.createElement("div");
    entry.className = `log-entry ${item.kind}`;
    entry.innerHTML = `<div class="who">${item.kind}</div><div class="text"></div>`;
    entry.querySelector(".text").textContent = item.text;
    els.log.appendChild(entry);
  }
}

function renderOptions(options) {
  els.options.innerHTML = "";
  for (const opt of options || []) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.innerHTML = `<span class="num">${opt.id}.</span> ${escapeHtml(opt.text)}`;
    btn.addEventListener("click", () => sendAction(String(opt.id)));
    els.options.appendChild(btn);
  }
}

function renderViewscreen(state) {
  const prompt = state.turn?.viewscreenPrompt;
  if (prompt) {
    els.viewscreen.innerHTML = `<p class="vs-placeholder">VIEWSCREEN BRIEF<br><span>${escapeHtml(
      prompt
    )}</span><br><span style="opacity:.6">Image generation: Phase 3</span></p>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendAction(text) {
  if (!current?.state?.runId) {
    await newGame();
  }
  const runId = current.state.runId;
  els.input.disabled = true;
  try {
    const view = await api(`/games/${runId}/action`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    render(view);
    els.input.value = "";
  } catch (err) {
    alert(err.message);
  } finally {
    els.input.disabled = false;
    els.input.focus();
  }
}

async function newGame() {
  const view = await api("/games", { method: "POST" });
  render(view);
  els.input.focus();
}

async function resume(runId) {
  const view = await api(`/games/${runId}`);
  render(view);
  closeHistory();
}

async function openHistory() {
  const data = await api("/games");
  els.historyList.innerHTML = "";
  if (!data.games?.length) {
    els.historyList.textContent = "No saved games yet.";
  } else {
    for (const g of data.games) {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `<div>
        <strong>${escapeHtml(g.playerName)}</strong><br>
        <span class="muted">${escapeHtml(g.shipName || "No ship")} — ${escapeHtml(
        g.missionTitle || g.phase
      )}</span><br>
        <span class="muted">${new Date(g.updatedAt).toLocaleString()} · ${g.status}</span>
      </div>`;
      const btn = document.createElement("button");
      btn.className = "lcars-btn secondary";
      btn.type = "button";
      btn.textContent = "Resume";
      btn.addEventListener("click", () => resume(g.runId));
      row.appendChild(btn);
      els.historyList.appendChild(row);
    }
  }
  els.historyModal.classList.remove("hidden");
}

function closeHistory() {
  els.historyModal.classList.add("hidden");
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (text) sendAction(text);
});

els.btnNew.addEventListener("click", () => newGame());
els.btnHistory.addEventListener("click", () => openHistory());
els.btnCloseHistory.addEventListener("click", () => closeHistory());

// Boot
(async function init() {
  try {
    const existing = getActiveRun();
    if (existing) {
      try {
        await resume(existing);
        return;
      } catch {
        /* start fresh */
      }
    }
    await newGame();
  } catch (err) {
    els.log.innerHTML = `<div class="log-entry"><div class="text">Bridge offline: ${escapeHtml(
      err.message
    )}. Run <code>npm run dev</code> from the project folder.</div></div>`;
  }
})();
