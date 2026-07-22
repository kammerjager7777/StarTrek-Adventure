import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GameState } from "../../../packages/game-core/src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = path.resolve(__dirname, "../../../data/saves");

async function ensureDir() {
  await fs.mkdir(SAVES_DIR, { recursive: true });
}

function savePath(runId: string) {
  return path.join(SAVES_DIR, `${runId}.json`);
}

export async function writeSave(state: GameState): Promise<void> {
  await ensureDir();
  const next = { ...state, updatedAt: new Date().toISOString() };
  await fs.writeFile(savePath(state.runId), JSON.stringify(next, null, 2), "utf8");
}

export async function readSave(runId: string): Promise<GameState | null> {
  try {
    const raw = await fs.readFile(savePath(runId), "utf8");
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export async function listSaves(): Promise<
  Array<{
    runId: string;
    playerName: string;
    shipName: string | null;
    missionTitle: string | null;
    status: GameState["status"];
    phase: GameState["phase"];
    updatedAt: string;
    createdAt: string;
  }>
> {
  await ensureDir();
  const files = await fs.readdir(SAVES_DIR);
  const runs = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(SAVES_DIR, file), "utf8");
      const state = JSON.parse(raw) as GameState;
      runs.push({
        runId: state.runId,
        playerName: state.playerName || "Unknown",
        shipName: state.ship?.name ?? null,
        missionTitle: state.mission?.title ?? null,
        status: state.status,
        phase: state.phase,
        updatedAt: state.updatedAt,
        createdAt: state.createdAt,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
