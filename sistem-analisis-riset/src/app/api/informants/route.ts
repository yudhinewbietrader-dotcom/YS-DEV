import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { makeInformanCode } from "@/lib/anonymize";
import { newInterviewToken } from "@/lib/tokens";
import { ensureSeeded } from "@/lib/seed";

export async function GET() {
  ensureSeeded();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.*, t.token, t.active AS token_active,
        (SELECT status FROM interview_responses r WHERE r.informant_id = i.id ORDER BY r.id DESC LIMIT 1) AS response_status
       FROM informants i
       LEFT JOIN interview_tokens t ON t.informant_id = i.id
       ORDER BY i.kode ASC`,
    )
    .all();
  return NextResponse.json({ informants: rows });
}

export async function POST(req: Request) {
  ensureSeeded();
  const body = await req.json().catch(() => ({}));
  const peran = String(body.peran || "hakim");
  const instrumen = String(body.instrumen || (peran === "panitera" ? "panitera" : "hakim"));
  const db = getDb();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM informants").get() as { n: number }).n;
  const kode = String(body.kode || makeInformanCode(peran, n + 1));

  const info = db
    .prepare(
      `INSERT INTO informants (
        kode, peran, instrumen, pseudonym, jabatan_ringkas, status_wawancara, jadwal, checklist_json, catatan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      kode,
      peran,
      instrumen,
      String(body.pseudonym || kode),
      body.jabatan_ringkas || null,
      body.status_wawancara || "belum",
      body.jadwal || null,
      JSON.stringify(body.checklist || ["izin_institusi", "informed_consent"]),
      body.catatan || null,
    );

  const token = newInterviewToken();
  db.prepare(
    `INSERT INTO interview_tokens (informant_id, token, active) VALUES (?, ?, 1)`,
  ).run(info.lastInsertRowid, token);

  return NextResponse.json(
    { id: info.lastInsertRowid, kode, token },
    { status: 201 },
  );
}
