/**
 * Dev-feedback inbox: Google Sheet row + Drive screenshot, or local disk.
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const localDir = path.join(repoRoot, "data", "feedback");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

const MAX_MESSAGE = 8000;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp))$/i;

export type FeedbackScreenshot = {
  mime: string;
  bytes: Buffer;
  filename: string;
};

export type FeedbackContext = {
  theme?: string;
  phase?: string;
  runId?: string;
  href?: string;
  captain?: string;
  ship?: string;
};

export type FeedbackPayload = {
  from: string;
  message: string;
  userAgent: string;
  screenshot?: FeedbackScreenshot;
  context: FeedbackContext;
};

export type FeedbackResult = {
  ok: true;
  destination: "google" | "local";
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

let cachedToken: { value: string; exp: number } | null = null;

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.test(String(mime || "").trim());
}

export function clampFeedbackMessage(raw: string): string {
  return String(raw || "").trim().slice(0, MAX_MESSAGE);
}

export function decodeScreenshotData(
  mime: string,
  data: string
): Buffer | null {
  const cleaned = String(data || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (!cleaned) return null;
  try {
    const buf = Buffer.from(cleaned, "base64");
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

export function extForMime(mime: string): string {
  const m = String(mime || "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  return "png";
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = String(process.env.GOOGLE_SA_JSON || "").trim();
  const file =
    String(process.env.GOOGLE_SA_JSON_FILE || "").trim() ||
    String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  let jsonText = "";
  if (raw.startsWith("{")) jsonText = raw;
  else if (file) {
    try {
      jsonText = readFileSync(file, "utf8");
    } catch {
      return null;
    }
  } else if (raw && !raw.startsWith("{")) {
    try {
      jsonText = readFileSync(raw, "utf8");
    } catch {
      return null;
    }
  }
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as ServiceAccount;
    if (!parsed?.client_email || !parsed?.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function googleConfigured(): boolean {
  return Boolean(
    loadServiceAccount() &&
      String(process.env.FEEDBACK_SHEET_ID || "").trim() &&
      String(process.env.FEEDBACK_DRIVE_FOLDER_ID || "").trim()
  );
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson({
    iss: sa.client_email,
    scope: SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  return `${unsigned}.${sign.sign(sa.private_key, "base64url")}`;
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const sa = loadServiceAccount();
  if (!sa) throw new Error("Google service account is not configured.");
  const assertion = signJwt(sa);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || `Google token exchange failed (${res.status})`);
  }
  cachedToken = {
    value: json.access_token,
    exp: now + Number(json.expires_in || 3600),
  };
  return cachedToken.value;
}

function sheetText(value: string): string {
  const t = String(value || "");
  if (/^[=+\-@]/.test(t)) return `'${t}`;
  return t;
}

async function ensureHeaderRow(token: string, sheetId: string, tab: string): Promise<void> {
  const range = encodeURIComponent(`${tab}!A1:A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return;
  const json = (await res.json()) as { values?: string[][] };
  if (json.values?.length) return;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      `${tab}!A1`
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [
          [
            "Time (UTC)",
            "From",
            "Message",
            "Screenshot",
            "Theme",
            "Phase",
            "Run",
            "Captain",
            "Ship",
            "URL",
            "User-Agent",
          ],
        ],
      }),
    }
  );
}

async function appendRow(
  token: string,
  sheetId: string,
  tab: string,
  row: string[]
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      `${tab}!A1`
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed (${res.status}): ${text.slice(0, 240)}`);
  }
}

async function uploadScreenshot(
  token: string,
  folderId: string,
  shot: FeedbackScreenshot
): Promise<string> {
  const boundary = `sta_${crypto.randomBytes(12).toString("hex")}`;
  const meta = JSON.stringify({
    name: shot.filename,
    parents: [folderId],
    mimeType: shot.mime,
  });
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${shot.mime}\r\n\r\n`
  );
  const close = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([preamble, shot.bytes, close]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const json = (await res.json()) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Drive upload failed (${res.status})`);
  }
  await fetch(`https://www.googleapis.com/drive/v3/files/${json.id}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }).catch(() => {
    /* folder share is enough for the owner */
  });
  return (
    json.webViewLink || `https://drive.google.com/file/d/${json.id}/view`
  );
}

async function saveLocal(payload: FeedbackPayload): Promise<FeedbackResult> {
  await fs.mkdir(localDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = stamp.slice(0, 19);
  let screenshotName = "";
  if (payload.screenshot) {
    screenshotName = `${slug}.${extForMime(payload.screenshot.mime)}`;
    await fs.writeFile(path.join(localDir, screenshotName), payload.screenshot.bytes);
  }
  await fs.writeFile(
    path.join(localDir, `${slug}.json`),
    JSON.stringify(
      {
        time: new Date().toISOString(),
        from: payload.from,
        message: payload.message,
        userAgent: payload.userAgent,
        context: payload.context,
        screenshot: screenshotName || null,
      },
      null,
      2
    )
  );
  return { ok: true, destination: "local" };
}

export async function submitFeedback(
  payload: FeedbackPayload
): Promise<FeedbackResult> {
  if (!googleConfigured()) {
    if (process.env.NODE_ENV === "production" || process.env.K_SERVICE) {
      throw new Error(
        "Share a Google Sheet and Drive folder with the feedback service account, then set FEEDBACK_SHEET_ID and FEEDBACK_DRIVE_FOLDER_ID."
      );
    }
    return saveLocal(payload);
  }

  const sheetId = String(process.env.FEEDBACK_SHEET_ID || "").trim();
  const folderId = String(process.env.FEEDBACK_DRIVE_FOLDER_ID || "").trim();
  const tab = String(process.env.FEEDBACK_SHEET_TAB || "Sheet1").trim() || "Sheet1";
  const token = await accessToken();

  let shotUrl = "";
  if (payload.screenshot) {
    shotUrl = await uploadScreenshot(token, folderId, payload.screenshot);
  }

  await ensureHeaderRow(token, sheetId, tab);
  const ctx = payload.context || {};
  await appendRow(token, sheetId, tab, [
    new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC"),
    sheetText(payload.from),
    sheetText(payload.message),
    shotUrl ? `=HYPERLINK("${shotUrl}","Open screenshot")` : "",
    sheetText(ctx.theme || ""),
    sheetText(ctx.phase || ""),
    sheetText(ctx.runId || ""),
    sheetText(ctx.captain || ""),
    sheetText(ctx.ship || ""),
    sheetText(ctx.href || ""),
    sheetText(payload.userAgent || ""),
  ]);
  return { ok: true, destination: "google" };
}
