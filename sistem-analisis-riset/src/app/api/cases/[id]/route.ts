import { NextResponse } from "next/server";
import { getDb, type CaseRow } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
  if (!row) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  return NextResponse.json({ case: row });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const existing = db.prepare("SELECT id FROM cases WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  db.prepare(
    `UPDATE cases SET
      nomor_perkara = @nomor_perkara,
      jenis_perkara = @jenis_perkara,
      tanggal_register = @tanggal_register,
      status_perkara = @status_perkara,
      para_pihak_masked = @para_pihak_masked,
      sipp_detail_url = @sipp_detail_url,
      tahun = @tahun,
      status_pekerjaan = @status_pekerjaan,
      kehadiran = @kehadiran,
      bukti_pendapatan = @bukti_pendapatan,
      objek_nafkah_json = @objek_nafkah_json,
      modus_asimetri_json = @modus_asimetri_json,
      respons_hakim_json = @respons_hakim_json,
      indikasi_asimetri = @indikasi_asimetri,
      pertimbangan_hakim = @pertimbangan_hakim,
      nominal_ringkas = @nominal_ringkas,
      maqasid_json = @maqasid_json,
      evaluasi_notes = @evaluasi_notes,
      evidence_quotes = @evidence_quotes,
      catatan_peneliti = @catatan_peneliti,
      coding_status = @coding_status,
      updated_at = datetime('now')
    WHERE id = @id`,
  ).run({
    id,
    nomor_perkara: body.nomor_perkara || null,
    jenis_perkara: body.jenis_perkara || null,
    tanggal_register: body.tanggal_register || null,
    status_perkara: body.status_perkara || null,
    para_pihak_masked: body.para_pihak_masked || "Disamarkan",
    sipp_detail_url: body.sipp_detail_url || null,
    tahun: body.tahun || null,
    status_pekerjaan: body.status_pekerjaan || null,
    kehadiran: body.kehadiran || null,
    bukti_pendapatan: body.bukti_pendapatan || null,
    objek_nafkah_json: JSON.stringify(body.objek_nafkah || []),
    modus_asimetri_json: JSON.stringify(body.modus_asimetri || []),
    respons_hakim_json: JSON.stringify(body.respons_hakim || []),
    indikasi_asimetri: body.indikasi_asimetri || null,
    pertimbangan_hakim: body.pertimbangan_hakim || null,
    nominal_ringkas: body.nominal_ringkas || null,
    maqasid_json: JSON.stringify(body.maqasid || {}),
    evaluasi_notes: body.evaluasi_notes || null,
    evidence_quotes: body.evidence_quotes || null,
    catatan_peneliti: body.catatan_peneliti || null,
    coding_status: body.coding_status || "draft",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  db.prepare("DELETE FROM cases WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
