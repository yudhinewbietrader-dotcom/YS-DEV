/**
 * Probe kolom SIPP live + bangun path/URL PDF putusan.
 *
 * PDF di skema dump:
 *   perkara_putusan.amar_putusan_dok
 *   perkara_putusan.amar_putusan_anonimisasi_dok
 *   perkara_dokumen.lokasi_file (+ nama_file)
 *   dirput_dokumen.path_filename / link_dirput
 *
 * Path relatif biasanya di bawah folder instalasi SIPP web satker.
 * Set env:
 *   SIPP_PDF_BASE_PATH=/var/www/html/sipp   (filesystem, untuk dokumentasi/path lokal)
 *   SIPP_PDF_BASE_URL=http://192.168.x.x/sipp  (URL yang bisa dibuka peneliti di LAN)
 */

import type { Pool, RowDataPacket } from "mysql2/promise";
import { firstEnv } from "./sipp-env";
import {
  NOMINAL_COLUMN_CANDIDATES,
  parseRpAmount,
  type NominalItem,
} from "./sipp-nominals";

export type PdfRef = {
  kind: "amar_dok" | "amar_anon" | "perkara_dokumen" | "dirput";
  relative_path: string;
  absolute_path: string | null;
  url: string | null;
  label: string;
  source_field: string;
};

export type SchemaProbeResult = {
  probed_at: string;
  /** table.column yang benar-benar ada di DB live */
  presentNominalColumns: Array<{
    table: string;
    column: string;
    kind: NominalItem["kind"];
  }>;
  hasAmarDok: boolean;
  hasAmarAnonDok: boolean;
  hasPerkaraDokumen: boolean;
  hasDirputDokumen: boolean;
  notes: string[];
};

let cachedProbe: SchemaProbeResult | null = null;

export function getPdfBasePath(): string {
  return (
    firstEnv("SIPP_PDF_BASE_PATH", "SIPP_DOK_BASE_PATH", "SIPP_FILES_ROOT") || ""
  ).replace(/\/+$/, "");
}

export function getPdfBaseUrl(): string {
  return (
    firstEnv("SIPP_PDF_BASE_URL", "SIPP_DOK_BASE_URL", "SIPP_FILES_URL") || ""
  ).replace(/\/+$/, "");
}

export function resolvePdfRef(
  relative: string | null | undefined,
  opts: { kind: PdfRef["kind"]; label: string; source_field: string },
): PdfRef | null {
  if (!relative || !String(relative).trim()) return null;
  const rel = String(relative).trim().replace(/^\/+/, "");
  const basePath = getPdfBasePath();
  const baseUrl = getPdfBaseUrl();
  return {
    kind: opts.kind,
    relative_path: rel,
    absolute_path: basePath ? `${basePath}/${rel}` : null,
    url: baseUrl ? `${baseUrl}/${rel}` : null,
    label: opts.label,
    source_field: opts.source_field,
  };
}

