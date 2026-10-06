/**
 * Heuristik usulan modus asimetri dari field SIPP lokal / metadata kasus.
 *
 * Bukan klasifikasi final: banyak modus (tadlis, PMI, informal mendalam)
 * butuh teks putusan lengkap / PDF. Hasil disimpan sebagai *suggestion*
 * dengan cuplikan bukti + confidence low|med — tidak menimpa koding
 * yang sudah dikonfirmasi peneliti (coding_status=coded / modus terisi).
 */

import type { ModusId } from "./coding-taxonomy";
import { MODUS_ASIMETRI } from "./coding-taxonomy";
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

export type ModusDetectResult = {
  suggestions: ModusSuggestion[];
  empty_reason: string | null;
  detected_at: string;
  source: string;
};

export type ModusDetectFields = {
  amar_excerpt?: string | null;
  proses_text?: string | null;
  tahapan_text?: string | null;
  jenis_perkara?: string | null;
  jenis_perkara_text?: string | null;
  putusan_verstek?: string | null;
  status_putusan?: string | null;
  status_perkara?: string | null;
  nomor_akta_cerai?: string | null;
  jenis_cerai?: string | null;
  pekerjaan_pihak1?: string | null;
  pekerjaan_pihak2?: string | null;
  kehadiran?: string | null;
  bukti_pendapatan?: string | null;
  indikasi_asimetri?: string | null;
  evidence_quotes?: string | null;
};

type Rule = {
  id: ModusId;
  confidence: ModusConfidence;
  field: string;
  patterns: RegExp[];
  /** Jika true, cocokkan juga ke putusan_verstek / kehadiran flag */
  verstekFlag?: boolean;
};

const LABEL: Record<string, string> = Object.fromEntries(
  MODUS_ASIMETRI.map((m) => [m.id, m.label]),
);

const RULES: Rule[] = [
  {
    id: "verstek",
    confidence: "med",
    field: "putusan_verstek",
    patterns: [/\bverstek\b/i, /\bsecara\s+verstek\b/i, /\btidak\s+hadir\b/i],
    verstekFlag: true,
  },
  {
    id: "pmi",
    confidence: "med",
    field: "pekerjaan/amar",
    patterns: [
      /\bpmi\b/i,
      /\btki\b/i,
      /\bburuh\s+migran\b/i,
      /\bpekerja\s+migran\b/i,
      /\bmigran\b/i,
      /\bluar\s+negeri\b/i,
      /\bmalaysia\b/i,
      /\btaiwan\b/i,
      /\bhong\s*kong\b/i,
      /\bsingapura\b/i,
      /\barab\s+saudi\b/i,
      /\bsaudi\b/i,
      /\bkorea\b/i,
      /\bjepang\b/i,
    ],
  },
  {
    id: "wiraswasta",
    confidence: "med",
    field: "pekerjaan/amar",
    patterns: [
      /\bwiraswasta\b/i,
      /\bwirausaha\b/i,
      /\busaha\s+sendiri\b/i,
      /\bpedagang\b/i,
      /\bberdagang\b/i,
      /\bpengusaha\b/i,
      /\btoko\b/i,
      /\bwarung\b/i,
      /\bkontraktor\b/i,
    ],
  },
  {
    id: "informal",
    confidence: "med",
    field: "pekerjaan/amar",
    patterns: [
      /\bsektor\s+informal\b/i,
      /\binformal\b/i,
      /\bpetani\b/i,
      /\bburuh\b/i,
      /\bnelayan\b/i,
      /\bojek\b/i,
      /\bdriver\b/i,
      /\bserabutan\b/i,
      /\bharian\b/i,
      /\btidak\s+tetap\b/i,
      /\bminim\s+dokumen\b/i,
      /\btanpa\s+dokumen\b/i,
      /\btukang\b/i,
      /\bkuli\b/i,
      /\bsupir\b/i,
      /\bsontoh\b/i,
    ],
  },
  {
    id: "pengakuan_tidak_mampu",
    confidence: "med",
    field: "amar",
    patterns: [
      /\btidak\s+mampu\b/i,
      /\bkurang\s+mampu\b/i,
      /\bpengakuan\s+.*mampu\b/i,
      /\bsktm\b/i,
      /\bmiskin\b/i,
      /\btidak\s+berpenghasilan\b/i,
      /\btanpa\s+penghasilan\b/i,
      /\bpenghasilan\s+tidak\s+ada\b/i,
    ],
  },
  {
    id: "slip_gaji",
    confidence: "low",
    field: "amar",
    patterns: [
      /\bslip\s+gaji\b/i,
      /\bgaji\s+palsu\b/i,
      /\bbukti\s+pendapatan\b/i,
      /\bbukti\s+penghasilan\b/i,
      /\bdokumen\s+palsu\b/i,
      /\bsurat\s+keterangan\s+penghasilan\b/i,
      /\brekening\s+koran\b/i,
    ],
  },
  {
    id: "penyembunyian_aset",
    confidence: "low",
    field: "amar",
    patterns: [
      /\bmenyembunyikan\b/i,
      /\bpenyembunyian\b/i,
      /\bsembunyi(kan)?\s+(harta|aset)\b/i,
      /\bharta\s+bersama\b/i,
      /\btadlis\b/i,
      /\bmoral\s+hazard\b/i,
      /\bpenipuan\b/i,
      /\btipu\s+daya\b/i,
      /\bmengalihkan\s+(harta|aset)\b/i,
    ],
  },
  {
    id: "gaya_hidup_tidak_sesuai",
    confidence: "low",
    field: "amar",
    patterns: [
      /\bgaya\s+hidup\b/i,
      /\bkemewahan\b/i,
      /\btidak\s+sesuai\s+(dengan\s+)?(penghasilan|pendapatan)\b/i,
      /\bkendaraan\b/i,
      /\bmotor\s+baru\b/i,
      /\bmobil\b/i,
    ],
  },
];

