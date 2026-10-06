/**
 * Penilaian kecukupan data SIPP untuk koding Bab IV / Lampiran 1C.
 * Jujur: banyak field 1C hanya cukup dari putusan PDF + wawancara.
 */

import type { ObjekNafkahId, ModusId, ResponsId } from "./coding-taxonomy";
import { MODUS_ASIMETRI, OBJEK_NAFKAH, RESPONS_HAKIM } from "./coding-taxonomy";
import type { BhtBasis } from "./sipp-local";

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
          ? String(anak_sum)
          : input.anak_count
            ? `${input.anak_count} anak, nominal kosong`
            : null,
      note: "Satu-satunya nominal nafkah terstruktur; iddah/mut'ah TIDAK ada kolomnya",
    },
    {
      label: "Akta cerai",
      source: "perkara_akta_cerai.nomor_akta_cerai",
      preview: input.nomor_akta_cerai || null,
    },
  ];

  const sufficiency: DataQualityReport["sufficiency"] = {
    identitas:
      input.nomor_perkara && input.jenis_perkara ? "cukup" : "kurang",
    verstek_kehadiran: has_verstek_flag ? "cukup" : "kurang",
    objek_nafkah: objekHits.length || (anak_sum != null && anak_sum > 0)
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
    nominal_iddah_mutah: "tidak_ada", // no structured columns
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
  if (sufficiency.nominal_iddah_mutah === "tidak_ada") {
    messages.push(
      "Nominal iddah/mut'ah tidak ada di kolom SIPP — ambil dari amar lengkap / PDF putusan.",
    );
  }
  if (sufficiency.modus_asimetri_dalam !== "cukup") {
    messages.push(
      "Data kurang untuk kode modus dalam (tadlis, penyembunyian aset, gaya hidup) — butuh putusan/PDF + koding manual.",
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
      ? `Metadata SIPP: ${cukupCount} aspek cukup; nominal iddah/mut'ah & evaluasi maqasid tetap dari putusan/PDF.`
      : "Data SIPP tipis untuk koding 1C — prioritaskan unduh/baca putusan berizin.";

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
