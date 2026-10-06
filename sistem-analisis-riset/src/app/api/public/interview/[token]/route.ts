import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getInstrument } from "@/lib/instruments";
import { ensureSeeded } from "@/lib/seed";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  ensureSeeded();
  const { token } = await ctx.params;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT i.*, t.active
       FROM interview_tokens t
       JOIN informants i ON i.id = t.informant_id
       WHERE t.token = ?`,
    )
    .get(token) as
    | {
        id: number;
        kode: string;
        pseudonym: string;
        instrumen: string;
        peran: string;
        active: number;
        status_wawancara: string;
      }
    | undefined;

  if (!row || !row.active) {
    return NextResponse.json({ error: "Tautan tidak valid atau nonaktif" }, { status: 404 });
  }

  const instrument = getInstrument(row.instrumen);
  if (!instrument) {
    return NextResponse.json({ error: "Instrumen tidak ditemukan" }, { status: 500 });
  }

  const existing = db
    .prepare(
      `SELECT id, status, locked, answers_json, consent
       FROM interview_responses
       WHERE informant_id = ?
       ORDER BY id DESC LIMIT 1`,
    )
    .get(row.id) as
    | {
        id: number;
        status: string;
        locked: number;
        answers_json: string;
        consent: number;
      }
    | undefined;

  return NextResponse.json({
    informant: {
      kode: row.kode,
      pseudonym: row.pseudonym,
      peran: row.peran,
    },
    instrument: {
      id: instrument.id,
      title: instrument.title,
      description: instrument.description,
      questions: instrument.questions,
    },
    existing: existing
      ? {
          status: existing.status,
          locked: Boolean(existing.locked),
          consent: Boolean(existing.consent),
          answers: existing.locked ? undefined : JSON.parse(existing.answers_json || "{}"),
        }
      : null,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  ensureSeeded();
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();

  const row = db
    .prepare(
      `SELECT i.id, i.status_wawancara, t.active
       FROM interview_tokens t
       JOIN informants i ON i.id = t.informant_id
       WHERE t.token = ?`,
    )
    .get(token) as { id: number; status_wawancara: string; active: number } | undefined;

  if (!row || !row.active) {
    return NextResponse.json({ error: "Tautan tidak valid atau nonaktif" }, { status: 404 });
  }

  if (!body.consent) {
    return NextResponse.json(
      { error: "Persetujuan (informed consent) wajib dicentang" },
      { status: 400 },
    );
  }

  const locked = db
    .prepare(
      `SELECT id FROM interview_responses WHERE informant_id = ? AND locked = 1 LIMIT 1`,
    )
    .get(row.id);
  if (locked) {
    return NextResponse.json(
      { error: "Respons sudah dikunci peneliti dan tidak dapat diubah" },
      { status: 403 },
    );
  }

  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const existing = db
    .prepare(
      `SELECT id FROM interview_responses WHERE informant_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(row.id) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE interview_responses SET
        consent = 1,
        answers_json = ?,
        status = 'submitted',
        submitted_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(JSON.stringify(answers), existing.id);
  } else {
    db.prepare(
      `INSERT INTO interview_responses (
        informant_id, token, consent, answers_json, status, submitted_at
      ) VALUES (?, ?, 1, ?, 'submitted', datetime('now'))`,
    ).run(row.id, token, JSON.stringify(answers));
  }

  db.prepare(
    `UPDATE informants SET status_wawancara = 'selesai', updated_at = datetime('now') WHERE id = ?`,
  ).run(row.id);

  return NextResponse.json({ ok: true });
}
