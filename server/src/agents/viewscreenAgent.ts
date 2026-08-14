/**
 * ViewscreenAgent — dedicated Imagine assistant for the mission journey book.
 *
 * Responsibilities:
 * - Compose consistent scene prompts from ship/crew visual bible + moment text
 * - Generate frames into data/media/viewscreen/{runId}/
 * - Append frames to GameState.viewscreen.playlist
 *
 * Does NOT narrate story (that's Gamemaster). Does NOT roll dice.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GameState,
  ViewscreenFrame,
} from "../../../packages/game-core/src/index.js";
import { emptyViewscreen } from "../../../packages/game-core/src/index.js";
import { formatVisualBible } from "../content/loader.js";
import { getApiKey } from "../services/xai/connectivity.js";
import { logError, logSystemMessage } from "../debug/sessionDebugLog.js";
import { readSave, writeSave } from "../store/saveStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_ROOT = path.resolve(__dirname, "../../../data/media");
const VIEWSCREEN_ROOT = path.join(MEDIA_ROOT, "viewscreen");

function baseUrl(): string {
  return (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
}

function imageModel(): string {
  return process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";
}

export function viewscreenDir(runId: string): string {
  return path.join(VIEWSCREEN_ROOT, runId);
}

export async function deleteViewscreenForRun(runId: string): Promise<void> {
  try {
    await fs.rm(viewscreenDir(runId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Failed to download viewscreen frame (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
}

/**
 * Compose a locked, consistency-aware Imagine prompt.
 * Ship + crew visual bible is always injected so characters stay recognizable.
 */
export function composeViewscreenPrompt(
  state: GameState,
  moment: string
): { fullPrompt: string; caption: string; subjects: string[] } {
  const ship = state.ship;
  const bible = formatVisualBible(ship);
  const location = state.mission?.location || "deep space";
  const mission = state.mission?.title || "active mission";
  const caption =
    moment.trim().slice(0, 120) ||
    `${mission} — ${location}`;

  const subjects = [
    ship?.visual?.subjectId || "ship",
    ...(ship?.crew.slice(0, 4).map((c) => c.visual?.subjectId || c.id) || []),
  ];

  const fullPrompt = [
    "Cinematic still frame for a Star Trek–inspired starship viewscreen, photorealistic,",
    "16:9 composition, dramatic lighting, no text, no subtitles, no UI chrome, no watermark, no logos.",
    `Mission: ${mission}. Location: ${location}.`,
    `Moment to depict: ${moment.trim()}`,
    "Consistency bible (MUST match these locked descriptions):",
    bible,
    "Prefer showing the ship exterior and/or bridge viewscreen drama with recognizable officers if the moment involves them.",
    "Keep uniform colors, facial features, and ship silhouette consistent with the bible.",
  ].join("\n");

  return { fullPrompt, caption, subjects };
}

async function generateImageFile(
  runId: string,
  frameId: string,
  prompt: string
): Promise<string> {
  const key = getApiKey();
  if (!key) throw new Error("No XAI_API_KEY for viewscreen generation");

  const res = await fetch(`${baseUrl()}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      n: 1,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Viewscreen Imagine API ${res.status}: ${bodyText.slice(0, 280)}`);
  }

  const json = JSON.parse(bodyText) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const item = json.data?.[0];
  const dest = path.join(viewscreenDir(runId), `${frameId}.jpg`);

  if (item?.url) {
    await downloadToFile(item.url, dest);
  } else if (item?.b64_json) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, Buffer.from(item.b64_json, "base64"));
  } else {
    throw new Error("Viewscreen Imagine returned no image");
  }

  return `/media/viewscreen/${runId}/${frameId}.jpg`;
}

/**
 * Capture a journey-book frame for the current mission moment.
 * Safe to call fire-and-forget; uses disk save with re-read to reduce races.
 */
