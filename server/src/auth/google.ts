import { normalizeEmail } from "./identity.js";

type TokenInfo = {
  aud?: string;
  iss?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string;
};

const ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

export function googleClientId(): string {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<{ email: string } | null> {
  const clientId = googleClientId();
  const token = String(idToken || "").trim();
  if (!clientId || !token) return null;

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
    token
  )}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const info = (await res.json()) as TokenInfo;
  if (info.aud !== clientId) return null;
  if (!info.iss || !ISSUERS.has(info.iss)) return null;
  const verified =
    info.email_verified === true || info.email_verified === "true";
  if (!verified) return null;
  const email = normalizeEmail(info.email || "");
  if (!email.includes("@")) return null;
  if (info.exp && Number(info.exp) * 1000 < Date.now()) return null;
  return { email };
}
