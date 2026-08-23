import { promises as fs } from "node:fs";
import path from "node:path";
import type { GameState } from "../../../packages/game-core/src/types.js";
import { emailsMatch, normalizeEmail } from "../auth/identity.js";
import {
  ensureUserDirs,
  maybeMigrateLegacyForUser,
  userSavesDir,
} from "../auth/userData.js";

function savePath(ownerEmail: string, runId: string) {
  return path.join(userSavesDir(ownerEmail), `${runId}.json`);
}

export async function writeSave(state: GameState): Promise<void> {
  const email = normalizeEmail(state.ownerEmail || "");
  if (!email) {
    throw new Error("writeSave: state.ownerEmail is required");
  }
  await ensureUserDirs(email);
  const next: GameState = {
    ...state,
    ownerEmail: email,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(
    savePath(email, state.runId),
    JSON.stringify(next, null, 2),
    "utf8"
  );
}

/**
 * Load a run only if it belongs to ownerEmail.
 * Returns null when missing or owned by someone else.
 */
export async function readSave(
  runId: string,
  ownerEmail: string
): Promise<GameState | null> {
  const email = normalizeEmail(ownerEmail);
  if (!email) return null;
  await maybeMigrateLegacyForUser(email);
  try {
    const raw = await fs.readFile(savePath(email, runId), "utf8");
    const state = JSON.parse(raw) as GameState;
    // Defense in depth: reject if stamped to another account
    if (state.ownerEmail && !emailsMatch(state.ownerEmail, email)) {
      return null;
    }
    return { ...state, ownerEmail: email };
  } catch {
    return null;
  }
}

export async function listSaves(ownerEmail: string): Promise<
  Array<{
    runId: string;
    playerName: string;
    shipName: string | null;
    missionTitle: string | null;
    status: GameState["status"];
    phase: GameState["phase"];
    updatedAt: string;
    createdAt: string;
    ownerEmail: string;
    profileId: string | null;
  }>
> {
  const email = normalizeEmail(ownerEmail);
  if (!email) return [];
  await maybeMigrateLegacyForUser(email);
  await ensureUserDirs(email);
  const dir = userSavesDir(email);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const runs = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      const state = JSON.parse(raw) as GameState;
      if (state.ownerEmail && !emailsMatch(state.ownerEmail, email)) continue;
      runs.push({
        runId: state.runId,
        playerName: state.playerName || "Unknown",
        shipName: state.ship?.name ?? null,
        missionTitle: state.mission?.title ?? null,
        status: state.status,
        phase: state.phase,
        updatedAt: state.updatedAt,
        createdAt: state.createdAt,
        ownerEmail: email,
        profileId: state.profileId || null,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteSave(
  runId: string,
  ownerEmail: string
): Promise<boolean> {
  const email = normalizeEmail(ownerEmail);
  if (!email) return false;
  // Confirm ownership first
  const existing = await readSave(runId, email);
  if (!existing) return false;
  try {
    await fs.unlink(savePath(email, runId));
    return true;
  } catch {
    return false;
  }
}
