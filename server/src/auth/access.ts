import type { NextFunction, Request, Response } from "express";
import { normalizeEmail, type AuthUser } from "./identity.js";

export const ACCESS_CONTACT_NAME = "Michael";
export const ACCESS_CONTACT_EMAIL = "michaelstephens2011@gmail.com";

const DEFAULT_ALLOWED = [
  "mrarcam00@gmail.com",
  "michaelstephens2011@gmail.com",
  "npgibbs@gmail.com",
];

export function parseAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_USERS || process.env.ALLOWED_USER || "";
  const listed = raw
    .split(/[,\s]+/)
    .map((e) => normalizeEmail(e))
    .filter((e) => e.includes("@"));
  if (listed.length) return [...new Set(listed)];
  return DEFAULT_ALLOWED.map((e) => normalizeEmail(e));
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const n = normalizeEmail(email || "");
  if (!n.includes("@")) return false;
  return parseAllowedEmails().includes(n);
}

export function gateEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" || Boolean(process.env.K_SERVICE)
  );
}

/** Block Google/IAP users who are signed in but not on the allow-list. */
export function requireAllowedUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  if (!user) {
    next();
    return;
  }
  if (user.source === "dev" || user.source === "env") {
    next();
    return;
  }
  if (isEmailAllowed(user.email)) {
    next();
    return;
  }
  res.status(403).json({
    error: "access_denied",
    detail: "This Google account is not authorized.",
    gate: "/access.html?gate=denied",
    email: user.email,
  });
}

export function accessPayload(user: AuthUser | null) {
  const allowed = user ? isEmailAllowed(user.email) : false;
  return {
    authenticated: Boolean(user),
    allowed,
    email: user?.email || null,
    source: user?.source || null,
    gateEnabled: gateEnabled(),
    contact: {
      name: ACCESS_CONTACT_NAME,
      email: process.env.ACCESS_CONTACT_EMAIL || ACCESS_CONTACT_EMAIL,
    },
  };
}
