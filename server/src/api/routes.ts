import { Router } from "express";
import {
  AiUnavailableError,
  deleteGame,
  generateCrewPortraits,
  getGame,
  listGames,
  LlmNarratorError,
  playerAction,
  resolveSpeakPayload,
  setSpeechEnabled,
  startNewGame,
} from "../orchestrator/gameOrchestrator.js";
import {
  listDebugLogs,
  readDebugLog,
  readDebugLogText,
} from "../debug/sessionDebugLog.js";
import { checkXaiConnectivity } from "../services/xai/connectivity.js";
import { synthesizeSpeech } from "../services/xai/tts.js";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  // Always HTTP 200 so clients can read the structured AI status body.
  // Game start still hard-fails with 503 on POST /games when AI is down.
  const probe = await checkXaiConnectivity({ force: false });
  res.json({
    ok: probe.ok,
    name: "Star Trek Adventure",
    phase: 1,
    xai: probe.configured,
    narrator: probe.ok ? "llm" : "unavailable",
    model: probe.model,
    ai: {
      ready: probe.ok,
      configured: probe.configured,
      reachable: probe.reachable,
      reason: probe.reason,
      detail: probe.detail,
      checkedAt: probe.checkedAt,
    },
  });
});

/** Explicit AI link check (always live / forced) */
apiRouter.get("/ai/status", async (_req, res) => {
  const probe = await checkXaiConnectivity({ force: true });
  res.json(probe);
});

apiRouter.post("/games", async (_req, res) => {
  try {
    const view = await startNewGame();
    res.status(201).json(view);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      res.status(503).json({
        error: "Cannot start game — AI narrator unavailable",
        reason: err.reason,
        detail: err.detail,
        ai: err.connectivity,
      });
      return;
    }
    if (err instanceof LlmNarratorError) {
      res.status(503).json({
        error: "Cannot start game — AI narrator unavailable",
        reason: err.reason,
        detail: err.detail,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Failed to start game" });
  }
});

apiRouter.get("/games", async (_req, res) => {
  try {
    const games = await listGames();
    res.json({ games });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list games" });
  }
});

apiRouter.get("/games/:runId", async (req, res) => {
  try {
    const view = await getGame(req.params.runId);
    if (!view) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load game" });
  }
});

apiRouter.delete("/games/:runId", async (req, res) => {
  try {
    const ok = await deleteGame(req.params.runId);
    if (!ok) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json({ ok: true, runId: req.params.runId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete game" });
  }
});

/** Generate / refresh crew portraits for a run (xAI Imagine) */
apiRouter.post("/games/:runId/crew/portraits", async (req, res) => {
  try {
    const view = await generateCrewPortraits(req.params.runId);
    if (!view) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate crew portraits" });
  }
});

/** Toggle auto-voice for narration + crew lines */
apiRouter.patch("/games/:runId/settings", async (req, res) => {
  try {
    if (typeof req.body?.speechOn !== "boolean") {
      res.status(400).json({ error: "speechOn (boolean) is required" });
      return;
    }
    const view = await setSpeechEnabled(req.params.runId, req.body.speechOn);
    if (!view) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

/**
 * Grok TTS for narrator or a crew member.
 * Body: { speaker?: "narrator"|crewId|name, text?: string, emotion?: string }
 * Returns audio/mpeg. When text is omitted, uses current pending narration / crew line.
 */
apiRouter.post("/games/:runId/voice/speak", async (req, res) => {
  const t0 = performance.now();
  try {
    const tResolve0 = performance.now();
    const payload = await resolveSpeakPayload(req.params.runId, {
      speaker: req.body?.speaker,
      text: req.body?.text,
      emotion: req.body?.emotion,
    });
    const resolveMs = Math.round(performance.now() - tResolve0);
    if (!payload) {
      res.status(404).json({
        error: "Nothing to speak (missing game or empty text)",
      });
      return;
    }

    const result = await synthesizeSpeech({
      runId: req.params.runId,
      text: payload.text,
      voice: payload.voice,
      emotion: payload.emotion,
    });

    const totalMs = Math.round(performance.now() - t0);
    console.log(
      `[voice-timing] speak_route run=${req.params.runId.slice(0, 8)} speaker=${payload.speakerLabel} chars=${payload.text.length} resolveMs=${resolveMs} synthTotalMs=${result.timing.totalMs} xaiMs=${result.timing.xaiMs} cached=${result.cached} routeTotalMs=${totalMs}`
    );

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Voice-Id", result.voiceId);
    res.setHeader("X-Voice-Speaker", encodeURIComponent(payload.speakerLabel));
    res.setHeader("X-Voice-Cached", result.cached ? "1" : "0");
    res.setHeader("X-Voice-Chars", String(payload.text.length));
    res.setHeader("X-Voice-Ms-Resolve", String(resolveMs));
    res.setHeader("X-Voice-Ms-Cache", String(result.timing.cacheMs));
    res.setHeader("X-Voice-Ms-Xai", String(result.timing.xaiMs));
    res.setHeader("X-Voice-Ms-Synth", String(result.timing.totalMs));
    res.setHeader("X-Voice-Ms-Total", String(totalMs));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(result.audio);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "TTS failed";
    res.status(503).json({
      error: "Voice synthesis unavailable",
      reason: message,
    });
  }
});

/** Locked voice profiles for the current run (debug / UI tooltips) */
apiRouter.get("/games/:runId/voice/profiles", async (req, res) => {
  try {
    const view = await getGame(req.params.runId);
    if (!view) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    const s = view.state;
    res.json({
      speechOn: s.settings.speechOn,
      narrator: s.narratorVoice || null,
      crew: (s.ship?.crew || []).map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        voice: c.voice || null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load voice profiles" });
  }
});

apiRouter.post("/games/:runId/action", async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const view = await playerAction(req.params.runId, text);
    if (!view) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    if (err instanceof LlmNarratorError || err instanceof AiUnavailableError) {
      res.status(503).json({
        error: "Narrator unavailable",
        reason: err.reason,
        detail: "detail" in err ? err.detail : undefined,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Failed to process action" });
  }
});

/** Debug session log (JSON events) */
apiRouter.get("/games/:runId/debug", async (req, res) => {
  try {
    const events = await readDebugLog(req.params.runId);
    res.json({
      runId: req.params.runId,
      count: events.length,
      events,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read debug log" });
  }
});

/** Debug session log as plain text (easy to paste / share) */
apiRouter.get("/games/:runId/debug.txt", async (req, res) => {
  try {
    const text = await readDebugLogText(req.params.runId);
    res.type("text/plain").send(text);
  } catch (err) {
    console.error(err);
    res.status(500).type("text/plain").send("Failed to read debug log");
  }
});

apiRouter.get("/debug", async (_req, res) => {
  try {
    const logs = await listDebugLogs();
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list debug logs" });
  }
});
