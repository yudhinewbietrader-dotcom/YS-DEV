import { getDb } from "./db";
import { makeBerkasCode, maskPartyText } from "./anonymize";
import {
  applyModusSuggestionsToCase,
  detectModusFromFields,
  type ModusDetectFields,
} from "./modus-detect";
import { assessDataQuality } from "./data-quality";
import {
  getSippLocalConfig,
  searchSippLocalBht,
  type BhtMode,
  type DateField,
  type SippLocalCase,
} from "./sipp-local";
import { nominalsToRingkas } from "./sipp-nominals";
import { getPdfBasePath, getPdfBaseUrl } from "./sipp-pdf";

export type LocalSyncResult = {
  source: "sipp_local_mysql";
  database: string;
  host: string;
  keywords: string[];
  bhtMode: BhtMode;
  requireNafkah: boolean;
  dateField: DateField;
  found: number;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  withTanggalBht: number;
  withPdf: number;
  withNominals: number;
  modusDetect: {
    scanned: number;
    withSuggestions: number;
    withoutSignal: number;
    softApplied: number;
    skippedConfirmed: number;
  };
  samples: Array<{
    nomor_perkara: string;
    jenis_perkara: string | null;
    status_perkara: string | null;
    tanggal_bht: string | null;
    bht_basis: string;
    nafkah_signal: boolean;
    nominal_ringkas?: string;
    pdf_count?: number;
    action: "imported" | "updated" | "skipped";
    modus_suggested?: string[];
    objek_suggested?: string[];
  }>;
  note: string;
  pdf_env: { base_path: string; base_url: string };
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

function detectFieldsFromLocal(row: SippLocalCase): ModusDetectFields {
  return {
    nomor_perkara: row.nomor_perkara,
    amar_excerpt: row.amar_excerpt,
    amar_char_count: row.amar_char_count,
    amar_truncated: row.amar_truncated,
    petitum_excerpt: row.petitum_excerpt,
    posita_excerpt: row.posita_excerpt,
    pertimbangan_excerpt: row.pertimbangan_excerpt,
    proses_text: row.proses_terakhir_text,
    tahapan_text: row.tahapan_terakhir_text,
    jenis_perkara: row.jenis_perkara_nama,
    jenis_perkara_text: row.jenis_perkara_text,
    putusan_verstek: row.putusan_verstek,
    status_putusan: row.status_putusan_nama,
    status_perkara: statusFromLocal(row),
    tanggal_putusan: row.tanggal_putusan,
    tanggal_bht: row.tanggal_bht,
    bht_basis: row.bht_basis,
    nomor_akta_cerai: row.nomor_akta_cerai,
    jenis_cerai: row.jenis_cerai,
    pekerjaan_pihak1: row.pekerjaan_pihak1,
    pekerjaan_pihak2: row.pekerjaan_pihak2,
    anak_jumlah_nafkah_sum: row.anak_jumlah_nafkah_sum,
    anak_count: row.anak_count,
    nafkah_signal: row.nafkah_signal,
    kehadiran: kehadiranFromVerstek(row.putusan_verstek),
  };
}

function primaryPdfUrl(row: SippLocalCase): string | null {
  for (const r of row.pdf_refs) {
    if (r.url) return r.url;
  }
  return null;
}

function upsertLocalCase(row: SippLocalCase): {
  action: "imported" | "updated";
  caseId: number;
} {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id, coding_status, nominal_ringkas FROM cases WHERE nomor_perkara = ?",
    )
    .get(row.nomor_perkara) as
    | { id: number; coding_status: string; nominal_ringkas: string | null }
    | undefined;

  const year =
    Number(row.nomor_perkara.match(/\/(\d{4})\//)?.[1]) ||
    (row.tanggal_putusan
      ? Number(String(row.tanggal_putusan).slice(0, 4))
      : row.tanggal_pendaftaran
        ? Number(String(row.tanggal_pendaftaran).slice(0, 4))
        : new Date().getFullYear());

  const ringkas = nominalsToRingkas(row.nominals);
  const quality = assessDataQuality({
    nomor_perkara: row.nomor_perkara,
    jenis_perkara: row.jenis_perkara_nama || row.jenis_perkara_text,
    tanggal_putusan: row.tanggal_putusan,
    tanggal_bht: row.tanggal_bht,
    bht_basis: row.bht_basis,
    putusan_verstek: row.putusan_verstek,
    amar_excerpt: row.amar_excerpt,
    amar_char_count: row.amar_char_count,
    amar_truncated: row.amar_truncated,
    petitum_excerpt: row.petitum_excerpt,
    posita_excerpt: row.posita_excerpt,
    pertimbangan_excerpt: row.pertimbangan_excerpt,
    pekerjaan_pihak1: row.pekerjaan_pihak1,
    pekerjaan_pihak2: row.pekerjaan_pihak2,
    anak_jumlah_nafkah_sum: row.anak_jumlah_nafkah_sum,
    anak_count: row.anak_count,
    nafkah_signal: row.nafkah_signal,
    proses_text: row.proses_terakhir_text,
    tahapan_text: row.tahapan_terakhir_text,
    nomor_akta_cerai: row.nomor_akta_cerai,
    nominals: row.nominals,
    pdf_refs: row.pdf_refs,
  });

  const localJson = {
    perkara_id: row.perkara_id,
    jenis_perkara_text: row.jenis_perkara_text,
    tahapan_terakhir_id: row.tahapan_terakhir_id,
    proses_terakhir_id: row.proses_terakhir_id,
    tgl_penyerahan_akta_cerai: row.tgl_penyerahan_akta_cerai,
    jenis_cerai: row.jenis_cerai,
    pihak_dipublikasikan: row.pihak_dipublikasikan,
    pekerjaan_pihak1: row.pekerjaan_pihak1,
    pekerjaan_pihak2: row.pekerjaan_pihak2,
    petitum_excerpt: row.petitum_excerpt,
    posita_excerpt: row.posita_excerpt,
    pertimbangan_excerpt: row.pertimbangan_excerpt,
    amar_char_count: row.amar_char_count,
    amar_truncated: row.amar_truncated,
    anak_count: row.anak_count,
    anak_jumlah_nafkah_sum: row.anak_jumlah_nafkah_sum,
    bht_basis: row.bht_basis,
    nafkah_signal: row.nafkah_signal,
    amar_putusan_dok: row.amar_putusan_dok,
    amar_putusan_anonimisasi_dok: row.amar_putusan_anonimisasi_dok,
    pdf_refs: row.pdf_refs,
    nominals: row.nominals,
    schema_probe: row.schema_probe,
  };

  const shouldFillNominalRingkas =
    !existing ||
    existing.coding_status !== "coded" ||
    !existing.nominal_ringkas;

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
    petitum_excerpt: row.petitum_excerpt,
    pertimbangan_excerpt: row.pertimbangan_excerpt,
    bht_basis: row.bht_basis,
    sipp_local_json: JSON.stringify(localJson),
    nominal_iddah: row.nominals.iddah?.amount ?? null,
    nominal_mutah: row.nominals.mutah?.amount ?? null,
    nominal_hadhanah: row.nominals.hadhanah?.amount ?? null,
    nominal_madhiyah: row.nominals.madhiyah?.amount ?? null,
    nominal_json: JSON.stringify(row.nominals),
    amar_putusan_dok: row.amar_putusan_dok,
    amar_putusan_anonimisasi_dok: row.amar_putusan_anonimisasi_dok,
    putusan_pdf_json: JSON.stringify(row.pdf_refs),
    putusan_pdf_url: primaryPdfUrl(row),
    data_quality_json: JSON.stringify(quality),
    nominal_ringkas: shouldFillNominalRingkas
      ? ringkas || null
      : existing?.nominal_ringkas || ringkas || null,
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
        petitum_excerpt = @petitum_excerpt,
        pertimbangan_excerpt = @pertimbangan_excerpt,
        bht_basis = @bht_basis,
        sipp_local_json = @sipp_local_json,
        nominal_iddah = @nominal_iddah,
        nominal_mutah = @nominal_mutah,
        nominal_hadhanah = @nominal_hadhanah,
        nominal_madhiyah = @nominal_madhiyah,
        nominal_json = @nominal_json,
        amar_putusan_dok = @amar_putusan_dok,
        amar_putusan_anonimisasi_dok = @amar_putusan_anonimisasi_dok,
        putusan_pdf_json = @putusan_pdf_json,
        putusan_pdf_url = @putusan_pdf_url,
        data_quality_json = @data_quality_json,
        nominal_ringkas = COALESCE(@nominal_ringkas, nominal_ringkas),
        sumber = 'sipp_local',
        updated_at = datetime('now')
      WHERE id = @id`,
    ).run({ ...payload, id: existing.id });
    return { action: "updated", caseId: existing.id };
  }

  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM cases WHERE tahun = ?").get(year) as {
      n: number;
    }
  ).n;
  const kode = makeBerkasCode(year, count + 1);
  const info = db
    .prepare(
      `INSERT INTO cases (
      kode_berkas, nomor_perkara, jenis_perkara, tanggal_register, status_perkara,
      para_pihak_masked, sumber, tahun, kehadiran, coding_status,
      sipp_perkara_id, tanggal_putusan, tanggal_minutasi, tanggal_bht,
      tahapan_text, proses_text, putusan_verstek, status_putusan,
      amar_excerpt, nomor_akta_cerai, tgl_akta_cerai, sipp_local_json,
      petitum_excerpt, pertimbangan_excerpt, bht_basis,
      nominal_iddah, nominal_mutah, nominal_hadhanah, nominal_madhiyah, nominal_json,
      amar_putusan_dok, amar_putusan_anonimisasi_dok, putusan_pdf_json, putusan_pdf_url,
      data_quality_json, nominal_ringkas
    ) VALUES (
      @kode_berkas, @nomor_perkara, @jenis_perkara, @tanggal_register, @status_perkara,
      @para_pihak_masked, 'sipp_local', @tahun, @kehadiran, 'draft',
      @sipp_perkara_id, @tanggal_putusan, @tanggal_minutasi, @tanggal_bht,
      @tahapan_text, @proses_text, @putusan_verstek, @status_putusan,
      @amar_excerpt, @nomor_akta_cerai, @tgl_akta_cerai, @sipp_local_json,
      @petitum_excerpt, @pertimbangan_excerpt, @bht_basis,
      @nominal_iddah, @nominal_mutah, @nominal_hadhanah, @nominal_madhiyah, @nominal_json,
      @amar_putusan_dok, @amar_putusan_anonimisasi_dok, @putusan_pdf_json, @putusan_pdf_url,
      @data_quality_json, @nominal_ringkas
    )`,
    )
    .run({ ...payload, kode_berkas: kode });
  return { action: "imported", caseId: Number(info.lastInsertRowid) };
}

export async function syncSippLocalToWorkspace(opts: {
  keywords: string | string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyBht?: boolean;
  bhtMode?: BhtMode;
  requireNafkah?: boolean;
  dateField?: DateField;
  limit?: number;
  refreshExisting?: boolean;
}): Promise<LocalSyncResult> {
  const cfg = getSippLocalConfig();
  const keywords = splitKeywords(opts.keywords);
  if (!keywords.length) throw new Error("Minimal satu kata kunci");

  const bhtMode: BhtMode =
    opts.bhtMode || (opts.onlyBht === false ? "none" : "strict");
  const requireNafkah = opts.requireNafkah !== false;
  const dateField: DateField = opts.dateField || "putusan";

  const rows = await searchSippLocalBht({
    keywords,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    bhtMode,
    requireNafkah,
    dateField,
    limit: opts.limit ?? 500,
  });

  let imported = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  let withTanggalBht = 0;
  let withPdf = 0;
  let withNominals = 0;
  const samples: LocalSyncResult["samples"] = [];
  const refreshExisting = opts.refreshExisting !== false;

  const modusDetect = {
    scanned: 0,
    withSuggestions: 0,
    withoutSignal: 0,
    softApplied: 0,
    skippedConfirmed: 0,
  };

  const tx = getDb().transaction((items: SippLocalCase[]) => {
    for (const row of items) {
      if (!row.nomor_perkara) continue;
      if (row.tanggal_bht) withTanggalBht++;
      if (row.pdf_refs.length) withPdf++;
      if (row.nominals.items.length) withNominals++;
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
            bht_basis: row.bht_basis,
            nafkah_signal: row.nafkah_signal,
            nominal_ringkas: nominalsToRingkas(row.nominals) || undefined,
            pdf_count: row.pdf_refs.length,
            action: "skipped",
          });
        }
        continue;
      }
      const { action, caseId } = upsertLocalCase(row);
      if (action === "imported") imported++;
      else {
        updated++;
        skippedDuplicates++;
      }

      const fields = detectFieldsFromLocal(row);
      const detect = detectModusFromFields(fields, {
        source: "sipp_local_sync_v3",
      });
      const apply = applyModusSuggestionsToCase(caseId, detect, fields);
      modusDetect.scanned++;
      if (detect.suggestions.length || detect.objek_suggestions.length) {
        modusDetect.withSuggestions++;
      } else modusDetect.withoutSignal++;
      if (apply.appliedSoft) modusDetect.softApplied++;
      if (apply.skippedConfirmed) modusDetect.skippedConfirmed++;

      if (samples.length < 15) {
        samples.push({
          nomor_perkara: row.nomor_perkara,
          jenis_perkara: row.jenis_perkara_nama,
          status_perkara: statusFromLocal(row),
          tanggal_bht: row.tanggal_bht,
          bht_basis: row.bht_basis,
          nafkah_signal: row.nafkah_signal,
          nominal_ringkas: nominalsToRingkas(row.nominals) || undefined,
          pdf_count: row.pdf_refs.length,
          action,
          modus_suggested: detect.suggestions.map((s) => s.id),
          objek_suggested: detect.objek_suggestions.map((s) => s.id),
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
    bhtMode,
    requireNafkah,
    dateField,
    found: rows.length,
    imported,
    updated,
    skippedDuplicates,
    withTanggalBht,
    withPdf,
    withNominals,
    modusDetect,
    samples,
    pdf_env: {
      base_path: getPdfBasePath(),
      base_url: getPdfBaseUrl(),
    },
    note:
      "Filter riset: jenis (keyword) + putusan ada + " +
      (bhtMode === "strict"
        ? "tanggal_bht WAJIB (ground truth)"
        : bhtMode === "prefer"
          ? "BHT prefer tanggal_bht, proxy akta/proses ditandai"
          : "tanpa filter BHT") +
      (requireNafkah
        ? "; wajib sinyal nafkah di amar/petitum/posita atau anak.jumlah_nafkah"
        : "") +
      `. Tanggal filter: ${dateField}. ` +
      "Nominal: anak dari perkara_anak_pihak.jumlah_nafkah; iddah/mut'ah dari kolom typed (jika probe menemukan) atau parse amar — DB mengalahkan regex. " +
      "PDF: path relatif di amar_putusan_dok (+ anon / perkara_dokumen / dirput); set SIPP_PDF_BASE_URL agar link bisa dibuka di LAN satker.",
  };
}
