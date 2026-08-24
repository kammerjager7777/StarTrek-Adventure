import { Router } from "express";
import {
  AiUnavailableError,
  continueProfile,
  createProfile,
  deleteGame,
  generateCrewPortraits,
  getGame,
  listGames,
  LlmNarratorError,
  playerAction,
  requestAdvice,
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
import {
  deleteProfile,
  listProfiles,
  readProfile,
} from "../store/profileStore.js";
import type { Ship } from "../../../packages/game-core/src/types.js";
import { requireUser, resolveAuthUser } from "../auth/identity.js";
import { maybeMigrateLegacyForUser } from "../auth/userData.js";
import {
  accessPayload,
  isEmailAllowed,
  parseAllowedEmails,
  requireAllowedUser,
} from "../auth/access.js";
import { googleClientId, verifyGoogleIdToken } from "../auth/google.js";
import { clearSessionCookie, setSessionCookie } from "../auth/session.js";
import {
  clampFeedbackMessage,
  decodeScreenshotData,
  extForMime,
  isAllowedImageMime,
  readFeedbackShot,
  submitFeedback,
} from "../services/feedback/googleInbox.js";

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

/** Public access-gate payload (no login required). */
apiRouter.get("/access", (req, res) => {
  const user = resolveAuthUser(req);
  const payload = accessPayload(user);
  const local =
    process.env.NODE_ENV !== "production" && !process.env.K_SERVICE;
  res.json({
    ...payload,
    googleClientId: googleClientId() || null,
    allowedEmails: local ? parseAllowedEmails() : undefined,
  });
});

apiRouter.get("/auth/config", (_req, res) => {
  res.json({
    googleClientId: googleClientId() || null,
    contact: accessPayload(null).contact,
  });
});

apiRouter.post("/auth/google", async (req, res) => {
  const idToken = String(req.body?.idToken || req.body?.credential || "");
  const verified = await verifyGoogleIdToken(idToken);
  if (!verified) {
    res.status(401).json({
      error: "login_failed",
      detail: "Google sign-in could not be verified.",
    });
    return;
  }
  setSessionCookie(res, verified.email);
  const allowed = isEmailAllowed(verified.email);
  res.json({
    ok: true,
    email: verified.email,
    allowed,
    gate: allowed ? "/" : "/access.html?gate=denied",
  });
});

apiRouter.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true, gate: "/access.html" });
});

