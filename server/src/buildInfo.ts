/**
 * Deploy/build identity for the UI stamp.
 * Production: server/src/build-stamp.json written by deploy/gcp/deploy.sh
 * Local: last git commit if no stamp file.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type BuildInfo = {
  builtAt: string | null;
  git: string;
  source: "stamp" | "env" | "git" | "dev";
};

const stampPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "build-stamp.json"
);

let cached: BuildInfo | null = null;

function readStampFile(): BuildInfo | null {
  try {
    const parsed = JSON.parse(readFileSync(stampPath, "utf8")) as {
      builtAt?: string;
      git?: string;
    };
    if (!parsed?.builtAt) return null;
    return {
      builtAt: String(parsed.builtAt),
      git: String(parsed.git || ""),
      source: "stamp",
    };
  } catch {
    return null;
  }
}

function fromEnv(): BuildInfo | null {
  const builtAt = String(process.env.BUILD_DATE || "").trim();
  if (!builtAt) return null;
  return {
    builtAt,
    git: String(process.env.BUILD_SHA || "").trim(),
    source: "env",
  };
}

function fromGit(): BuildInfo | null {
  try {
    const git = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const builtAt = execFileSync("git", ["log", "-1", "--format=%cI"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!builtAt) return null;
    return { builtAt, git, source: "git" };
  } catch {
    return null;
  }
}

export function getBuildInfo(): BuildInfo {
  if (cached) return cached;
  cached =
    readStampFile() ||
    fromEnv() ||
    fromGit() || { builtAt: null, git: "", source: "dev" };
  return cached;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatBuildLabel(info: BuildInfo): string {
  if (!info.builtAt) return "dev";
  const d = new Date(info.builtAt);
  if (Number.isNaN(d.getTime())) return "dev";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildPayload() {
  const info = getBuildInfo();
  return {
    builtAt: info.builtAt,
    git: info.git,
    source: info.source,
    label: formatBuildLabel(info),
  };
}
