import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export async function GET() {
  ensureSeeded();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.id, r.status, r.locked, r.submitted_at, r.reviewed_at, r.consent,
              i.kode, i.pseudonym, i.peran, i.instrumen
       FROM interview_responses r
       JOIN informants i ON i.id = r.informant_id
       ORDER BY r.submitted_at DESC`,
    )
    .all();
  return NextResponse.json({ responses: rows });
}
