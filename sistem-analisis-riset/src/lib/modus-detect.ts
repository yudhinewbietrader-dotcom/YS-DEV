/**
 * Usulan koding berbasis sinyal SIPP yang relatif andal.
 *
 * Hanya usulkan bila field mendukung:
 * - verstek ← perkara_putusan.putusan_verstek = Y
 * - informal / pmi / wiraswasta ← pihak.pekerjaan (bukan tebakan negara di amar)
 * - pengakuan_tidak_mampu / slip_gaji ← frasa kuat di amar/pertimbangan
 * - objek nafkah ← kata iddah/mut'ah/hadhanah di amar/petitum
 * - ex_officio ← frasa eksplisit di teks
 *
 * TIDAK mengusulkan gaya_hidup / penyembunyian_aset dari kata generik
 * (harta bersama, mobil) — terlalu banyak false positive.
 *
 * Tidak menimpa koding coded / modus yang sudah diisi peneliti.
 */

import type { ModusId } from "./coding-taxonomy";
import { MODUS_ASIMETRI } from "./coding-taxonomy";
import {
  assessDataQuality,
  detectObjekNafkahSuggestions,
  detectResponsSuggestions,
  type DataQualityReport,
} from "./data-quality";
import {
  getDb,
  parseJsonArray,
  parseJsonObject,
  type CaseRow,
} from "./db";

export type ModusConfidence = "low" | "med";

export type ModusSuggestion = {
  id: ModusId;
  label: string;
  confidence: ModusConfidence;
  evidence: string;
  field: string;
};

export type ObjekSuggestion = {
  id: string;
  label: string;
  confidence: ModusConfidence;
  evidence: string;
  field: string;
};

export type ModusDetectResult = {
  suggestions: ModusSuggestion[];
  objek_suggestions: ObjekSuggestion[];
  respons_suggestions: ObjekSuggestion[];
  quality: DataQualityReport;
  empty_reason: string | null;
  detected_at: string;
  source: string;
};

export type ModusDetectFields = {
  nomor_perkara?: string | null;
  amar_excerpt?: string | null;
  amar_char_count?: number | null;
  amar_truncated?: boolean | null;
  petitum_excerpt?: string | null;
  posita_excerpt?: string | null;
  pertimbangan_excerpt?: string | null;
  proses_text?: string | null;
  tahapan_text?: string | null;
  jenis_perkara?: string | null;
  jenis_perkara_text?: string | null;
  putusan_verstek?: string | null;
  status_putusan?: string | null;
  status_perkara?: string | null;
  tanggal_putusan?: string | null;
  tanggal_bht?: string | null;
  bht_basis?: string | null;
  nomor_akta_cerai?: string | null;
  jenis_cerai?: string | null;
  pekerjaan_pihak1?: string | null;
  pekerjaan_pihak2?: string | null;
  anak_jumlah_nafkah_sum?: number | null;
  anak_count?: number | null;
  nafkah_signal?: boolean | null;
  kehadiran?: string | null;
  bukti_pendapatan?: string | null;
  indikasi_asimetri?: string | null;
  evidence_quotes?: string | null;
};

const LABEL: Record<string, string> = Object.fromEntries(
  MODUS_ASIMETRI.map((m) => [m.id, m.label]),
);

function snippetAround(haystack: string, matchIndex: number, len = 100): string {
  const start = Math.max(0, matchIndex - 35);
  const end = Math.min(haystack.length, matchIndex + len);
  let s = haystack.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < haystack.length) s = s + "…";
  return s;
}

function findMatch(
  text: string,
  patterns: RegExp[],
): { evidence: string } | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m.index != null) {
      return { evidence: snippetAround(text, m.index) };
    }
  }
  return null;
}

