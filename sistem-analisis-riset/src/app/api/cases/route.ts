import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { makeBerkasCode } from "@/lib/anonymize";
import { ensureSeeded } from "@/lib/seed";

export async function GET() {
  ensureSeeded();
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM cases ORDER BY updated_at DESC")
    .all();
  return NextResponse.json({ cases: rows });
}

export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));
  const db = getDb();

  const year =
    Number(body.tahun) ||
    Number(String(body.nomor_perkara || "").match(/\/(\d{4})\//)?.[1]) ||
    new Date().getFullYear();

  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM cases WHERE tahun = ?").get(year) as {
      n: number;
    }
  ).n;
  const kode_berkas = String(body.kode_berkas || makeBerkasCode(year, count + 1));

  const info = db
    .prepare(
      `INSERT INTO cases (
        kode_berkas, nomor_perkara, jenis_perkara, tanggal_register, status_perkara,
        para_pihak_masked, sipp_detail_url, sumber, tahun, status_pekerjaan, kehadiran,
        bukti_pendapatan, objek_nafkah_json, modus_asimetri_json, respons_hakim_json,
        indikasi_asimetri, pertimbangan_hakim, nominal_ringkas, maqasid_json,
        evaluasi_notes, evidence_quotes, catatan_peneliti, coding_status
      ) VALUES (
        @kode_berkas, @nomor_perkara, @jenis_perkara, @tanggal_register, @status_perkara,
        @para_pihak_masked, @sipp_detail_url, @sumber, @tahun, @status_pekerjaan, @kehadiran,
        @bukti_pendapatan, @objek_nafkah_json, @modus_asimetri_json, @respons_hakim_json,
        @indikasi_asimetri, @pertimbangan_hakim, @nominal_ringkas, @maqasid_json,
        @evaluasi_notes, @evidence_quotes, @catatan_peneliti, @coding_status
      )`,
    )
    .run({
      kode_berkas,
      nomor_perkara: body.nomor_perkara || null,
      jenis_perkara: body.jenis_perkara || null,
      tanggal_register: body.tanggal_register || null,
      status_perkara: body.status_perkara || null,
      para_pihak_masked: body.para_pihak_masked || "Disamarkan",
      sipp_detail_url: body.sipp_detail_url || null,
      sumber: body.sumber || "manual",
      tahun: year,
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

  return NextResponse.json({ id: info.lastInsertRowid, kode_berkas }, { status: 201 });
}
