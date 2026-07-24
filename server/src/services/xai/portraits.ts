/**
 * Crew portrait generation via xAI Imagine, stored under data/media/portraits.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CrewMember, GameState } from "../../../../packages/game-core/src/index.js";
import { getApiKey } from "./connectivity.js";
import { logError, logSystemMessage } from "../../debug/sessionDebugLog.js";
import { writeSave } from "../../store/saveStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_ROOT = path.resolve(__dirname, "../../../../data/media");
const PORTRAITS_ROOT = path.join(MEDIA_ROOT, "portraits");

function baseUrl(): string {
  return (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
}

function imageModel(): string {
  return process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";
}

export function portraitDir(runId: string): string {
  return path.join(PORTRAITS_ROOT, runId);
}

export async function deletePortraitsForRun(runId: string): Promise<void> {
  try {
    await fs.rm(portraitDir(runId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function portraitPrompt(member: CrewMember, shipName?: string, era?: string): string {
  // Prefer locked visual bible for consistency across portraits + viewscreen
  if (member.visual?.imagePrompt) {
    return [
      member.visual.imagePrompt,
      shipName ? `serving aboard ${shipName},` : "",
      era ? `${era} setting,` : "",
      "consistent character identity, no text, no watermark",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const species = member.species || "humanoid";
  const personality = member.personality || "professional Starfleet officer";
  return [
    "Cinematic character portrait, Star Trek inspired bridge officer,",
    `${member.name}, ${member.role}, ${species},`,
    member.sex ? `${member.sex},` : "",
    member.skinTone ? `skin ${member.skinTone},` : "",
    member.hair ? `hair ${member.hair},` : "",
    member.eyes ? `eyes ${member.eyes},` : "",
    member.build ? `${member.build} build,` : "",
    member.clothing || "duty uniform,",
    member.scarsMarks ? `marks: ${member.scarsMarks},` : "",
    `${personality},`,
    shipName ? `serving aboard ${shipName},` : "",
    era ? `${era} aesthetic,` : "",
    "head and shoulders, dramatic soft lighting, no text, no watermark, no logo",
  ]
    .filter(Boolean)
    .join(" ");
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Failed to download portrait (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
}

async function generateOnePortrait(
  runId: string,
  member: CrewMember,
  shipName?: string,
  era?: string
): Promise<CrewMember> {
  const key = getApiKey();
  if (!key) {
    return { ...member, portraitStatus: "failed", imageUrl: null };
  }

  try {
    const res = await fetch(`${baseUrl()}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: imageModel(),
        prompt: portraitPrompt(member, shipName, era),
        n: 1,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(`Imagine API ${res.status}: ${bodyText.slice(0, 240)}`);
    }

    const json = JSON.parse(bodyText) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };
    const item = json.data?.[0];
    const dest = path.join(portraitDir(runId), `${member.id}.jpg`);

    if (item?.url) {
      await downloadToFile(item.url, dest);
    } else if (item?.b64_json) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, Buffer.from(item.b64_json, "base64"));
    } else {
      throw new Error("Imagine API returned no image url/b64");
    }

    const imageUrl = `/media/portraits/${runId}/${member.id}.jpg`;
    return {
      ...member,
      imageUrl,
      portraitStatus: "ready",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logError(runId, "playing", `Portrait failed for ${member.name}`, {
      error: message,
      crewId: member.id,
    });
    return { ...member, portraitStatus: "failed", imageUrl: member.imageUrl ?? null };
  }
}

/** Generate missing portraits for a run; saves state when done. */
export async function ensureCrewPortraits(
  state: GameState
): Promise<GameState> {
  if (!state.ship?.crew?.length) return state;

  const ship = state.ship;
  let changed = false;
  const nextCrew: CrewMember[] = [];

  for (const member of ship.crew) {
    if (member.imageUrl && member.portraitStatus === "ready") {
      nextCrew.push(member);
      continue;
    }

    // Mark pending in-memory for callers that stream UI later
    const pending = { ...member, portraitStatus: "pending" as const };
    const generated = await generateOnePortrait(
      state.runId,
      pending,
      ship.name,
      ship.era
    );
    if (generated.imageUrl !== member.imageUrl || generated.portraitStatus !== member.portraitStatus) {
      changed = true;
    }
    nextCrew.push(generated);
  }

  if (!changed) return state;

  const next: GameState = {
    ...state,
    ship: { ...ship, crew: nextCrew },
  };
  await writeSave(next);
  await logSystemMessage(state.runId, state.phase, "Crew portraits updated", {
    ready: nextCrew.filter((c) => c.portraitStatus === "ready").length,
    failed: nextCrew.filter((c) => c.portraitStatus === "failed").length,
  });
  return next;
}