/** Pekerjaan-only patterns (hindari false positive dari amar) */
const JOB_PMI = [
  /\bpmi\b/i,
  /\btki\b/i,
  /\bburuh\s+migran\b/i,
  /\bpekerja\s+migran\b/i,
];
const JOB_WIRASWASTA = [
  /\bwiraswasta\b/i,
  /\bwirausaha\b/i,
  /\busaha\s+sendiri\b/i,
  /\bpedagang\b/i,
  /\bpengusaha\b/i,
];
const JOB_INFORMAL = [
  /\bpetani\b/i,
  /\bburuh\b/i,
  /\bnelayan\b/i,
  /\bojek\b/i,
  /\bserabutan\b/i,
  /\bharian\b/i,
  /\btukang\b/i,
  /\bkuli\b/i,
  /\bsupir\b/i,
  /\bsontoh\b/i,
  /\binformal\b/i,
];

const AMAR_TIDAK_MAMPU = [
  /\bpengakuan\s+tidak\s+mampu\b/i,
  /\bmengaku(i)?\s+(bahwa\s+)?(ia\s+)?tidak\s+mampu\b/i,
  /\btidak\s+mampu\s+(membayar|memberi|memberikan)\b/i,
  /\bsktm\b/i,
];
const AMAR_SLIP = [
  /\bslip\s+gaji\s+palsu\b/i,
  /\bgaji\s+palsu\b/i,
  /\bdokumen\s+palsu\b/i,
  /\bslip\s+gaji\b/i,
];
/** Hanya frasa kuat — bukan "harta bersama" generik */
const AMAR_ASET_KUAT = [
  /\bmenyembunyikan\s+(harta|aset|penghasilan)\b/i,
  /\bpenyembunyian\s+(harta|aset)\b/i,
  /\btadlis\b/i,
  /\bmoral\s+hazard\b/i,
];