export async function probeSippSchema(pool: Pool): Promise<SchemaProbeResult> {
  if (cachedProbe) return cachedProbe;

  const notes: string[] = [];
  const presentNominalColumns: SchemaProbeResult["presentNominalColumns"] = [];

  const [cols] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
         (TABLE_NAME = 'perkara_putusan' AND COLUMN_NAME IN (
           'amar_putusan_dok','amar_putusan_anonimisasi_dok',
           'nafkah_iddah','iddah','uang_iddah','jumlah_iddah',
           'mutah','mutaah','uang_mutah','uang_mutaah','nafkah_mutah','jumlah_mutah',
           'nafkah_anak','hadhanah','jumlah_nafkah_anak',
           'madhiyah','nafkah_madhiyah','uang_madhiyah'
         ))
         OR (TABLE_NAME = 'perkara_anak_pihak' AND COLUMN_NAME = 'jumlah_nafkah')
         OR (TABLE_NAME = 'perkara_dokumen' AND COLUMN_NAME IN ('lokasi_file','nama_file'))
         OR (TABLE_NAME = 'dirput_dokumen' AND COLUMN_NAME IN ('path_filename','link_dirput'))
       )`,
  );

  const set = new Set(cols.map((r) => `${r.t}.${r.c}`));

  for (const cand of NOMINAL_COLUMN_CANDIDATES) {
    if (set.has(`${cand.table}.${cand.column}`)) {
      presentNominalColumns.push(cand);
    }
  }

  if (presentNominalColumns.length === 0) {
    notes.push(
      "Tidak ada kolom typed iddah/mut'ah di information_schema (cocok dengan dump sipp32.sql). " +
        "Nominal istri akan diisi dari parse amar bila ada angka; anak dari perkara_anak_pihak.jumlah_nafkah.",
    );
  } else {
    notes.push(
      `Kolom nominal typed terdeteksi: ${presentNominalColumns
        .map((c) => `${c.table}.${c.column}`)
        .join(", ")}`,
    );
  }

  const result: SchemaProbeResult = {
    probed_at: new Date().toISOString(),
    presentNominalColumns,
    hasAmarDok: set.has("perkara_putusan.amar_putusan_dok"),
    hasAmarAnonDok: set.has("perkara_putusan.amar_putusan_anonimisasi_dok"),
    hasPerkaraDokumen: set.has("perkara_dokumen.lokasi_file"),
    hasDirputDokumen: set.has("dirput_dokumen.path_filename"),
    notes,
  };
  cachedProbe = result;
  return result;
}

export function clearSchemaProbeCache() {
  cachedProbe = null;
}

/** Bangun potongan SELECT ekstra untuk kolom nominal typed yang ada */
export function buildExtraNominalSelect(
  probe: SchemaProbeResult,
): { selectSql: string; kinds: Array<{ alias: string; kind: NominalItem["kind"]; field: string }> } {
  const kinds: Array<{ alias: string; kind: NominalItem["kind"]; field: string }> = [];
  const parts: string[] = [];
  probe.presentNominalColumns.forEach((c, i) => {
    const alias = `nom_extra_${i}`;
    // Hanya perkara_putusan dikaitkan langsung di query utama (alias pp)
    if (c.table === "perkara_putusan") {
      parts.push(`pp.\`${c.column}\` AS \`${alias}\``);
      kinds.push({
        alias,
        kind: c.kind,
        field: `${c.table}.${c.column}`,
      });
    }
  });
  return {
    selectSql: parts.length ? `, ${parts.join(", ")}` : "",
    kinds,
  };
}

export function dbNominalsFromRow(
  row: Record<string, unknown>,
  kinds: Array<{ alias: string; kind: NominalItem["kind"]; field: string }>,
): NominalItem[] {
  const out: NominalItem[] = [];
  for (const k of kinds) {
    const raw = row[k.alias];
    if (raw == null || raw === "") continue;
    const amount =
      typeof raw === "number" ? (raw > 0 ? raw : null) : parseRpAmount(String(raw));
    if (amount == null) continue;
    out.push({
      kind: k.kind,
      amount,
      raw: String(raw),
      source: "db_column",
      source_field: k.field,
    });
  }
  return out;
}

/** Kumpulkan referensi PDF putusan dari baris kueri utama + opsional dokumen/dirput. */
export function collectPdfRefs(row: Record<string, unknown>): PdfRef[] {
  const refs: PdfRef[] = [];
  const push = (rel: unknown, opts: Parameters<typeof resolvePdfRef>[1]) => {
    const r = resolvePdfRef(rel == null ? null : String(rel), opts);
    if (r) refs.push(r);
  };
  push(row.amar_putusan_dok, {
    kind: "amar_dok",
    label: "PDF amar putusan (amar_putusan_dok)",
    source_field: "perkara_putusan.amar_putusan_dok",
  });
  push(row.amar_putusan_anonimisasi_dok, {
    kind: "amar_anon",
    label: "PDF amar anonimisasi",
    source_field: "perkara_putusan.amar_putusan_anonimisasi_dok",
  });
  push(row.dokumen_putusan_path, {
    kind: "perkara_dokumen",
    label: row.dokumen_putusan_nama
      ? `Dokumen: ${String(row.dokumen_putusan_nama)}`
      : "perkara_dokumen putusan",
    source_field: "perkara_dokumen.lokasi_file",
  });
  push(row.dirput_path, {
    kind: "dirput",
    label: "Dirput path_filename",
    source_field: "dirput_dokumen.path_filename",
  });
  // link_dirput sering URL absolut eksternal
  if (row.dirput_link && String(row.dirput_link).trim()) {
    const link = String(row.dirput_link).trim();
    refs.push({
      kind: "dirput",
      relative_path: link,
      absolute_path: null,
      url: /^https?:\/\//i.test(link)
        ? link
        : resolvePdfRef(link, {
            kind: "dirput",
            label: "Dirput link",
            source_field: "dirput_dokumen.link_dirput",
          })?.url || null,
      label: "Link Dirput",
      source_field: "dirput_dokumen.link_dirput",
    });
  }
  return refs;
}
