import { getDb } from "./db";
import { makeBerkasCode, maskPartyText } from "./anonymize";
import {
  getSippLocalConfig,
  searchSippLocalBht,
  type SippLocalCase,
} from "./sipp-local";

export type LocalSyncResult = {
  source: "sipp_local_mysql";
  database: string;
  host: string;
  keywords: string[];
  found: number;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  samples: Array<{
    nomor_perkara: string;
    jenis_perkara: string | null;
    status_perkara: string | null;
    tanggal_bht: string | null;
    action: "imported" | "updated" | "skipped";
  }>;
  note: string;
};

function splitKeywords(raw: string | string[]): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw;
  return [
    ...new Set(
      text
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function maskedParties(row: SippLocalCase): string {
  // Selalu mask secara bawaan untuk etika riset (proposal).
  const p1 = maskPartyText(row.pihak1_text ? `Pihak1: ${row.pihak1_text}` : "Disamarkan");
  const p2 = maskPartyText(row.pihak2_text ? `Pihak2: ${row.pihak2_text}` : "");
  return [p1, p2].filter(Boolean).join("; ") || "Disamarkan";
}

function statusFromLocal(row: SippLocalCase): string {
  if (row.tanggal_bht) {
    return row.proses_terakhir_text
      ? `BHT (${row.proses_terakhir_text})`
      : "BHT";
  }
  return row.proses_terakhir_text || row.tahapan_terakhir_text || "—";
}

function kehadiranFromVerstek(v: string | null): string | null {
  if (!v) return null;
  if (v.toUpperCase() === "Y") return "verstek";
  if (v.toUpperCase() === "T") return "hadir";
  return null;
}

function upsertLocalCase(row: SippLocalCase): "imported" | "updated" {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM cases WHERE nomor_perkara = ?")
    .get(row.nomor_perkara) as { id: number } | undefined;

  const year =
    Number(row.nomor_perkara.match(/\/(\d{4})\//)?.[1]) ||
    (row.tanggal_pendaftaran
      ? Number(String(row.tanggal_pendaftaran).slice(0, 4))
      : new Date().getFullYear());

  const payload = {
    nomor_perkara: row.nomor_perkara,
    jenis_perkara: row.jenis_perkara_nama || row.jenis_perkara_text,
    tanggal_register: row.tanggal_pendaftaran,
    status_perkara: statusFromLocal(row),
    para_pihak_masked: maskedParties(row),
    tahun: year,
    kehadiran: kehadiranFromVerstek(row.putusan_verstek),
    sipp_perkara_id: row.perkara_id,
    tanggal_putusan: row.tanggal_putusan,
    tanggal_minutasi: row.tanggal_minutasi,
    tanggal_bht: row.tanggal_bht,
    tahapan_text: row.tahapan_terakhir_text,
    proses_text: row.proses_terakhir_text,
    putusan_verstek: row.putusan_verstek,
    status_putusan: row.status_putusan_nama,
    amar_excerpt: row.amar_excerpt,
    nomor_akta_cerai: row.nomor_akta_cerai,
    tgl_akta_cerai: row.tgl_akta_cerai,
    sipp_local_json: JSON.stringify({
      perkara_id: row.perkara_id,
      jenis_perkara_text: row.jenis_perkara_text,
      tahapan_terakhir_id: row.tahapan_terakhir_id,
      proses_terakhir_id: row.proses_terakhir_id,
      tgl_penyerahan_akta_cerai: row.tgl_penyerahan_akta_cerai,
      jenis_cerai: row.jenis_cerai,
      pihak_dipublikasikan: row.pihak_dipublikasikan,
    }),
  };

  if (existing) {
    db.prepare(
      `UPDATE cases SET
        jenis_perkara = COALESCE(@jenis_perkara, jenis_perkara),
        tanggal_register = COALESCE(@tanggal_register, tanggal_register),
        status_perkara = @status_perkara,
        para_pihak_masked = @para_pihak_masked,
        tahun = COALESCE(@tahun, tahun),
        kehadiran = COALESCE(@kehadiran, kehadiran),
        sipp_perkara_id = @sipp_perkara_id,
        tanggal_putusan = @tanggal_putusan,
        tanggal_minutasi = @tanggal_minutasi,
        tanggal_bht = @tanggal_bht,
        tahapan_text = @tahapan_text,
        proses_text = @proses_text,
        putusan_verstek = @putusan_verstek,
        status_putusan = @status_putusan,
        amar_excerpt = @amar_excerpt,
        nomor_akta_cerai = @nomor_akta_cerai,
        tgl_akta_cerai = @tgl_akta_cerai,
        sipp_local_json = @sipp_local_json,
        sumber = 'sipp_local',
        updated_at = datetime('now')
      WHERE id = @id`,
    ).run({ ...payload, id: existing.id });
    return "updated";
  }

  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM cases WHERE tahun = ?").get(year) as {
      n: number;
    }
  ).n;
  const kode = makeBerkasCode(year, count + 1);
  db.prepare(
    `INSERT INTO cases (
      kode_berkas, nomor_perkara, jenis_perkara, tanggal_register, status_perkara,
      para_pihak_masked, sumber, tahun, kehadiran, coding_status,
      sipp_perkara_id, tanggal_putusan, tanggal_minutasi, tanggal_bht,
      tahapan_text, proses_text, putusan_verstek, status_putusan,
      amar_excerpt, nomor_akta_cerai, tgl_akta_cerai, sipp_local_json
    ) VALUES (
      @kode_berkas, @nomor_perkara, @jenis_perkara, @tanggal_register, @status_perkara,
      @para_pihak_masked, 'sipp_local', @tahun, @kehadiran, 'draft',
      @sipp_perkara_id, @tanggal_putusan, @tanggal_minutasi, @tanggal_bht,
      @tahapan_text, @proses_text, @putusan_verstek, @status_putusan,
      @amar_excerpt, @nomor_akta_cerai, @tgl_akta_cerai, @sipp_local_json
    )`,
  ).run({ ...payload, kode_berkas: kode });
  return "imported";
}

export async function syncSippLocalToWorkspace(opts: {
  keywords: string | string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyBht?: boolean;
  limit?: number;
  refreshExisting?: boolean;
}): Promise<LocalSyncResult> {
  const cfg = getSippLocalConfig();
  const keywords = splitKeywords(opts.keywords);
  if (!keywords.length) throw new Error("Minimal satu kata kunci");

  const rows = await searchSippLocalBht({
    keywords,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    onlyBht: opts.onlyBht !== false,
    limit: opts.limit ?? 500,
  });

  let imported = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  const samples: LocalSyncResult["samples"] = [];
  const refreshExisting = opts.refreshExisting !== false;

  const tx = getDb().transaction((items: SippLocalCase[]) => {
    for (const row of items) {
      if (!row.nomor_perkara) continue;
      const existing = getDb()
        .prepare("SELECT id FROM cases WHERE nomor_perkara = ?")
        .get(row.nomor_perkara);
      if (existing && !refreshExisting) {
        skippedDuplicates++;
        if (samples.length < 15) {
          samples.push({
            nomor_perkara: row.nomor_perkara,
            jenis_perkara: row.jenis_perkara_nama,
            status_perkara: statusFromLocal(row),
            tanggal_bht: row.tanggal_bht,
            action: "skipped",
          });
        }
        continue;
      }
      const action = upsertLocalCase(row);
      if (action === "imported") imported++;
      else {
        updated++;
        skippedDuplicates++;
      }
      if (samples.length < 15) {
        samples.push({
          nomor_perkara: row.nomor_perkara,
          jenis_perkara: row.jenis_perkara_nama,
          status_perkara: statusFromLocal(row),
          tanggal_bht: row.tanggal_bht,
          action,
        });
      }
    }
  });
  tx(rows);

  return {
    source: "sipp_local_mysql",
    database: cfg.database,
    host: cfg.host,
    keywords,
    found: rows.length,
    imported,
    updated,
    skippedDuplicates,
    samples,
    note:
      "Sumber: MariaDB/MySQL lokal (skema sipp32). Filter BHT: tanggal_bht TIDAK NULL " +
      "ATAU ada perkara_akta_cerai ATAU proses_terakhir_text mengandung Akta Cerai/BHT/Berkekuatan. " +
      "Nama pihak selalu disamarkan. WA-gateway asli tidak ditemukan di repo — mapping dari sipp32.sql.",
  };
}
