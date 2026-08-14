/**
 * Per-user data roots under data/users/{emailSlug}/
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emailToSlug, normalizeEmail } from "./identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_ROOT = path.resolve(__dirname, "../../../data");
export const LEGACY_SAVES_DIR = path.join(DATA_ROOT, "saves");
export const LEGACY_PROFILES_DIR = path.join(DATA_ROOT, "profiles");
export const LEGACY_DEBUG_DIR = path.join(DATA_ROOT, "debug");

export function userDataRoot(email: string): string {
  return path.join(DATA_ROOT, "users", emailToSlug(email));
}

export function userSavesDir(email: string): string {
  return path.join(userDataRoot(email), "saves");
}

export function userProfilesDir(email: string): string {
  return path.join(userDataRoot(email), "profiles");
}

export function userDebugDir(email: string): string {
  return path.join(userDataRoot(email), "debug");
}

export async function ensureUserDirs(email: string): Promise<void> {
  const root = userDataRoot(email);
  await fs.mkdir(path.join(root, "saves"), { recursive: true });
  await fs.mkdir(path.join(root, "profiles"), { recursive: true });
  await fs.mkdir(path.join(root, "debug"), { recursive: true });
}

/**
 * One-time claim of pre-multiuser flat data/saves + data/profiles
 * into data/users/{slug}/ for LEGACY_OWNER_EMAIL (or the given email if it matches).
 */
export async function maybeMigrateLegacyForUser(email: string): Promise<void> {
  const claim = normalizeEmail(
    process.env.LEGACY_OWNER_EMAIL || process.env.DEV_USER_EMAIL || ""
  );
  const me = normalizeEmail(email);
  if (!claim || claim !== me) return;

  await ensureUserDirs(email);
  const marker = path.join(userDataRoot(email), ".legacy_migrated");
  try {
    await fs.access(marker);
    return; // already done
  } catch {
    /* continue */
  }

  let moved = 0;
  moved += await moveJsonDir(LEGACY_SAVES_DIR, userSavesDir(email));
  moved += await moveJsonDir(LEGACY_PROFILES_DIR, userProfilesDir(email));
  moved += await moveJsonDir(LEGACY_DEBUG_DIR, userDebugDir(email), ".jsonl");

  // Stamp ownerEmail on migrated JSON saves/profiles
  await stampOwnerEmailInDir(userSavesDir(email), me);
  await stampOwnerEmailInDir(userProfilesDir(email), me);

  await fs.writeFile(
    marker,
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        email: me,
        filesMoved: moved,
      },
      null,
      2
    ),
    "utf8"
  );
  if (moved > 0) {
    console.log(
      `[user-data] Migrated ${moved} legacy file(s) to user ${me}`
    );
  }
}

async function stampOwnerEmailInDir(dir: string, email: string): Promise<void> {
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const full = path.join(dir, file);
      try {
        const raw = await fs.readFile(full, "utf8");
        const obj = JSON.parse(raw) as Record<string, unknown>;
        if (obj.ownerEmail && normalizeEmail(String(obj.ownerEmail)) === email) {
          continue;
        }
        obj.ownerEmail = email;
        await fs.writeFile(full, JSON.stringify(obj, null, 2), "utf8");
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no dir */
  }
}

async function moveJsonDir(
  fromDir: string,
  toDir: string,
  ext = ".json"
): Promise<number> {
  let count = 0;
  try {
    await fs.mkdir(toDir, { recursive: true });
    const files = await fs.readdir(fromDir);
    for (const file of files) {
      if (!file.endsWith(ext)) continue;
      const src = path.join(fromDir, file);
      const dest = path.join(toDir, file);
      try {
        await fs.access(dest);
        // dest exists — leave legacy copy
        continue;
      } catch {
        /* free to move */
      }
      try {
        await fs.rename(src, dest);
        count++;
      } catch {
        // cross-device fallback
        try {
          const raw = await fs.readFile(src);
          await fs.writeFile(dest, raw);
          await fs.unlink(src);
          count++;
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* no legacy dir */
  }
  return count;
}
