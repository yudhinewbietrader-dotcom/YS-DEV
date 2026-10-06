import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "sar_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12 jam

function getSecret() {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me-please-32";
}

function getPassword() {
  return process.env.RESEARCHER_PASSWORD || "riset-sambas-2026";
}

/** Harus kompatibel dengan middleware (Web Crypto base64url tanpa padding). */
function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function verifyPassword(input: string): boolean {
  const expected = Buffer.from(getPassword());
  const actual = Buffer.from(input);
  if (expected.length !== actual.length) {
    // bandingkan dummy agar timing relatif stabil
    timingSafeEqual(expected, Buffer.alloc(expected.length));
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export async function createSession() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = `researcher:${exp}`;
  const token = `${payload}.${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const [, expStr] = payload.split(":");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return true;
}

export async function requireAuth(): Promise<boolean> {
  return isAuthenticated();
}
