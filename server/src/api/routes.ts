import { Router } from "express";
import {
  getGame,
  listGames,
  playerAction,
  startNewGame,
} from "../orchestrator/gameOrchestrator.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "Star Trek Adventure",
    phase: 1,
    xai: Boolean(process.env.XAI_API_KEY),
  });
});

apiRouter.post("/games", async (_req, res) => {
  try {
    const view = await startNewGame();
    res.status(201).json(view);
  } catch (err) {
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
    console.error(err);
    res.status(500).json({ error: "Failed to process action" });
  }
});
