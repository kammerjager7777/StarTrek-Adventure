/**
 * Resolve the signed-in user from IAP (Cloud Run) or local dev fallbacks.
 * All durable game data is scoped by ownerEmail.
 */

import type { Request, Response, NextFunction } from "express";

export type AuthUser = {
  /** Normalized lowercase email */
  email: string;
  /** Filesystem-safe slug for data directories */
  slug: string;
  /** How the identity was obtained */
  source: "iap" | "dev" | "env";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function normalizeEmail(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/^accounts\.google\.com:/i, "");
}

/** Stable filesystem segment for a user (no path separators). */
export function emailToSlug(email: string): string {
  const n = normalizeEmail(email);
  if (!n) return "anonymous";
  return n
    .replace(/[^a-z0-9@._+-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}

/**
 * Extract authenticated user email.
 * - Production / IAP: X-Goog-Authenticated-User-Email
 * - Local: DEV_USER_EMAIL or X-Dev-User-Email when ALLOW_DEV_AUTH / non-production
 */
export function resolveAuthUser(req: Request): AuthUser | null {
  const iapRaw =
    req.get("x-goog-authenticated-user-email") ||
    req.get("X-Goog-Authenticated-User-Email");
  if (iapRaw?.trim()) {
    const email = normalizeEmail(iapRaw);
    if (email && email.includes("@")) {
      return { email, slug: emailToSlug(email), source: "iap" };
    }
  }

  const allowDev =
    process.env.ALLOW_DEV_AUTH === "1" ||
    process.env.NODE_ENV !== "production" ||
    !process.env.K_SERVICE;

  if (allowDev) {
    const header =
      req.get("x-dev-user-email") || req.get("X-Dev-User-Email") || "";
    const fromHeader = normalizeEmail(header);
    if (fromHeader && fromHeader.includes("@")) {
      return { email: fromHeader, slug: emailToSlug(fromHeader), source: "dev" };
    }
    const fromEnv = normalizeEmail(
      process.env.DEV_USER_EMAIL || "local@dev.local"
    );
    if (fromEnv.includes("@")) {
      return { email: fromEnv, slug: emailToSlug(fromEnv), source: "env" };
    }
  }

  return null;
}

/** Require a signed-in user on /api routes (except health probes). */
export function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = resolveAuthUser(req);
  if (!user) {
    res.status(401).json({
      error: "Authentication required",
      detail:
        "Sign in with an allowed Google account (IAP). Locally set DEV_USER_EMAIL or X-Dev-User-Email.",
    });
    return;
  }
  req.user = user;
  next();
}

export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  return normalizeEmail(a) === normalizeEmail(b);
}