export function detectModusFromFields(
  fields: ModusDetectFields,
  opts?: { source?: string },
): ModusDetectResult {
  const source = opts?.source || "sipp_heuristic_v2";
  const detected_at = new Date().toISOString();
  const found = new Map<ModusId, ModusSuggestion>();

  const job = `${fields.pekerjaan_pihak1 || ""} ${fields.pekerjaan_pihak2 || ""}`.trim();
  const legalText = [
    fields.amar_excerpt,
    fields.pertimbangan_excerpt,
    fields.petitum_excerpt,
    fields.evidence_quotes,
  ]
    .filter(Boolean)
    .join("\n");

  const v = (fields.putusan_verstek || "").toUpperCase().trim();
  if (v === "Y") {
    found.set("verstek", {
      id: "verstek",
      label: LABEL.verstek,
      confidence: "med",
      evidence: "putusan_verstek=Y (perkara_putusan)",
      field: "perkara_putusan.putusan_verstek",
    });
  }

  if (job) {
    const pmi = findMatch(job, JOB_PMI);
    if (pmi) {
      found.set("pmi", {
        id: "pmi",
        label: LABEL.pmi,
        confidence: "med",
        evidence: pmi.evidence,
        field: "pihak.pekerjaan",
      });
    }
    const wir = findMatch(job, JOB_WIRASWASTA);
    if (wir) {
      found.set("wiraswasta", {
        id: "wiraswasta",
        label: LABEL.wiraswasta,
        confidence: "med",
        evidence: wir.evidence,
        field: "pihak.pekerjaan",
      });
    }
    const inf = findMatch(job, JOB_INFORMAL);
    if (inf && !found.has("pmi")) {
      found.set("informal", {
        id: "informal",
        label: LABEL.informal,
        confidence: "med",
        evidence: inf.evidence,
        field: "pihak.pekerjaan",
      });
    }
  }

  if (legalText) {
    const tm = findMatch(legalText, AMAR_TIDAK_MAMPU);
    if (tm) {
      found.set("pengakuan_tidak_mampu", {
        id: "pengakuan_tidak_mampu",
        label: LABEL.pengakuan_tidak_mampu,
        confidence: "med",
        evidence: tm.evidence,
        field: "amar/pertimbangan",
      });
    }
    const slip = findMatch(legalText, AMAR_SLIP);
    if (slip) {
      found.set("slip_gaji", {
        id: "slip_gaji",
        label: LABEL.slip_gaji,
        confidence: /palsu/i.test(slip.evidence) ? "med" : "low",
        evidence: slip.evidence,
        field: "amar/pertimbangan",
      });
    }
    const aset = findMatch(legalText, AMAR_ASET_KUAT);
    if (aset) {
      found.set("penyembunyian_aset", {
        id: "penyembunyian_aset",
        label: LABEL.penyembunyian_aset,
        confidence: "low",
        evidence: aset.evidence,
        field: "amar/pertimbangan",
      });
    }
  }

  const suggestions = [...found.values()].sort((a, b) => {
    const conf = (c: ModusConfidence) => (c === "med" ? 0 : 1);
    return conf(a.confidence) - conf(b.confidence) || a.id.localeCompare(b.id);
  });

  const objek_suggestions = detectObjekNafkahSuggestions(
    `${fields.amar_excerpt || ""}\n${fields.petitum_excerpt || ""}`,
  );
  if (
    fields.anak_jumlah_nafkah_sum != null &&
    Number(fields.anak_jumlah_nafkah_sum) > 0 &&
    !objek_suggestions.some((o) => o.id === "hadhanah")
  ) {
    objek_suggestions.push({
      id: "hadhanah",
      label: "Nafkah anak / hadhanah",
      confidence: "med",
      evidence: `perkara_anak_pihak.jumlah_nafkah sum=${fields.anak_jumlah_nafkah_sum}`,
      field: "perkara_anak_pihak.jumlah_nafkah",
    });
  }

  const respons_suggestions = detectResponsSuggestions(legalText);

  const quality = assessDataQuality({
    nomor_perkara: fields.nomor_perkara,
    jenis_perkara: fields.jenis_perkara,
    tanggal_putusan: fields.tanggal_putusan,
    tanggal_bht: fields.tanggal_bht,
    bht_basis: fields.bht_basis,
    putusan_verstek: fields.putusan_verstek,
    amar_excerpt: fields.amar_excerpt,
    amar_char_count: fields.amar_char_count,
    amar_truncated: fields.amar_truncated,
    petitum_excerpt: fields.petitum_excerpt,
    posita_excerpt: fields.posita_excerpt,
    pertimbangan_excerpt: fields.pertimbangan_excerpt,
    pekerjaan_pihak1: fields.pekerjaan_pihak1,
    pekerjaan_pihak2: fields.pekerjaan_pihak2,
    anak_jumlah_nafkah_sum: fields.anak_jumlah_nafkah_sum,
    anak_count: fields.anak_count,
    nafkah_signal: fields.nafkah_signal,
    proses_text: fields.proses_text,
    tahapan_text: fields.tahapan_text,
    nomor_akta_cerai: fields.nomor_akta_cerai,
  });

  const empty_reason =
    suggestions.length === 0 && objek_suggestions.length === 0
      ? quality.has_verstek_flag || quality.has_pekerjaan
        ? "belum ada usulan andal — lengkapi dari putusan (tadlis/gaya hidup jarang di metadata SIPP)"
        : "belum terdeteksi — lengkapi manual / unggah putusan"
      : null;

  return {
    suggestions,
    objek_suggestions,
    respons_suggestions,
    quality,
    empty_reason,
    detected_at,
    source,
  };
}

export function fieldsFromCaseRow(row: CaseRow): ModusDetectFields {
  let local: Record<string, unknown> = {};
  try {
    local = row.sipp_local_json
      ? (JSON.parse(row.sipp_local_json) as Record<string, unknown>)
      : {};
  } catch {
    local = {};
  }
  const str = (k: string) =>
    typeof local[k] === "string" ? (local[k] as string) : null;
  const num = (k: string) =>
    typeof local[k] === "number" ? (local[k] as number) : null;

  return {
    nomor_perkara: row.nomor_perkara,
    amar_excerpt: row.amar_excerpt,
    amar_char_count: num("amar_char_count") ?? row.amar_excerpt?.length ?? 0,
    amar_truncated: local.amar_truncated === true,
    petitum_excerpt: str("petitum_excerpt") || row.petitum_excerpt || null,
    posita_excerpt: str("posita_excerpt"),
    pertimbangan_excerpt:
      str("pertimbangan_excerpt") || row.pertimbangan_excerpt || null,
    proses_text: row.proses_text,
    tahapan_text: row.tahapan_text,
    jenis_perkara: row.jenis_perkara,
    jenis_perkara_text: str("jenis_perkara_text"),
    putusan_verstek: row.putusan_verstek,
    status_putusan: row.status_putusan,
    status_perkara: row.status_perkara,
    tanggal_putusan: row.tanggal_putusan,
    tanggal_bht: row.tanggal_bht,
    bht_basis: str("bht_basis") || row.bht_basis || null,
    nomor_akta_cerai: row.nomor_akta_cerai,
    jenis_cerai: str("jenis_cerai"),
    pekerjaan_pihak1: str("pekerjaan_pihak1"),
    pekerjaan_pihak2: str("pekerjaan_pihak2"),
    anak_jumlah_nafkah_sum: num("anak_jumlah_nafkah_sum"),
    anak_count: num("anak_count"),
    nafkah_signal: local.nafkah_signal === true,
    kehadiran: row.kehadiran,
    bukti_pendapatan: row.bukti_pendapatan,
    indikasi_asimetri: row.indikasi_asimetri,
    evidence_quotes: row.evidence_quotes,
  };
}