function snippetAround(haystack: string, matchIndex: number, len = 120): string {
  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(haystack.length, matchIndex + len);
  let s = haystack.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < haystack.length) s = s + "…";
  return s;
}

function findMatch(
  text: string,
  patterns: RegExp[],
): { evidence: string; index: number } | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m.index != null) {
      return { evidence: snippetAround(text, m.index), index: m.index };
    }
  }
  return null;
}

function corpusFrom(fields: ModusDetectFields): Array<{ field: string; text: string }> {
  const pairs: Array<[string, string | null | undefined]> = [
    ["amar_excerpt", fields.amar_excerpt],
    ["proses_text", fields.proses_text],
    ["tahapan_text", fields.tahapan_text],
    ["jenis_perkara", fields.jenis_perkara],
    ["jenis_perkara_text", fields.jenis_perkara_text],
    ["status_putusan", fields.status_putusan],
    ["status_perkara", fields.status_perkara],
    ["jenis_cerai", fields.jenis_cerai],
    ["pekerjaan_pihak1", fields.pekerjaan_pihak1],
    ["pekerjaan_pihak2", fields.pekerjaan_pihak2],
    ["bukti_pendapatan", fields.bukti_pendapatan],
    ["indikasi_asimetri", fields.indikasi_asimetri],
    ["evidence_quotes", fields.evidence_quotes],
    ["kehadiran", fields.kehadiran],
  ];
  return pairs
    .filter(([, v]) => v && String(v).trim())
    .map(([field, v]) => ({ field, text: String(v) }));
}

