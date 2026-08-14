import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

function normEmail(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/^accounts\.google\.com:/i, "");
}

export const SESSION_COOKIE = "sta_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

type SessionPayload = {
  email: string;
  exp: number;
};

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.XAI_API_KEY ||
    "sta-dev-session-secret"
  );
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}

export function encodeSession(email: string): string {
  const payload: SessionPayload = {
    email: normEmail(email),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SessionPayload;
    if (!payload?.email || !payload.email.includes("@")) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      return null;
    }
    return normEmail(payload.email);
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, email: string): void {
  const token = encodeSession(email);
  const secure =
    process.env.NODE_ENV === "production" || Boolean(process.env.K_SERVICE);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response): void {
  const secure =
    process.env.NODE_ENV === "production" || Boolean(process.env.K_SERVICE);
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}
