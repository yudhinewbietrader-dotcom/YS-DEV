import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";

export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Kata sandi salah" }, { status: 401 });
  }
  await createSession();
  return NextResponse.json({ ok: true });
}
