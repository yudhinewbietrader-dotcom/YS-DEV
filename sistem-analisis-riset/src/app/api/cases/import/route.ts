import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { makeBerkasCode, maskPartyText } from "@/lib/anonymize";
import { ensureSeeded } from "@/lib/seed";

type ImportRow = {
  nomor_perkara?: string;
  jenis_perkara?: string;
  tanggal_register?: string;
  status_perkara?: string;
  para_pihak?: string;
  para_pihak_masked?: string;
  sipp_detail_url?: string;
  tahun?: number;
  kode_berkas?: string;
};

function parseCsv(text: string): ImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    return {
      nomor_perkara: obj.nomor_perkara || obj.nomor || "",
      jenis_perkara: obj.jenis_perkara || obj.klasifikasi || "",
      tanggal_register: obj.tanggal_register || obj.tanggal || "",
      status_perkara: obj.status_perkara || obj.status || "",
      para_pihak: obj.para_pihak || obj.pihak || "",
      para_pihak_masked: obj.para_pihak_masked || "",
      sipp_detail_url: obj.sipp_detail_url || obj.detail_url || "",
      tahun: obj.tahun ? Number(obj.tahun) : undefined,
      kode_berkas: obj.kode_berkas || "",
    };
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function POST(req: Request) {
  ensureSeeded();
  const contentType = req.headers.get("content-type") || "";
  let rows: ImportRow[] = [];

  if (contentType.includes("application/json")) {
    const body = await req.json();
    rows = Array.isArray(body) ? body : body.rows || [];
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Unggah file CSV/JSON" }, { status: 400 });
    }
    const text = await file.text();
    if (file.name.endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    } else {
      rows = parseCsv(text);
    }
  }

  if (!rows.length) {
    return NextResponse.json({ error: "Tidak ada baris untuk diimpor" }, { status: 400 });
  }

  const db = getDb();
  let inserted = 0;
  let updated = 0;

  const tx = db.transaction(() => {
    for (const r of rows) {
      const nomor = (r.nomor_perkara || "").trim();
      if (!nomor && !r.kode_berkas) continue;
      const year =
        r.tahun ||
        Number(nomor.match(/\/(\d{4})\//)?.[1]) ||
        new Date().getFullYear();
      const pihak = maskPartyText(r.para_pihak_masked || r.para_pihak || "Disamarkan");

      const existing = nomor
        ? (db
            .prepare("SELECT id FROM cases WHERE nomor_perkara = ?")
            .get(nomor) as { id: number } | undefined)
        : undefined;

      if (existing) {
        db.prepare(
          `UPDATE cases SET
            jenis_perkara = COALESCE(?, jenis_perkara),
            tanggal_register = COALESCE(?, tanggal_register),
            status_perkara = COALESCE(?, status_perkara),
            para_pihak_masked = ?,
            sipp_detail_url = COALESCE(?, sipp_detail_url),
            sumber = 'import',
            updated_at = datetime('now')
          WHERE id = ?`,
        ).run(
          r.jenis_perkara || null,
          r.tanggal_register || null,
          r.status_perkara || null,
          pihak,
          r.sipp_detail_url || null,
          existing.id,
        );
        updated++;
      } else {
        const count = (
          db.prepare("SELECT COUNT(*) AS n FROM cases WHERE tahun = ?").get(year) as {
            n: number;
          }
        ).n;
        const kode = r.kode_berkas || makeBerkasCode(year, count + 1);
        db.prepare(
          `INSERT INTO cases (
            kode_berkas, nomor_perkara, jenis_perkara, tanggal_register,
            status_perkara, para_pihak_masked, sipp_detail_url, sumber, tahun, coding_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'import', ?, 'draft')`,
        ).run(
          kode,
          nomor || null,
          r.jenis_perkara || null,
          r.tanggal_register || null,
          r.status_perkara || null,
          pihak,
          r.sipp_detail_url || null,
          year,
        );
        inserted++;
      }
    }
  });

  tx();
  return NextResponse.json({ inserted, updated, total: rows.length });
}