export function inferStatusPekerjaan(
  fields: ModusDetectFields,
  suggestions: ModusSuggestion[],
): string | null {
  const fromJob = suggestions.filter((s) => s.field === "pihak.pekerjaan");
  if (fromJob.some((s) => s.id === "pmi")) return "pmi";
  if (fromJob.some((s) => s.id === "wiraswasta")) return "wiraswasta";
  if (fromJob.some((s) => s.id === "informal")) return "informal";
  const job = `${fields.pekerjaan_pihak1 || ""} ${fields.pekerjaan_pihak2 || ""}`.toLowerCase();
  if (/\basn\b|\bpns\b|karyawan|pegawai\s+negeri/.test(job)) return "asn";
  return null;
}

/**
 * Soft-isi hanya suggestion confidence=med dari field andal.
 * Objek nafkah soft-isi jika checklist objek kosong.
 */
export function applyModusSuggestionsToCase(
  caseId: number,
  result: ModusDetectResult,
  fields?: ModusDetectFields,
): {
  appliedSoft: boolean;
  suggestionCount: number;
  skippedConfirmed: boolean;
} {
  const db = getDb();
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as
    | CaseRow
    | undefined;
  if (!row) {
    return { appliedSoft: false, suggestionCount: 0, skippedConfirmed: false };
  }

  const existingModus = parseJsonArray(row.modus_asimetri_json);
  const existingObjek = parseJsonArray(row.objek_nafkah_json);
  const isCoded = row.coding_status === "coded";
  const hasConfirmedModus = isCoded || existingModus.length > 0;
  const payload = JSON.stringify(result);
  const qualityJson = JSON.stringify(result.quality);

  const pekerjaanHint = fields
    ? inferStatusPekerjaan(fields, result.suggestions)
    : null;

  const medIds = result.suggestions
    .filter((s) => s.confidence === "med")
    .map((s) => s.id);
  const objekIds = result.objek_suggestions
    .filter((s) => s.confidence === "med")
    .map((s) => s.id);

  if (hasConfirmedModus) {
    db.prepare(
      `UPDATE cases SET
        modus_suggestions_json = @payload,
        data_quality_json = @quality,
        updated_at = datetime('now')
      WHERE id = @id`,
    ).run({ payload, quality: qualityJson, id: caseId });
    return {
      appliedSoft: false,
      suggestionCount: result.suggestions.length,
      skippedConfirmed: true,
    };
  }

  const softModus = medIds;
  const softObjek =
    existingObjek.length === 0 && !isCoded ? objekIds : existingObjek;

  db.prepare(
    `UPDATE cases SET
      modus_suggestions_json = @payload,
      data_quality_json = @quality,
      modus_asimetri_json = @modus,
      objek_nafkah_json = @objek,
      status_pekerjaan = COALESCE(NULLIF(status_pekerjaan, ''), @pekerjaan),
      indikasi_asimetri = CASE
        WHEN indikasi_asimetri IS NULL OR trim(indikasi_asimetri) = '' THEN @indikasi
        ELSE indikasi_asimetri
      END,
      updated_at = datetime('now')
    WHERE id = @id`,
  ).run({
    payload,
    quality: qualityJson,
    modus: JSON.stringify(softModus),
    objek: JSON.stringify(softObjek),
    pekerjaan: pekerjaanHint,
    indikasi:
      result.suggestions.length > 0
        ? `Usulan andal (SIPP): ${result.suggestions
            .map((s) => `${s.label} [${s.confidence}/${s.field}] — ${s.evidence}`)
            .join("; ")}`
        : result.empty_reason,
    id: caseId,
  });

  return {
    appliedSoft: softModus.length > 0 || softObjek.length > 0,
    suggestionCount: result.suggestions.length,
    skippedConfirmed: false,
  };
}

