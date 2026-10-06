import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT r.*, i.kode, i.pseudonym, i.peran, i.instrumen
       FROM interview_responses r
       JOIN informants i ON i.id = r.informant_id
       WHERE r.id = ?`,
    )
    .get(id);
  if (!row) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ response: row });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();

  if (body.lock) {
    db.prepare(
      `UPDATE interview_responses SET
        locked = 1, status = 'reviewed', reviewed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?`,
    ).run(id);
    return NextResponse.json({ ok: true, locked: true });
  }

  if (body.unlock) {
    db.prepare(
      `UPDATE interview_responses SET
        locked = 0, status = 'submitted', updated_at = datetime('now')
      WHERE id = ?`,
    ).run(id);
    return NextResponse.json({ ok: true, locked: false });
  }

  return NextResponse.json({ error: "Aksi tidak dikenali" }, { status: 400 });
}
