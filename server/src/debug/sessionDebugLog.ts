/**
 * Per-session debug log for diagnosing gameplay issues.
 *
 * Writes JSONL under data/debug/{runId}.jsonl so we can inspect:
 * - user messages
 * - system / narrator messages
 * - tool calls + results
 * - phase transitions
 * - errors / LLM notes
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GameState, Phase } from "../../../packages/game-core/src/index.js";
import type { ToolResult } from "../tools/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEBUG_DIR = path.resolve(__dirname, "../../../data/debug");

export type DebugKind =
  | "session"
  | "user"
  | "system"
  | "narrator"
  | "tool"
  | "phase"
  | "llm"
  | "error"
  | "meta";

export type DebugEvent = {
  ts: string;
  runId: string;
  kind: DebugKind;
  phase?: Phase | string;
  message?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: {
    ok: boolean;
    message: string;
    data?: Record<string, unknown>;
  };
  data?: Record<string, unknown>;
};

async function ensureDir() {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
}

function logPath(runId: string) {
  return path.join(DEBUG_DIR, `${runId}.jsonl`);
}

export async function appendDebugEvent(
  runId: string,
  event: Omit<DebugEvent, "ts" | "runId">
): Promise<void> {
  try {
    await ensureDir();
    const entry: DebugEvent = {
      ts: new Date().toISOString(),
      runId,
      ...event,
    };
    await fs.appendFile(logPath(runId), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    // Never break gameplay because of logging
    console.warn("[debug-log] failed to write:", err);
  }
}

export async function initSessionDebugLog(state: GameState): Promise<void> {
  await appendDebugEvent(state.runId, {
    kind: "session",
    phase: state.phase,
    message: "Session started",
    data: {
      createdAt: state.createdAt,
      settings: state.settings,
    },
  });
}

export async function logUserMessage(
  runId: string,
  phase: Phase | string,
  text: string
): Promise<void> {
  await appendDebugEvent(runId, {
    kind: "user",
    phase,
    message: text,
  });
}

export async function logSystemMessage(
  runId: string,
  phase: Phase | string,
  text: string,
  data?: Record<string, unknown>
): Promise<void> {
  await appendDebugEvent(runId, {
    kind: "system",
    phase,
    message: text,
    data,
  });
}

export async function logNarrator(
  runId: string,
  phase: Phase | string,
  text: string | null | undefined,
  data?: Record<string, unknown>
): Promise<void> {
  if (!text) return;
  await appendDebugEvent(runId, {
    kind: "narrator",
    phase,
    message: text,
    data,
  });
}

export async function logPhaseChange(
  runId: string,
  from: Phase | string,
  to: Phase | string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (from === to) return;
  await appendDebugEvent(runId, {
    kind: "phase",
    phase: to,
    message: `${from} → ${to}`,
    data: { from, to, ...extra },
  });
}

export async function logToolCall(
  runId: string,
  phase: Phase | string,
  tool: string,
  args: Record<string, unknown>,
  result: ToolResult
): Promise<void> {
  await appendDebugEvent(runId, {
    kind: "tool",
    phase,
    tool,
    args,
    message: result.message,
    result: {
      ok: result.ok,
      message: result.message,
      data: result.data,
    },
  });
}

/** Run a tool and record it on the session debug log. */
export function tracedTool<T extends ToolResult>(
  runId: string,
  phase: Phase | string,
  tool: string,
  args: Record<string, unknown>,
  result: T
): T {
  void logToolCall(runId, phase, tool, args, result);
  return result;
}

export async function logLlm(
  runId: string,
  phase: Phase | string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  await appendDebugEvent(runId, {
    kind: "llm",
    phase,
    message,
    data,
  });
}

export async function logError(
  runId: string,
  phase: Phase | string | undefined,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  await appendDebugEvent(runId, {
    kind: "error",
    phase,
    message,
    data,
  });
}

export async function readDebugLog(runId: string): Promise<DebugEvent[]> {
  try {
    const raw = await fs.readFile(logPath(runId), "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DebugEvent);
  } catch {
    return [];
  }
}

export async function readDebugLogText(runId: string): Promise<string> {
  const events = await readDebugLog(runId);
  if (!events.length) return `(no debug events for run ${runId})`;

  return events
    .map((e) => {
      const head = `[${e.ts}] ${e.kind.toUpperCase()}${e.phase ? ` (${e.phase})` : ""}`;
      if (e.kind === "tool") {
        return `${head} tool=${e.tool} ok=${e.result?.ok}\n  args=${JSON.stringify(e.args)}\n  result=${e.result?.message}`;
      }
      if (e.message) return `${head}: ${e.message}`;
      return `${head}: ${JSON.stringify(e.data ?? {})}`;
    })
    .join("\n\n");
}

export async function deleteDebugLog(runId: string): Promise<boolean> {
  try {
    await fs.unlink(logPath(runId));
    return true;
  } catch {
    return false;
  }
}

export async function listDebugLogs(): Promise<
  Array<{ runId: string; updatedAt: string; sizeBytes: number }>
> {
  await ensureDir();
  const files = await fs.readdir(DEBUG_DIR);
  const out = [];
  for (const file of files) {
    if (!file.endsWith(".jsonl")) continue;
    const full = path.join(DEBUG_DIR, file);
    const stat = await fs.stat(full);
    out.push({
      runId: file.replace(/\.jsonl$/, ""),
      updatedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Compact state snapshot for debug context (no full log array). */
export function stateSnapshot(state: GameState): Record<string, unknown> {
  return {
    phase: state.phase,
    status: state.status,
    playerName: state.playerName,
    difficulty: state.difficulty,
    missionType: state.missionType,
    ship: state.ship
      ? {
          name: state.ship.name,
          className: state.ship.className,
          integrity: state.ship.integrity,
          systems: state.ship.systems,
          scars: state.ship.scars,
        }
      : null,
    mission: state.mission
      ? {
          title: state.mission.title,
          status: state.mission.status,
          location: state.mission.location,
          flags: state.mission.flags,
          objectives: state.mission.objectives.map((o) => ({
            id: o.id,
            kind: o.kind,
            status: o.status,
            title: o.title,
          })),
        }
      : null,
    pendingChoices: state.pendingChoices?.map((c) => ({
      id: c.id,
      text: c.text,
      risk: c.risk,
    })),
  };
}