/** Screenshot links from the feedback sheet — unguessable object names. */
apiRouter.get("/feedback/shots/:file", async (req, res) => {
  try {
    const shot = await readFeedbackShot(String(req.params.file || ""));
    if (!shot) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.setHeader("Content-Type", shot.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(shot.bytes);
  } catch (err) {
    console.error("Feedback shot fetch failed:", err);
    res.status(502).type("text/plain").send("Unavailable");
  }
});

/**
 * All game/profile routes require a signed-in user (IAP email or local dev).
 * Data is strictly scoped to that account.
 */
apiRouter.use(requireUser);
apiRouter.use(requireAllowedUser);

/** Who am I — for UI account label */
apiRouter.post("/feedback", async (req, res) => {
  const message = clampFeedbackMessage(req.body?.message);
  if (!message) {
    res.status(400).json({ error: "Write a note first." });
    return;
  }

  let screenshot: { mime: string; bytes: Buffer; filename: string } | undefined;
  const shot = req.body?.screenshot;
  if (shot && (shot.data || shot.bytes)) {
    const mime = String(shot.mime || "image/png").trim();
    if (!isAllowedImageMime(mime)) {
      res.status(400).json({
        error: "Attach a PNG, JPEG, GIF, or WebP screenshot.",
      });
      return;
    }
    const bytes = decodeScreenshotData(mime, String(shot.data || ""));
    if (!bytes) {
      res.status(400).json({
        error: "That screenshot could not be read or is larger than 4.5 MB.",
      });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    screenshot = {
      mime,
      bytes,
      filename: `sta-feedback-${stamp}.${extForMime(mime)}`,
    };
  }

  const ctx = req.body?.context && typeof req.body.context === "object" ? req.body.context : {};
  try {
    const result = await submitFeedback({
      from: req.user!.email,
      message,
      userAgent: String(req.get("user-agent") || ""),
      screenshot,
      context: {
        theme: String(ctx.theme || "").slice(0, 40),
        phase: String(ctx.phase || "").slice(0, 40),
        runId: String(ctx.runId || "").slice(0, 80),
        href: String(ctx.href || "").slice(0, 300),
        captain: String(ctx.captain || "").slice(0, 80),
        ship: String(ctx.ship || "").slice(0, 80),
      },
    });
    res.json(result);
  } catch (err) {
    console.error("Feedback submit failed:", err);
    res.status(502).json({
      error: "Could not deliver feedback.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

apiRouter.get("/me", async (req, res) => {
  const user = req.user!;
  try {
    await maybeMigrateLegacyForUser(user.email);
  } catch {
    /* non-fatal */
  }
  res.json({
    email: user.email,
    slug: user.slug,
    source: user.source,
  });
});

apiRouter.post("/games", async (req, res) => {
  try {
    const view = await startNewGame(req.user!.email);
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

apiRouter.get("/games", async (req, res) => {
  try {
    const games = await listGames(req.user!.email);
    res.json({ games });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list games" });
  }
});

apiRouter.get("/games/:runId", async (req, res) => {
  try {
    const view = await getGame(req.params.runId, req.user!.email);
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
    const ok = await deleteGame(req.params.runId, req.user!.email);
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
    const view = await generateCrewPortraits(req.params.runId, req.user!.email);
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
    const view = await setSpeechEnabled(
      req.params.runId,
      req.user!.email,
      req.body.speechOn
    );
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
    const payload = await resolveSpeakPayload(
      req.params.runId,
      req.user!.email,
      {
        speaker: req.body?.speaker,
        text: req.body?.text,
        emotion: req.body?.emotion,
      }
    );
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
    const view = await getGame(req.params.runId, req.user!.email);
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
    const view = await playerAction(
      req.params.runId,
      req.user!.email,
      text
    );
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

/** Debug session log (JSON events) — only if the run belongs to this user */
apiRouter.get("/games/:runId/debug", async (req, res) => {
  try {
    const view = await getGame(req.params.runId, req.user!.email);
    if (!view) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
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
    const view = await getGame(req.params.runId, req.user!.email);
    if (!view) {
      res.status(404).type("text/plain").send("Game not found");
      return;
    }
    const text = await readDebugLogText(req.params.runId);
    res.type("text/plain").send(text);
  } catch (err) {
    console.error(err);
    res.status(500).type("text/plain").send("Failed to read debug log");
  }
});

apiRouter.get("/debug", async (req, res) => {
  try {
    // Only list debug sessions for this user's runs
    const games = await listGames(req.user!.email);
    const runIds = new Set(games.map((g) => g.runId));
    const logs = (await listDebugLogs()).filter((l) => runIds.has(l.runId));
    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list debug logs" });
  }
});

// ── Campaign profiles (per-account) ────────────────────────────────

apiRouter.get("/profiles", async (req, res) => {
  try {
    const profiles = await listProfiles(req.user!.email);
    res.json({ profiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list profiles" });
  }
});

/** Create a campaign profile (captain + ship, or snapshot an existing run). */
apiRouter.post("/profiles", async (req, res) => {
  try {
    const body = req.body || {};
    const profile = await createProfile(req.user!.email, {
      captainName: body.captainName ? String(body.captainName) : undefined,
      ship: body.ship as Ship | undefined,
      runId: body.runId ? String(body.runId) : undefined,
    });
    if (!profile) {
      res.status(400).json({
        error: "Provide captainName + ship, or runId of a save you own.",
      });
      return;
    }
    res.status(201).json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

apiRouter.get("/profiles/:id", async (req, res) => {
  try {
    const profile = await readProfile(req.params.id, req.user!.email);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

apiRouter.delete("/profiles/:id", async (req, res) => {
  try {
    const ok = await deleteProfile(req.params.id, req.user!.email);
    if (!ok) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete profile" });
  }
});

/** Resume active run or start next mission from a campaign profile */
apiRouter.post("/profiles/:id/continue", async (req, res) => {
  try {
    const view = await continueProfile(req.params.id, req.user!.email);
    if (!view) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    if (err instanceof AiUnavailableError || err instanceof LlmNarratorError) {
      res.status(503).json({
        error: "Cannot continue — AI narrator unavailable",
        reason: err.reason,
        detail: "detail" in err ? err.detail : undefined,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Failed to continue profile" });
  }
});

/** Ask a bridge officer for advice (no dice / no play turn) */
apiRouter.post("/games/:runId/crew/advice", async (req, res) => {
  try {
    const memberId = String(req.body?.memberId || "").trim();
    if (!memberId) {
      res.status(400).json({ error: "memberId is required" });
      return;
    }
    const out = await requestAdvice(
      req.params.runId,
      req.user!.email,
      memberId,
      req.body?.question ? String(req.body.question) : undefined
    );
    if (!out) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get advice" });
  }
});
