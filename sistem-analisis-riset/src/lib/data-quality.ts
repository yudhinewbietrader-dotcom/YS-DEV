/**
 * Penilaian kecukupan data SIPP untuk koding Bab IV / Lampiran 1C.
 * SIPP menyediakan PDF path + nominal (anak terstruktur; iddah/mut’ah dari
 * kolom typed bila ada / parse amar / PDF).
 */

import type { ObjekNafkahId, ModusId, ResponsId } from "./coding-taxonomy";
import { MODUS_ASIMETRI, OBJEK_NAFKAH, RESPONS_HAKIM } from "./coding-taxonomy";
import type { BhtBasis } from "./sipp-local";
import type { NominalBundle } from "./sipp-nominals";
import { formatNominalId } from "./sipp-nominals";
import type { PdfRef } from "./sipp-pdf";

export type Sufficiency = "cukup" | "partial" | "kurang" | "tidak_ada";

export type ProvenanceItem = {
  label: string;
  source: string;
  preview: string | null;
  note?: string;
};

export type DataQualityReport = {
  bht_basis: BhtBasis | string;
  amar_char_count: number;
  amar_truncated: boolean;
  has_pekerjaan: boolean;
  has_verstek_flag: boolean;
  has_pertimbangan: boolean;
  has_petitum: boolean;
  nafkah_signal: boolean;
  anak_jumlah_nafkah_sum: number | null;
  provenance: ProvenanceItem[];
  /** Kecukupan per kebutuhan koding */
  sufficiency: {
    identitas: Sufficiency;
    verstek_kehadiran: Sufficiency;
    objek_nafkah: Sufficiency;
    status_pekerjaan: Sufficiency;
    modus_asimetri_dalam: Sufficiency;
    respons_hakim: Sufficiency;
    nominal_iddah_mutah: Sufficiency;
    maqasid_evaluasi: Sufficiency;
  };
  messages: string[];
  summary: string;
};

export type QualityInput = {
  nomor_perkara?: string | null;
  jenis_perkara?: string | null;
  tanggal_putusan?: string | null;
  tanggal_bht?: string | null;
  bht_basis?: string | null;
  putusan_verstek?: string | null;
  amar_excerpt?: string | null;
  amar_char_count?: number | null;
  amar_truncated?: boolean | null;
  petitum_excerpt?: string | null;
  posita_excerpt?: string | null;
  pertimbangan_excerpt?: string | null;
  pekerjaan_pihak1?: string | null;
  pekerjaan_pihak2?: string | null;
  anak_jumlah_nafkah_sum?: number | null;
  anak_count?: number | null;
  nafkah_signal?: boolean | null;
  proses_text?: string | null;
  tahapan_text?: string | null;
  nomor_akta_cerai?: string | null;
  nominals?: NominalBundle | null;
  pdf_refs?: PdfRef[] | null;
};

