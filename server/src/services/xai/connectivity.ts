/**
 * Verify we can reach xAI before starting a game.
 * Returns a clear human-readable reason on failure.
 */

export type XaiConnectivity = {
  ok: boolean;
  configured: boolean;
  reachable: boolean;
  model: string;
  reason?: string;
  detail?: string;
  checkedAt: string;
};

const PLACEHOLDER_KEYS = new Set([
  "",
  "your_xai_api_key_here",
  "xai-...",
  "changeme",
]);

/** Cache successful checks briefly so New Game isn't slow every click */
let lastOkCheck: { at: number; result: XaiConnectivity } | null = null;
const OK_CACHE_MS = 30_000;

export function getApiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim() || "";
  if (!key || PLACEHOLDER_KEYS.has(key)) return null;
  return key;
}

export function isKeyConfigured(): boolean {
  return Boolean(getApiKey());
}

function baseUrl(): string {
  return (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
}

function modelName(): string {
  return process.env.XAI_MODEL || "grok-4.5";
}

function friendlyError(status: number, body: string): { reason: string; detail: string } {
  let parsed: { error?: string; message?: string; code?: string } | null = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* plain text */
  }
  const raw =
    parsed?.error ||
    parsed?.message ||
    body.replace(/\s+/g, " ").trim().slice(0, 400) ||
    `HTTP ${status}`;

  const lower = raw.toLowerCase();

  if (status === 401 || status === 403) {
    if (
      lower.includes("credit") ||
      lower.includes("spending limit") ||
      lower.includes("quota") ||
      lower.includes("billing")
    ) {
      return {
        reason:
          "xAI account has no available credits (or hit its spending limit).",
        detail: raw,
      };
    }
    if (lower.includes("invalid") || lower.includes("api key") || status === 401) {
      return {
        reason: "xAI API key is missing, invalid, or not authorized.",
        detail: raw,
      };
    }
    return {
      reason: "xAI refused the connection (forbidden).",
      detail: raw,
    };
  }

  if (status === 404) {
    return {
      reason: "xAI API endpoint or model was not found. Check XAI_BASE_URL / XAI_MODEL.",
      detail: raw,
    };
  }

  if (status === 429) {
    return {
      reason: "xAI rate limit reached. Wait a moment and try again.",
      detail: raw,
    };
  }

  if (status >= 500) {
    return {
      reason: "xAI service is temporarily unavailable.",
      detail: raw,
    };
  }

  return {
    reason: `Could not establish a link to xAI (HTTP ${status}).`,
    detail: raw,
  };
}

/**
 * Live probe: tiny chat completion so we know the *narrator* can actually run
 * (auth alone /models is not enough — credits can still block completions).
 */
export async function checkXaiConnectivity(
  options: { force?: boolean } = {}
): Promise<XaiConnectivity> {
  const checkedAt = new Date().toISOString();
  const model = modelName();
  const key = getApiKey();

  if (!key) {
    return {
      ok: false,
      configured: false,
      reachable: false,
      model,
      reason:
        "No valid XAI_API_KEY in .env. Add your key from https://console.x.ai and restart the server.",
      detail: "XAI_API_KEY is empty or still the placeholder value.",
      checkedAt,
    };
  }

  if (
    !options.force &&
    lastOkCheck &&
    Date.now() - lastOkCheck.at < OK_CACHE_MS
  ) {
    return { ...lastOkCheck.result, checkedAt };
  }

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: "user",
            content: 'Reply with exactly: OK',
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = await res.text();

    if (!res.ok) {
      const { reason, detail } = friendlyError(res.status, body);
      lastOkCheck = null;
      return {
        ok: false,
        configured: true,
        reachable: false,
        model,
        reason,
        detail,
        checkedAt,
      };
    }

    // Confirm we got a model message back
    try {
      const json = JSON.parse(body) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        lastOkCheck = null;
        return {
          ok: false,
          configured: true,
          reachable: true,
          model,
          reason: "xAI responded but returned no narration content.",
          detail: body.slice(0, 300),
          checkedAt,
        };
      }
    } catch {
      lastOkCheck = null;
      return {
        ok: false,
        configured: true,
        reachable: true,
        model,
        reason: "xAI returned an unreadable response.",
        detail: body.slice(0, 300),
        checkedAt,
      };
    }

    const result: XaiConnectivity = {
      ok: true,
      configured: true,
      reachable: true,
      model,
      checkedAt,
    };
    lastOkCheck = { at: Date.now(), result };
    return result;
  } catch (err) {
    lastOkCheck = null;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      message.toLowerCase().includes("timeout") ||
      message.toLowerCase().includes("aborted");
    return {
      ok: false,
      configured: true,
      reachable: false,
      model,
      reason: isTimeout
        ? "Timed out connecting to xAI. Check your network and try again."
        : "Could not reach xAI (network or DNS error).",
      detail: message,
      checkedAt,
    };
  }
}

export class AiUnavailableError extends Error {
  status = 503;
  reason: string;
  detail?: string;
  connectivity: XaiConnectivity;

  constructor(connectivity: XaiConnectivity) {
    super(connectivity.reason || "AI narrator unavailable");
    this.name = "AiUnavailableError";
    this.reason = connectivity.reason || "AI narrator unavailable";
    this.detail = connectivity.detail;
    this.connectivity = connectivity;
  }
}

/** Throw if AI link is down — use before starting a game. */
export async function assertXaiReady(force = false): Promise<XaiConnectivity> {
  const result = await checkXaiConnectivity({ force });
  if (!result.ok) throw new AiUnavailableError(result);
  return result;
}