export function detectModusFromFields(
  fields: ModusDetectFields,
  opts?: { source?: string },
): ModusDetectResult {
  const source = opts?.source || "sipp_heuristic";
  const detected_at = new Date().toISOString();
  const bags = corpusFrom(fields);
  const joined = bags.map((b) => b.text).join("\n");
  const found = new Map<ModusId, ModusSuggestion>();

  // Verstek flag dari kolom SIPP
  const v = (fields.putusan_verstek || "").toUpperCase().trim();
  if (v === "Y" || (fields.kehadiran || "").toLowerCase() === "verstek") {
    found.set("verstek", {
      id: "verstek",
      label: LABEL.verstek || "Perkara verstek",
      confidence: "med",
      evidence:
        v === "Y"
          ? "putusan_verstek=Y (SIPP lokal)"
          : `kehadiran=${fields.kehadiran}`,
      field: "putusan_verstek",
    });
  }

  for (const rule of RULES) {
    if (found.has(rule.id) && rule.id === "verstek") continue;

    // Prefer match in higher-signal fields first
    let hit: { evidence: string; field: string } | null = null;
    for (const bag of bags) {
      const m = findMatch(bag.text, rule.patterns);
      if (m) {
        hit = { evidence: m.evidence, field: bag.field };
        break;
      }
    }
    if (!hit && joined) {
      const m = findMatch(joined, rule.patterns);
      if (m) hit = { evidence: m.evidence, field: rule.field };
    }
    if (hit) {
      // Prefer med over low if already present with lower confidence
      const prev = found.get(rule.id);
      if (!prev || (prev.confidence === "low" && rule.confidence === "med")) {
        found.set(rule.id, {
          id: rule.id,
          label: LABEL[rule.id] || rule.id,
          confidence: rule.confidence,
          evidence: hit.evidence,
          field: hit.field,
        });
      }
    }
  }

  // Soft-map pekerjaan → status_pekerjaan hint already handled elsewhere;
  // if only occupation informal/pmi/wiraswasta matched, confidence stays.

  const suggestions = [...found.values()].sort((a, b) => {
    const conf = (c: ModusConfidence) => (c === "med" ? 0 : 1);
    return conf(a.confidence) - conf(b.confidence) || a.id.localeCompare(b.id);
  });

  const hasAmar = Boolean(fields.amar_excerpt && fields.amar_excerpt.trim());
  const empty_reason =
    suggestions.length === 0
      ? hasAmar
        ? "belum terdeteksi dari cuplikan amar/status — lengkapi manual / unggah putusan lengkap"
        : "belum terdeteksi — cuplikan amar kosong; lengkapi manual / unggah putusan"
      : null;

  return { suggestions, empty_reason, detected_at, source };
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
  return {
    amar_excerpt: row.amar_excerpt,
    proses_text: row.proses_text,
    tahapan_text: row.tahapan_text,
    jenis_perkara: row.jenis_perkara,
    jenis_perkara_text:
      typeof local.jenis_perkara_text === "string" ? local.jenis_perkara_text : null,
    putusan_verstek: row.putusan_verstek,
    status_putusan: row.status_putusan,
    status_perkara: row.status_perkara,
    nomor_akta_cerai: row.nomor_akta_cerai,
    jenis_cerai: typeof local.jenis_cerai === "string" ? local.jenis_cerai : null,
    pekerjaan_pihak1:
      typeof local.pekerjaan_pihak1 === "string" ? local.pekerjaan_pihak1 : null,
    pekerjaan_pihak2:
      typeof local.pekerjaan_pihak2 === "string" ? local.pekerjaan_pihak2 : null,
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
  const ids = new Set(suggestions.map((s) => s.id));
  if (ids.has("pmi")) return "pmi";
  if (ids.has("wiraswasta")) return "wiraswasta";
  if (ids.has("informal")) return "informal";
  const job = `${fields.pekerjaan_pihak1 || ""} ${fields.pekerjaan_pihak2 || ""}`.toLowerCase();
  if (!job.trim()) return null;
  if (/\basn\b|pns|karyawan|pegawai/.test(job)) return "asn";
  return null;
}

/**
 * Terapkan usulan ke baris kasus tanpa menimpa koding terkonfirmasi.
 * - selalu tulis modus_suggestions_json
 * - jika coding_status != coded DAN modus_asimetri_json kosong → soft-isi id usulan
 * - jika coding_status == coded ATAU modus sudah terisi → hanya update suggestions
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
  const isCoded = row.coding_status === "coded";
  const hasConfirmed = isCoded || existingModus.length > 0;
  const payload = JSON.stringify(result);

  const pekerjaanHint = fields
    ? inferStatusPekerjaan(fields, result.suggestions)
    : null;

  if (hasConfirmed) {
    db.prepare(
      `UPDATE cases SET
        modus_suggestions_json = @payload,
        updated_at = datetime('now')
      WHERE id = @id`,
    ).run({ payload, id: caseId });
    return {
      appliedSoft: false,
      suggestionCount: result.suggestions.length,
      skippedConfirmed: true,
    };
  }

  const softIds = result.suggestions.map((s) => s.id);
  db.prepare(
    `UPDATE cases SET
      modus_suggestions_json = @payload,
      modus_asimetri_json = @modus,
      status_pekerjaan = COALESCE(NULLIF(status_pekerjaan, ''), @pekerjaan),
      indikasi_asimetri = CASE
        WHEN indikasi_asimetri IS NULL OR trim(indikasi_asimetri) = '' THEN @indikasi
        ELSE indikasi_asimetri
      END,
      updated_at = datetime('now')
    WHERE id = @id`,
  ).run({
    payload,
    modus: JSON.stringify(softIds),
    pekerjaan: pekerjaanHint,
    indikasi:
      result.suggestions.length > 0
        ? `Usulan otomatis (heuristik SIPP): ${result.suggestions
            .map((s) => `${s.label} [${s.confidence}] — ${s.evidence}`)
            .join("; ")}`
        : result.empty_reason,
    id: caseId,
  });

  return {
    appliedSoft: softIds.length > 0,
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
  if (!row) {
    throw new Error(`Kasus #${caseId} tidak ditemukan`);
  }
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
      if (result.suggestions.length) withSuggestions++;
      else withoutSignal++;
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
    empty_reason:
      typeof obj.empty_reason === "string" ? obj.empty_reason : null,
    detected_at:
      typeof obj.detected_at === "string"
        ? obj.detected_at
        : new Date().toISOString(),
    source: typeof obj.source === "string" ? obj.source : "unknown",
  };
}