function preview(raw: string | null | undefined, n = 100): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function detectObjekFromText(text: string): ObjekNafkahId[] {
  const found: ObjekNafkahId[] = [];
  if (/iddah/i.test(text)) found.push("iddah");
  if (/mut\s*['’`]?\s*ah|mutah/i.test(text)) found.push("mutah");
  if (/hadhanah|nafkah\s+anak|nafkah\s+pemeliharaan/i.test(text)) {
    found.push("hadhanah");
  }
  if (/madhiyah|nafkah\s+lampau/i.test(text)) found.push("madhiyah");
  return found;
}

export function assessDataQuality(input: QualityInput): DataQualityReport {
  const amar = input.amar_excerpt || "";
  const petitum = input.petitum_excerpt || "";
  const pertimbangan = input.pertimbangan_excerpt || "";
  const pekerjaan = `${input.pekerjaan_pihak1 || ""} ${input.pekerjaan_pihak2 || ""}`.trim();
  const amar_char_count = Number(input.amar_char_count ?? amar.length);
  const amar_truncated = Boolean(input.amar_truncated);
  const has_pekerjaan = Boolean(pekerjaan);
  const v = (input.putusan_verstek || "").toUpperCase().trim();
  const has_verstek_flag = v === "Y" || v === "T";
  const has_pertimbangan = Boolean(pertimbangan.trim());
  const has_petitum = Boolean(petitum.trim());
  const anak_sum =
    input.anak_jumlah_nafkah_sum != null
      ? Number(input.anak_jumlah_nafkah_sum)
      : null;
  const corpus = `${amar}\n${petitum}\n${input.posita_excerpt || ""}`;
  const objekHits = detectObjekFromText(corpus);
  const nafkah_signal =
    input.nafkah_signal != null
      ? Boolean(input.nafkah_signal)
      : objekHits.length > 0 || (anak_sum != null && anak_sum > 0);

  const provenance: ProvenanceItem[] = [
    {
      label: "Nomor perkara",
      source: "perkara.nomor_perkara",
      preview: input.nomor_perkara || null,
    },
    {
      label: "Jenis perkara",
      source: "perkara.jenis_perkara_nama",
      preview: input.jenis_perkara || null,
    },
    {
      label: "Tanggal putusan",
      source: "perkara_putusan.tanggal_putusan",
      preview: input.tanggal_putusan || null,
    },
    {
      label: "Tanggal BHT",
      source: "perkara_putusan.tanggal_bht",
      preview: input.tanggal_bht || null,
      note:
        input.bht_basis && input.bht_basis !== "tanggal_bht"
          ? `Basis filter sekunder: ${input.bht_basis}`
          : "Ground truth BHT bila terisi",
    },
    {
      label: "Verstek",
      source: "perkara_putusan.putusan_verstek",
      preview: input.putusan_verstek || null,
    },
    {
      label: "Amar putusan",
      source: "perkara_putusan.amar_putusan",
      preview: preview(amar, 140),
      note: amar_truncated
        ? `Terpotong di impor (${amar_char_count} karakter di DB; cuplikan ~12k)`
        : amar_char_count
          ? `${amar_char_count} karakter`
          : "Kosong",
    },
    {
      label: "Petitum",
      source: "perkara.petitum",
      preview: preview(petitum),
    },
    {
      label: "Pertimbangan hukum",
      source: "perkara_pertimbangan_hukum.pertimbangan_hukum",
      preview: preview(pertimbangan),
      note: has_pertimbangan
        ? undefined
        : "Sering kosong di SIPP — isi dari PDF putusan",
    },
    {
      label: "Pekerjaan pihak1/2",
      source: "pihak.pekerjaan via perkara_pihak1/2",
      preview: preview(pekerjaan || null),
      note: "Tidak ada kolom penghasilan di pihak cerai",
    },
    {
      label: "Nafkah anak (terstruktur)",
      source: "perkara_anak_pihak.jumlah_nafkah",
      preview:
        anak_sum != null
          ? formatNominalId(anak_sum)
          : input.anak_count
            ? `${input.anak_count} anak, nominal kosong`
            : null,
      note: "Kolom typed double di dump sipp32.sql",
    },
    {
      label: "Nominal iddah",
      source:
        input.nominals?.iddah?.source_field ||
        "perkara_putusan.amar_putusan (parse) / kolom typed bila ada",
      preview: input.nominals?.iddah
        ? `${formatNominalId(input.nominals.iddah.amount)} [${input.nominals.iddah.source}]`
        : null,
    },
    {
      label: "Nominal mut'ah",
      source:
        input.nominals?.mutah?.source_field ||
        "perkara_putusan.amar_putusan (parse) / kolom typed bila ada",
      preview: input.nominals?.mutah
        ? `${formatNominalId(input.nominals.mutah.amount)} [${input.nominals.mutah.source}]`
        : null,
    },
    {
      label: "PDF putusan",
      source: "perkara_putusan.amar_putusan_dok (+ anon / perkara_dokumen / dirput)",
      preview: input.pdf_refs?.length
        ? input.pdf_refs
            .map((p) => p.url || p.absolute_path || p.relative_path)
            .join(" | ")
        : null,
      note: input.pdf_refs?.length
        ? "Path relatif ke folder instalasi SIPP; set SIPP_PDF_BASE_URL untuk link LAN"
        : "Belum ada path di DB untuk perkara ini",
    },
    {
      label: "Akta cerai",
      source: "perkara_akta_cerai.nomor_akta_cerai",
      preview: input.nomor_akta_cerai || null,
    },
  ];

  const hasIddah = Boolean(input.nominals?.iddah);
  const hasMutah = Boolean(input.nominals?.mutah);
  const hasAnakNom = Boolean(input.nominals?.hadhanah || (anak_sum != null && anak_sum > 0));
  const hasPdf = Boolean(input.pdf_refs?.length);
  let nominalSuf: Sufficiency = "kurang";
  if (hasIddah && hasMutah) nominalSuf = "cukup";
  else if (hasIddah || hasMutah || hasAnakNom) nominalSuf = "partial";
  else if (hasPdf || amar_char_count > 500) nominalSuf = "partial";
  else nominalSuf = "kurang";

  const sufficiency: DataQualityReport["sufficiency"] = {
    identitas:
      input.nomor_perkara && input.jenis_perkara ? "cukup" : "kurang",
    verstek_kehadiran: has_verstek_flag ? "cukup" : "kurang",
    objek_nafkah: objekHits.length || hasAnakNom
      ? amar_char_count > 500
        ? "cukup"
        : "partial"
      : nafkah_signal
        ? "partial"
        : "kurang",
    status_pekerjaan: has_pekerjaan ? "partial" : "kurang",
    modus_asimetri_dalam:
      amar_char_count > 2000 && has_pekerjaan
        ? "partial"
        : amar_char_count > 500
          ? "partial"
          : "kurang",
    respons_hakim: has_pertimbangan || amar_char_count > 3000 ? "partial" : "kurang",
    nominal_iddah_mutah: nominalSuf,
    maqasid_evaluasi: "tidak_ada",
  };

  const messages: string[] = [];
  if (!input.tanggal_bht) {
    messages.push(
      "tanggal_bht kosong — jika filter strict, perkara ini tidak masuk; proxy akta/proses bukan ground truth BHT.",
    );
  }
  if (!nafkah_signal) {
    messages.push(
      "Belum ada sinyal nafkah di amar/petitum/anak — cek apakah relevan untuk inklusi proposal.",
    );
  }
  if (hasIddah || hasMutah || hasAnakNom) {
    const bits: string[] = [];
    if (input.nominals?.iddah)
      bits.push(`iddah=${formatNominalId(input.nominals.iddah.amount)} (${input.nominals.iddah.source})`);
    if (input.nominals?.mutah)
      bits.push(`mut'ah=${formatNominalId(input.nominals.mutah.amount)} (${input.nominals.mutah.source})`);
    if (input.nominals?.hadhanah)
      bits.push(`anak=${formatNominalId(input.nominals.hadhanah.amount)} (${input.nominals.hadhanah.source})`);
    messages.push(`Nominal diimpor dari SIPP: ${bits.join("; ")}.`);
  } else if (hasPdf) {
    messages.push(
      "Nominal belum terurai dari kolom/amar — baca angka di PDF putusan (path sudah diimpor).",
    );
  }
  if (input.nominals?.notes?.length) {
    for (const n of input.nominals.notes.slice(0, 2)) messages.push(n);
  }
  if (sufficiency.modus_asimetri_dalam !== "cukup") {
    messages.push(
      "Data kurang untuk kode modus dalam (tadlis, penyembunyian aset, gaya hidup) — butuh baca PDF + koding manual.",
    );
  }
  if (objekHits.length) {
    messages.push(
      `Sinyal objek nafkah di teks: ${objekHits.join(", ")} (usulan; konfirmasi manual).`,
    );
  }
  if (v === "Y") {
    messages.push("putusan_verstek=Y → kehadiran verstek cukup terdukung dari DB.");
  }

  const cukupCount = Object.values(sufficiency).filter((s) => s === "cukup").length;
  const summary =
    cukupCount >= 2
      ? `Metadata SIPP: ${cukupCount} aspek cukup` +
        (hasIddah || hasMutah || hasAnakNom
          ? "; nominal diimpor (DB/anak/amar)."
          : hasPdf
            ? "; PDF path tersedia di LAN satker."
            : "; lengkapi nominal dari amar/PDF bila perlu.")
      : "Data SIPP tipis untuk koding 1C — sync ulang atau baca PDF putusan.";

  return {
    bht_basis: input.bht_basis || (input.tanggal_bht ? "tanggal_bht" : "none"),
    amar_char_count,
    amar_truncated,
    has_pekerjaan,
    has_verstek_flag,
    has_pertimbangan,
    has_petitum,
    nafkah_signal,
    anak_jumlah_nafkah_sum: anak_sum,
    provenance,
    sufficiency,
    messages,
    summary,
  };
}

export function detectObjekNafkahSuggestions(text: string): Array<{
  id: ObjekNafkahId;
  label: string;
  confidence: "med" | "low";
  evidence: string;
  field: string;
}> {
  const labelMap = Object.fromEntries(OBJEK_NAFKAH.map((o) => [o.id, o.label]));
  const out: Array<{
    id: ObjekNafkahId;
    label: string;
    confidence: "med" | "low";
    evidence: string;
    field: string;
  }> = [];
  const rules: Array<{ id: ObjekNafkahId; re: RegExp; conf: "med" | "low" }> = [
    { id: "iddah", re: /\biddah\b/i, conf: "med" },
    { id: "mutah", re: /mut\s*['’`]?\s*ah|\bmutah\b/i, conf: "med" },
    {
      id: "hadhanah",
      re: /\bhadhanah\b|nafkah\s+anak|nafkah\s+pemeliharaan/i,
      conf: "med",
    },
    {
      id: "madhiyah",
      re: /\bmadhiyah\b|nafkah\s+lampau/i,
      conf: "low",
    },
  ];
  for (const r of rules) {
    const m = r.re.exec(text);
    if (m && m.index != null) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + 80);
      out.push({
        id: r.id,
        label: labelMap[r.id] || r.id,
        confidence: r.conf,
        evidence: text.slice(start, end).replace(/\s+/g, " ").trim(),
        field: "amar/petitum",
      });
    }
  }
  return out;
}

export function detectResponsSuggestions(text: string): Array<{
  id: ResponsId;
  label: string;
  confidence: "med" | "low";
  evidence: string;
  field: string;
}> {
  const labelMap = Object.fromEntries(RESPONS_HAKIM.map((o) => [o.id, o.label]));
  const rules: Array<{ id: ResponsId; re: RegExp; conf: "med" | "low" }> = [
    {
      id: "ex_officio",
      re: /\bex\s*officio\b|secara\s+jabatan/i,
      conf: "med",
    },
    {
      id: "hakim_aktif",
      re: /hakim\s+aktif|asas\s+hakim\s+aktif/i,
      conf: "low",
    },
  ];
  const out: Array<{
    id: ResponsId;
    label: string;
    confidence: "med" | "low";
    evidence: string;
    field: string;
  }> = [];
  for (const r of rules) {
    const m = r.re.exec(text);
    if (m && m.index != null) {
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + 80);
      out.push({
        id: r.id,
        label: labelMap[r.id] || r.id,
        confidence: r.conf,
        evidence: text.slice(start, end).replace(/\s+/g, " ").trim(),
        field: "amar/pertimbangan",
      });
    }
  }
  return out;
}

/** Label human untuk sufficiency UI */
export function sufficiencyLabel(s: Sufficiency): string {
  switch (s) {
    case "cukup":
      return "cukup dari SIPP";
    case "partial":
      return "sebagian — konfirmasi putusan";
    case "kurang":
      return "kurang — lengkapi manual / PDF";
    case "tidak_ada":
      return "tidak ada di DB — putusan/wawancara";
  }
}

export function modusSufficiencyMessage(
  id: ModusId,
  quality: DataQualityReport,
): string {
  if (id === "verstek") {
    return quality.has_verstek_flag
      ? "cukup: putusan_verstek dari SIPP"
      : "kurang: flag verstek kosong";
  }
  if (id === "informal" || id === "pmi" || id === "wiraswasta") {
    return quality.has_pekerjaan
      ? "partial: pekerjaan pihak ada — konfirmasi di putusan"
      : "kurang: pekerjaan pihak kosong di SIPP";
  }
  return "kurang untuk modus ini dari DB saja — butuh amar lengkap / PDF";
}

// silence unused in case tree-shaken differently
void MODUS_ASIMETRI;
