import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { newInterviewToken } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  db.prepare(
    `UPDATE informants SET
      pseudonym = @pseudonym,
      jabatan_ringkas = @jabatan_ringkas,
      status_wawancara = @status_wawancara,
      jadwal = @jadwal,
      checklist_json = @checklist_json,
      catatan = @catatan,
      updated_at = datetime('now')
    WHERE id = @id`,
  ).run({
    id,
    pseudonym: body.pseudonym || "",
    jabatan_ringkas: body.jabatan_ringkas || null,
    status_wawancara: body.status_wawancara || "belum",
    jadwal: body.jadwal || null,
    checklist_json: JSON.stringify(body.checklist || []),
    catatan: body.catatan || null,
  });

  if (body.rotate_token) {
    const token = newInterviewToken();
    db.prepare(
      `INSERT INTO interview_tokens (informant_id, token, active)
       VALUES (?, ?, 1)
       ON CONFLICT(informant_id) DO UPDATE SET token = excluded.token, active = 1`,
    ).run(id, token);
    return NextResponse.json({ ok: true, token });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  db.prepare("DELETE FROM informants WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
