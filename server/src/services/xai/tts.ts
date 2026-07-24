/**
 * Grok / xAI Text-to-Speech proxy + optional disk cache.
 * Optimized for low time-to-first-audio (smaller chunks, leaner MP3).
 * Docs: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceEmotion, VoiceIdentity } from "../../../../packages/game-core/src/index.js";
import { getApiKey } from "./connectivity.js";
import { styleTextForTts } from "../voice/voiceIdentity.js";
import { logError, logSystemMessage } from "../../debug/sessionDebugLog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_ROOT = path.resolve(__dirname, "../../../../data/media");
const VOICE_ROOT = path.join(MEDIA_ROOT, "voice");

/** Leaner format = faster synthesis + smaller download for speech. */
const TTS_FORMAT = {
  codec: "mp3" as const,
  sample_rate: 22050,
  bit_rate: 64000,
};

function baseUrl(): string {
  return (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
}

export function voiceCacheDir(runId: string): string {
  return path.join(VOICE_ROOT, runId);
}

export async function deleteVoiceCacheForRun(runId: string): Promise<void> {
  try {
    await fs.rm(voiceCacheDir(runId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function cacheKey(voiceId: string, speed: number, text: string): string {
  return createHash("sha256")
    .update(`v2|${voiceId}|${speed}|${TTS_FORMAT.sample_rate}|${TTS_FORMAT.bit_rate}|${text}`)
    .digest("hex")
    .slice(0, 24);
}

export type TtsRequest = {
  runId?: string;
  text: string;
  voice: VoiceIdentity;
  emotion?: VoiceEmotion | string | null;
  /** Skip disk cache */
  noCache?: boolean;
};

export type TtsTiming = {
  /** ms spent checking/reading disk cache */
  cacheMs: number;
  /** ms for xAI /v1/tts HTTP round-trip (0 if cache hit) */
  xaiMs: number;
  /** ms writing cache file (0 if skip/fail) */
  writeMs: number;
  /** total synthesizeSpeech wall time */
  totalMs: number;
  attempts: number;
};

export type TtsResult = {
  audio: Buffer;
  contentType: string;
  voiceId: string;
  styledText: string;
  cached: boolean;
  timing: TtsTiming;
};

/**
 * Call xAI POST /v1/tts and return MP3 bytes.
 */
export async function synthesizeSpeech(req: TtsRequest): Promise<TtsResult> {
  const t0 = performance.now();
  const key = getApiKey();
  if (!key) {
    throw new Error("XAI_API_KEY not configured for TTS");
  }

  const styledText = styleTextForTts(req.text, req.voice, req.emotion);
  if (!styledText.trim()) {
    throw new Error("Empty text for TTS");
  }

  const voiceId = req.voice.voiceId || "orion";
  const speed = Math.min(1.5, Math.max(0.7, req.voice.speed ?? 1.0));
  const contentType = "audio/mpeg";

  let cacheMs = 0;
  let xaiMs = 0;
  let writeMs = 0;
  let attempts = 0;

  let cachePath: string | null = null;
  if (req.runId && !req.noCache) {
    const tCache0 = performance.now();
    const dir = voiceCacheDir(req.runId);
    await fs.mkdir(dir, { recursive: true });
    cachePath = path.join(dir, `${cacheKey(voiceId, speed, styledText)}.mp3`);
    try {
      const existing = await fs.readFile(cachePath);
      cacheMs = Math.round(performance.now() - tCache0);
      if (existing.length > 0) {
        const totalMs = Math.round(performance.now() - t0);
        console.log(
          `[voice-timing] cache_hit voice=${voiceId} chars=${styledText.length} bytes=${existing.length} cacheMs=${cacheMs} totalMs=${totalMs}`
        );
        return {
          audio: existing,
          contentType,
          voiceId,
          styledText,
          cached: true,
          timing: { cacheMs, xaiMs: 0, writeMs: 0, totalMs, attempts: 0 },
        };
      }
    } catch {
      cacheMs = Math.round(performance.now() - tCache0);
    }
  }

  const url = `${baseUrl()}/tts`;
  // text_normalization off for lower latency; stardates still speak reasonably
  const body = {
    text: styledText,
    voice_id: voiceId,
    language: "en",
    speed,
    text_normalization: styledText.length < 200,
    output_format: TTS_FORMAT,
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    attempts = attempt + 1;
    try {
      const tXai0 = performance.now();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        xaiMs += Math.round(performance.now() - tXai0);
        if ([429, 500, 503].includes(res.status) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 400));
          continue;
        }
        throw new Error(`TTS ${res.status}: ${errText.slice(0, 240)}`);
      }

      const audio = Buffer.from(await res.arrayBuffer());
      xaiMs += Math.round(performance.now() - tXai0);
      if (!audio.length) throw new Error("TTS returned empty audio");

      if (cachePath) {
        const tW0 = performance.now();
        try {
          await fs.writeFile(cachePath, audio);
        } catch {
          /* non-fatal */
        }
        writeMs = Math.round(performance.now() - tW0);
      }

      const totalMs = Math.round(performance.now() - t0);
      console.log(
        `[voice-timing] xai_tts voice=${voiceId} chars=${styledText.length} bytes=${audio.length} cacheMs=${cacheMs} xaiMs=${xaiMs} writeMs=${writeMs} totalMs=${totalMs} attempts=${attempts}`
      );

      // Fire-and-forget logging so we don't add I/O latency to the response path
      if (req.runId) {
        void logSystemMessage(req.runId, "voice", "TTS synthesized", {
          voiceId,
          chars: styledText.length,
          bytes: audio.length,
          emotion: req.emotion || req.voice.baselineTone,
          cached: false,
          timing: { cacheMs, xaiMs, writeMs, totalMs, attempts },
        });
      }

      return {
        audio,
        contentType,
        voiceId,
        styledText,
        cached: false,
        timing: { cacheMs, xaiMs, writeMs, totalMs, attempts },
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2 && /429|503|500|timeout|fetch/i.test(lastErr.message)) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 400));
        continue;
      }
      break;
    }
  }

  if (req.runId) {
    void logError(req.runId, "voice", "TTS failed", {
      error: lastErr?.message,
      voiceId,
    });
  }
  throw lastErr || new Error("TTS failed");
}