export async function captureViewscreenFrame(
  runId: string,
  momentPrompt: string,
  opts?: { turnSceneId?: string; force?: boolean; ownerEmail?: string | null }
): Promise<GameState | null> {
  const ownerEmail = opts?.ownerEmail;
  if (!ownerEmail) return null;
  const state = await readSave(runId, ownerEmail);
  if (!state) return null;
  if (state.settings.viewscreenEnabled === false && !opts?.force) return state;
  if (!state.ship || !momentPrompt?.trim()) return state;

  // Avoid flooding: skip if last frame used nearly the same moment
  const last = state.viewscreen?.playlist?.slice(-1)[0];
  if (
    last &&
    last.momentPrompt.trim().toLowerCase() === momentPrompt.trim().toLowerCase() &&
    last.status === "ready"
  ) {
    return state;
  }

  const frameId = randomUUID();
  const { fullPrompt, caption, subjects } = composeViewscreenPrompt(
    state,
    momentPrompt
  );

  const pending: ViewscreenFrame = {
    id: frameId,
    createdAt: new Date().toISOString(),
    caption,
    momentPrompt: momentPrompt.trim(),
    fullPrompt,
    imageUrl: null,
    status: "pending",
    subjects,
    turnSceneId: opts?.turnSceneId || state.turn?.sceneId,
    phase: state.phase,
  };

  // Mark generating
  let working: GameState = {
    ...state,
    ownerEmail,
    viewscreen: {
      ...(state.viewscreen || emptyViewscreen()),
      playlist: [...(state.viewscreen?.playlist || []), pending],
      generating: true,
      lastError: null,
      activeIndex: -1,
    },
  };
  await writeSave(working);
  await logSystemMessage(runId, state.phase, "ViewscreenAgent: frame pending", {
    frameId,
    caption,
  });

  try {
    const imageUrl = await generateImageFile(runId, frameId, fullPrompt);
    // Re-read to merge concurrent updates
    const latest = (await readSave(runId, ownerEmail)) || working;
    const playlist = (latest.viewscreen?.playlist || []).map((f) =>
      f.id === frameId
        ? { ...f, imageUrl, status: "ready" as const }
        : f
    );
    working = {
      ...latest,
      ownerEmail,
      viewscreen: {
        playlist,
        activeIndex: -1,
        generating: playlist.some((f) => f.status === "pending"),
        lastError: null,
      },
    };
    await writeSave(working);
    await logSystemMessage(runId, latest.phase, "ViewscreenAgent: frame ready", {
      frameId,
      imageUrl,
    });
    return working;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logError(runId, state.phase, `ViewscreenAgent failed: ${message}`, {
      frameId,
    });
    const latest = (await readSave(runId, ownerEmail)) || working;
    const playlist = (latest.viewscreen?.playlist || []).map((f) =>
      f.id === frameId ? { ...f, status: "failed" as const } : f
    );
    working = {
      ...latest,
      ownerEmail,
      viewscreen: {
        playlist,
        activeIndex: latest.viewscreen?.activeIndex ?? -1,
        generating: playlist.some((f) => f.status === "pending"),
        lastError: message,
      },
    };
    await writeSave(working);
    return working;
  }
}

/** Fire-and-forget capture from a live state object after a beat. */
export function scheduleViewscreenCapture(state: GameState): void {
  if (!state.settings?.viewscreenEnabled) return;
  if (!state.ship) return;
  const moment =
    state.turn?.viewscreenPrompt ||
    state.pendingQuestion?.slice(0, 280) ||
    state.mission?.background ||
    "";
  if (!moment.trim()) return;
  // Only during play / debrief journey moments
  if (state.phase !== "playing" && state.phase !== "debrief") return;

  if (!state.ownerEmail) return;

  void captureViewscreenFrame(state.runId, moment, {
    turnSceneId: state.turn?.sceneId,
    ownerEmail: state.ownerEmail,
  }).catch((err) => {
    console.warn("[viewscreen] capture failed:", err);
  });
}
