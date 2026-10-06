import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "sar_session";

function getSecret() {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me-please-32";
}

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(sig);
}

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await sign(payload);
  if (sig.length !== expected.length) return false;
  let ok = 0;
  for (let i = 0; i < sig.length; i++) ok |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (ok !== 0) return false;
  const [, expStr] = payload.split(":");
  const exp = Number(expStr);
  return Number.isFinite(exp) && exp >= Math.floor(Date.now() / 1000);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isResearcherPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/perkara") ||
    pathname.startsWith("/informan") ||
    pathname.startsWith("/wawancara") ||
    pathname.startsWith("/ekspor");

  const isResearcherApi =
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/public/");

  if (!isResearcherPage && !isResearcherApi) {
    return NextResponse.next();
  }

  const ok = await isValidSession(req.cookies.get(COOKIE_NAME)?.value);
  if (ok) return NextResponse.next();

  if (isResearcherApi) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/perkara/:path*",
    "/informan/:path*",
    "/wawancara/:path*",
    "/ekspor/:path*",
    "/api/cases/:path*",
    "/api/informants/:path*",
    "/api/interviews/:path*",
    "/api/sipp/:path*",
    "/api/export/:path*",
    "/api/seed/:path*",
  ],
};