export function detectAndApplyForCase(caseId: number): {
  result: ModusDetectResult;
  appliedSoft: boolean;
  skippedConfirmed: boolean;
} {
  const db = getDb();
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(caseId) as
    | CaseRow
    | undefined;
  if (!row) throw new Error(`Kasus #${caseId} tidak ditemukan`);
  const fields = fieldsFromCaseRow(row);
  const result = detectModusFromFields(fields, { source: "case_redetect" });
  const apply = applyModusSuggestionsToCase(caseId, result, fields);
  return {
    result,
    appliedSoft: apply.appliedSoft,
    skippedConfirmed: apply.skippedConfirmed,
  };
}

export type BulkDetectSummary = {
  scanned: number;
  withSuggestions: number;
  withoutSignal: number;
  softApplied: number;
  skippedConfirmed: number;
};

export function bulkDetectModus(opts?: {
  onlyDraft?: boolean;
  onlyEmptyModus?: boolean;
  limit?: number;
}): BulkDetectSummary {
  const db = getDb();
  const onlyDraft = opts?.onlyDraft !== false;
  const onlyEmpty = opts?.onlyEmptyModus === true;
  const limit = Math.max(1, Math.min(opts?.limit ?? 5000, 10000));

  let sql = "SELECT id FROM cases";
  const clauses: string[] = [];
  if (onlyDraft) clauses.push("coding_status = 'draft'");
  if (onlyEmpty) {
    clauses.push(
      "(modus_asimetri_json IS NULL OR modus_asimetri_json = '' OR modus_asimetri_json = '[]')",
    );
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += ` ORDER BY id DESC LIMIT ${limit}`;

  const ids = (db.prepare(sql).all() as Array<{ id: number }>).map((r) => r.id);
  let withSuggestions = 0;
  let withoutSignal = 0;
  let softApplied = 0;
  let skippedConfirmed = 0;

  const tx = db.transaction((caseIds: number[]) => {
    for (const id of caseIds) {
      const { result, appliedSoft, skippedConfirmed: skipped } =
        detectAndApplyForCase(id);
      if (result.suggestions.length || result.objek_suggestions.length) {
        withSuggestions++;
      } else withoutSignal++;
      if (appliedSoft) softApplied++;
      if (skipped) skippedConfirmed++;
    }
  });
  tx(ids);

  return {
    scanned: ids.length,
    withSuggestions,
    withoutSignal,
    softApplied,
    skippedConfirmed,
  };
}

export function parseModusSuggestions(
  raw: string | null | undefined,
): ModusDetectResult | null {
  if (!raw) return null;
  const obj = parseJsonObject(raw);
  if (!obj || typeof obj !== "object") return null;
  const suggestions = Array.isArray(obj.suggestions)
    ? (obj.suggestions as ModusSuggestion[])
    : [];
  return {
    suggestions,
    objek_suggestions: Array.isArray(obj.objek_suggestions)
      ? (obj.objek_suggestions as ObjekSuggestion[])
      : [],
    respons_suggestions: Array.isArray(obj.respons_suggestions)
      ? (obj.respons_suggestions as ObjekSuggestion[])
      : [],
    quality: (obj.quality as DataQualityReport) || assessDataQuality({}),
    empty_reason:
      typeof obj.empty_reason === "string" ? obj.empty_reason : null,
    detected_at:
      typeof obj.detected_at === "string"
        ? obj.detected_at
        : new Date().toISOString(),
    source: typeof obj.source === "string" ? obj.source : "unknown",
  };
}
