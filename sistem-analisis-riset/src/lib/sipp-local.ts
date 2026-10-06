/**
 * Klien read-only ke MariaDB/MySQL SIPP lokal (database tipikal: sipp32).
 *
 * Env primer mengikuti pola WA-gateway:
 *   SIPP_ENABLED, SIPP_HOST, SIPP_PORT, SIPP_DB, SIPP_USER, SIPP_PASSWORD, SIPP_CHARSET
 * PDF (path relatif di server satker):
 *   SIPP_PDF_BASE_PATH, SIPP_PDF_BASE_URL
 *
 * Mapping tabel/kolom: sipp32.sql — docs/kebutuhan-data-riset.md
 *
 * Nominal:
 * - Anak terstruktur: perkara_anak_pihak.jumlah_nafkah
 * - Iddah/mut’ah: probe kolom typed di DB live (jika patch), else parse amar;
 *   angka juga tersedia lewat PDF di amar_putusan_dok
 *
 * Keamanan: SELECT-only; kredensial dari env user.
 */

import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { firstEnv, truthyEnv } from "./sipp-env";
import {
  mergeNominals,
  type NominalBundle,
} from "./sipp-nominals";
import {
  buildExtraNominalSelect,
  collectPdfRefs,
  dbNominalsFromRow,
  probeSippSchema,
  type PdfRef,
  type SchemaProbeResult,
} from "./sipp-pdf";

export type SippLocalConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  charset: string;
};

/** Basis filter BHT yang dipakai untuk baris ini */
export type BhtBasis =
  | "tanggal_bht"
  | "akta_cerai"
  | "proses_proxy"
  | "none";

export type SippLocalCase = {
  perkara_id: number;
  nomor_perkara: string;
  tanggal_pendaftaran: string | null;
  jenis_perkara_nama: string | null;
  jenis_perkara_text: string | null;
  proses_terakhir_id: number | null;
  proses_terakhir_text: string | null;
  tahapan_terakhir_id: number | null;
  tahapan_terakhir_text: string | null;
  pihak1_text: string | null;
  pihak2_text: string | null;
  pihak_dipublikasikan: string | null;
  tanggal_putusan: string | null;
  tanggal_minutasi: string | null;
  tanggal_bht: string | null;
  putusan_verstek: string | null;
  status_putusan_nama: string | null;
  /** Cuplikan amar (hingga ~12k karakter dari LONGTEXT) */
  amar_excerpt: string | null;
  amar_char_count: number;
  amar_truncated: boolean;
  petitum_excerpt: string | null;
  posita_excerpt: string | null;
  pertimbangan_excerpt: string | null;
  nomor_akta_cerai: string | null;
  tgl_akta_cerai: string | null;
  tgl_penyerahan_akta_cerai: string | null;
  jenis_cerai: string | null;
  pekerjaan_pihak1: string | null;
  pekerjaan_pihak2: string | null;
  /** Jumlah baris anak di perkara_anak_pihak */
  anak_count: number;
  /** Sum jumlah_nafkah anak (kolom terstruktur dump) */
  anak_jumlah_nafkah_sum: number | null;
  bht_basis: BhtBasis;
  nafkah_signal: boolean;
  /** Path relatif upload PDF amar (bukan BLOB) */
  amar_putusan_dok: string | null;
  amar_putusan_anonimisasi_dok: string | null;
  /** Referensi PDF yang bisa dibuka di LAN satker */
  pdf_refs: PdfRef[];
  /** Bundle nominal iddah / mut’ah / anak / madhiyah */
  nominals: NominalBundle;
  schema_probe?: Pick<
    SchemaProbeResult,
    "presentNominalColumns" | "notes" | "probed_at"
  >;
};

export type BhtMode = "strict" | "prefer" | "none";
export type DateField = "pendaftaran" | "putusan";

const AMAR_FETCH_CHARS = 12000;

const globalForSipp = globalThis as unknown as {
  __sippLocalPool?: Pool;
  __sippLocalPoolKey?: string;
};

export function getSippLocalConfig(): SippLocalConfig {
  const enabledFlag = firstEnv("SIPP_ENABLED", "SIPP_DB_ENABLED");
  const host = firstEnv("SIPP_HOST", "SIPP_DB_HOST", "DB_HOST");
  const user = firstEnv("SIPP_USER", "SIPP_DB_USER", "DB_USER");
  const password = firstEnv("SIPP_PASSWORD", "SIPP_DB_PASSWORD", "DB_PASSWORD");
  const database =
    firstEnv("SIPP_DB", "SIPP_DB_NAME", "DB_NAME", "DB_DATABASE") || "sipp32";
  const port = Number(firstEnv("SIPP_PORT", "SIPP_DB_PORT", "DB_PORT") || 3306);
  const charset = firstEnv("SIPP_CHARSET", "SIPP_DB_CHARSET") || "latin1";

  const enabledExplicit = enabledFlag !== "";
  const enabled = enabledExplicit
    ? truthyEnv(enabledFlag)
    : Boolean(host && user);

  return { enabled, host, port, user, password, database, charset };
}

export function assertSelectOnly(sql: string) {
  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();
  if (!/^\s*SELECT\b/i.test(cleaned)) {
    throw new Error("Hanya kueri SELECT yang diizinkan ke SIPP lokal.");
  }
  if (
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE|CREATE|GRANT|REVOKE|CALL|LOAD|INTO\s+OUTFILE)\b/i.test(
      cleaned,
    )
  ) {
    throw new Error("Kueri mengandung perintah non-SELECT — ditolak.");
  }
}

export function getSippLocalPool(): Pool {
  const cfg = getSippLocalConfig();
  if (!cfg.enabled || !cfg.host || !cfg.user) {
    throw new Error(
      "SIPP lokal belum dikonfigurasi. Isi SIPP_ENABLED=true dan SIPP_HOST / SIPP_USER / SIPP_PASSWORD / SIPP_DB di .env.local (pola WA-gateway).",
    );
  }

  const poolKey = `${cfg.host}:${cfg.port}/${cfg.database}/${cfg.user}/${cfg.charset}`;
  if (globalForSipp.__sippLocalPool && globalForSipp.__sippLocalPoolKey !== poolKey) {
    void globalForSipp.__sippLocalPool.end().catch(() => undefined);
    globalForSipp.__sippLocalPool = undefined;
  }

  if (!globalForSipp.__sippLocalPool) {
    globalForSipp.__sippLocalPool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: 4,
      namedPlaceholders: true,
      charset: cfg.charset || "latin1",
      dateStrings: true,
      connectTimeout: 10000,
    });
    globalForSipp.__sippLocalPoolKey = poolKey;
  }
  return globalForSipp.__sippLocalPool;
}

export async function testSippLocalConnection(): Promise<{
  ok: boolean;
  database: string;
  host: string;
  sampleCount?: number;
  error?: string;
  schemaProbe?: SchemaProbeResult;
}> {
  const cfg = getSippLocalConfig();
  if (!cfg.enabled) {
    return { ok: false, database: cfg.database, host: cfg.host, error: "SIPP_ENABLED tidak aktif" };
  }
  try {
    const pool = getSippLocalPool();
    const sql = "SELECT COUNT(*) AS n FROM perkara LIMIT 1";
    assertSelectOnly(sql);
    const [rows] = await pool.query<RowDataPacket[]>(sql);
    let schemaProbe: SchemaProbeResult | undefined;
    try {
      schemaProbe = await probeSippSchema(pool);
    } catch {
      schemaProbe = undefined;
    }
    return {
      ok: true,
      database: cfg.database,
      host: cfg.host,
      sampleCount: Number(rows[0]?.n ?? 0),
      schemaProbe,
    };
  } catch (e) {
    return {
      ok: false,
      database: cfg.database,
      host: cfg.host,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function toDateParam(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m1 = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m1) {
    return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  }
  const months: Record<string, string> = {
    jan: "01",
    january: "01",
    januari: "01",
    feb: "02",
    february: "02",
    februari: "02",
    mar: "03",
    march: "03",
    maret: "03",
    apr: "04",
    april: "04",
    may: "05",
    mei: "05",
    jun: "06",
    june: "06",
    juni: "06",
    jul: "07",
    july: "07",
    juli: "07",
    aug: "08",
    august: "08",
    agustus: "08",
    agu: "08",
    sep: "09",
    september: "09",
    sept: "09",
    oct: "10",
    oktober: "10",
    okt: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
    desember: "12",
    des: "12",
  };
  const m2 = t.match(/^(\d{1,2})\s+([A-Za-z.]+)\s+(\d{4})$/);
  if (m2) {
    const mon = months[m2[2].replace(/\./g, "").toLowerCase()];
    if (mon) return `${m2[3]}-${mon}-${m2[1].padStart(2, "0")}`;
  }
  return null;
}

function resolveBhtBasis(row: {
  tanggal_bht: string | null;
  has_akta: boolean;
  proses: string | null;
}): BhtBasis {
  if (row.tanggal_bht) return "tanggal_bht";
  if (row.has_akta) return "akta_cerai";
  const p = (row.proses || "").toLowerCase();
  if (
    p.includes("akta cerai") ||
    p.includes("bht") ||
    p.includes("berkekuatan") ||
    p.includes("inkracht")
  ) {
    return "proses_proxy";
  }
  return "none";
}

/**
 * Cari perkara cerai relevan untuk riset asimetri nafkah.
 *
 * Kolom yang diimpor (eksplisit, dari sipp32.sql + probe live):
 * - perkara.* (identitas, jenis, proses, tahapan, pihak text, posita/petitum)
 * - perkara_putusan: tanggal_*, putusan_verstek, status_*, amar_putusan,
 *   amar_putusan_dok, amar_putusan_anonimisasi_dok (+ kolom nominal typed bila ada)
 * - perkara_anak_pihak.jumlah_nafkah
 * - perkara_dokumen.lokasi_file / dirput_dokumen.path_filename|link_dirput
 */
export async function searchSippLocalBht(opts: {
  keywords: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  /** @deprecated gunakan bhtMode */
  onlyBht?: boolean;
  bhtMode?: BhtMode;
  requireNafkah?: boolean;
  dateField?: DateField;
  limit?: number;
}): Promise<SippLocalCase[]> {
  const keywords = opts.keywords.map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) throw new Error("Minimal satu kata kunci");

  const bhtMode: BhtMode =
    opts.bhtMode ||
    (opts.onlyBht === false ? "none" : "strict");
  const requireNafkah = opts.requireNafkah !== false;
  const dateField: DateField = opts.dateField || "putusan";
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 2000));
  const dateFrom = toDateParam(opts.dateFrom);
  const dateTo = toDateParam(opts.dateTo);

  const keywordConds: string[] = [];
  const params: Record<string, string | number> = {
    limit,
    amarLen: AMAR_FETCH_CHARS,
  };

  keywords.forEach((kw, i) => {
    const key = `kw${i}`;
    params[key] = `%${kw}%`;
    keywordConds.push(
      `(p.jenis_perkara_nama LIKE :${key} OR p.jenis_perkara_text LIKE :${key} OR p.nomor_perkara LIKE :${key})`,
    );
  });

  let bhtClause = "";
  if (bhtMode === "strict") {
    bhtClause = "AND pp.tanggal_bht IS NOT NULL";
  } else if (bhtMode === "prefer") {
    bhtClause = `AND (
        pp.tanggal_bht IS NOT NULL
        OR ac.perkara_id IS NOT NULL
        OR p.proses_terakhir_text LIKE '%Akta Cerai%'
        OR p.proses_terakhir_text LIKE '%BHT%'
        OR p.proses_terakhir_text LIKE '%Berkekuatan%'
        OR p.proses_terakhir_text LIKE '%inkracht%'
      )`;
  }

  const nafkahClause = requireNafkah
    ? `AND (
        pp.amar_putusan LIKE '%nafkah%'
        OR pp.amar_putusan LIKE '%iddah%'
        OR pp.amar_putusan LIKE '%mut%ah%'
        OR pp.amar_putusan LIKE '%mutah%'
        OR pp.amar_putusan LIKE '%hadhanah%'
        OR pp.amar_putusan LIKE '%madhiyah%'
        OR p.petitum LIKE '%nafkah%'
        OR p.petitum LIKE '%iddah%'
        OR p.petitum LIKE '%mut%ah%'
        OR p.petitum LIKE '%mutah%'
        OR p.petitum LIKE '%hadhanah%'
        OR p.posita LIKE '%nafkah%'
        OR EXISTS (
          SELECT 1 FROM perkara_anak_pihak pap
          WHERE pap.perkara_id = p.perkara_id
            AND pap.jumlah_nafkah IS NOT NULL
            AND pap.jumlah_nafkah > 0
        )
      )`
    : "";

  let dateClause = "";
  const dateCol =
    dateField === "putusan" ? "pp.tanggal_putusan" : "p.tanggal_pendaftaran";
  if (dateFrom) {
    params.dateFrom = dateFrom;
    dateClause += ` AND ${dateCol} >= :dateFrom`;
  }
  if (dateTo) {
    params.dateTo = dateTo;
    dateClause += ` AND ${dateCol} <= :dateTo`;
  }

  const mustHavePutusan = "AND pp.perkara_id IS NOT NULL";

  const pool = getSippLocalPool();
  const probe = await probeSippSchema(pool);
  const extraNom = buildExtraNominalSelect(probe);

  const pdfSelect = `
      pp.amar_putusan_dok,
      pp.amar_putusan_anonimisasi_dok,
      (
        SELECT pd.lokasi_file FROM perkara_dokumen pd
        WHERE pd.perkara_id = p.perkara_id
          AND (
            LOWER(COALESCE(pd.nama_dokumen,'')) LIKE '%putusan%'
            OR LOWER(COALESCE(pd.nama_file,'')) LIKE '%.pdf%'
            OR LOWER(COALESCE(pd.lokasi_file,'')) LIKE '%.pdf%'
          )
        ORDER BY pd.id DESC
        LIMIT 1
      ) AS dokumen_putusan_path,
      (
        SELECT pd.nama_dokumen FROM perkara_dokumen pd
        WHERE pd.perkara_id = p.perkara_id
          AND (
            LOWER(COALESCE(pd.nama_dokumen,'')) LIKE '%putusan%'
            OR LOWER(COALESCE(pd.nama_file,'')) LIKE '%.pdf%'
            OR LOWER(COALESCE(pd.lokasi_file,'')) LIKE '%.pdf%'
          )
        ORDER BY pd.id DESC
        LIMIT 1
      ) AS dokumen_putusan_nama,
      (
        SELECT dd.path_filename FROM dirput_dokumen dd
        WHERE dd.perkara_id = p.perkara_id
        ORDER BY dd.id DESC
        LIMIT 1
      ) AS dirput_path,
      (
        SELECT dd.link_dirput FROM dirput_dokumen dd
        WHERE dd.perkara_id = p.perkara_id
          AND dd.link_dirput IS NOT NULL
          AND dd.link_dirput <> ''
        ORDER BY dd.id DESC
        LIMIT 1
      ) AS dirput_link
  `;

  const sql = `
    SELECT
      p.perkara_id,
      p.nomor_perkara,
      p.tanggal_pendaftaran,
      p.jenis_perkara_nama,
      p.jenis_perkara_text,
      p.proses_terakhir_id,
      p.proses_terakhir_text,
      p.tahapan_terakhir_id,
      p.tahapan_terakhir_text,
      p.pihak1_text,
      p.pihak2_text,
      p.pihak_dipublikasikan,
      LEFT(p.petitum, 4000) AS petitum_excerpt,
      LEFT(p.posita, 2500) AS posita_excerpt,
      pp.tanggal_putusan,
      pp.tanggal_minutasi,
      pp.tanggal_bht,
      pp.putusan_verstek,
      pp.status_putusan_nama,
      LEFT(pp.amar_putusan, :amarLen) AS amar_excerpt,
      CHAR_LENGTH(pp.amar_putusan) AS amar_char_count,
      LEFT(ph.pertimbangan_hukum, 5000) AS pertimbangan_excerpt,
      ac.nomor_akta_cerai,
      ac.tgl_akta_cerai,
      ac.tgl_penyerahan_akta_cerai,
      ac.jenis_cerai,
      (ac.perkara_id IS NOT NULL) AS has_akta,
      (
        SELECT ph1.pekerjaan
        FROM perkara_pihak1 pp1
        JOIN pihak ph1 ON ph1.id = pp1.pihak_id
        WHERE pp1.perkara_id = p.perkara_id
        ORDER BY pp1.urutan ASC, pp1.id ASC
        LIMIT 1
      ) AS pekerjaan_pihak1,
      (
        SELECT ph2.pekerjaan
        FROM perkara_pihak2 pp2
        JOIN pihak ph2 ON ph2.id = pp2.pihak_id
        WHERE pp2.perkara_id = p.perkara_id
        ORDER BY pp2.urutan ASC, pp2.id ASC
        LIMIT 1
      ) AS pekerjaan_pihak2,
      (
        SELECT COUNT(*) FROM perkara_anak_pihak pap
        WHERE pap.perkara_id = p.perkara_id
      ) AS anak_count,
      (
        SELECT SUM(pap.jumlah_nafkah) FROM perkara_anak_pihak pap
        WHERE pap.perkara_id = p.perkara_id
          AND pap.jumlah_nafkah IS NOT NULL
      ) AS anak_jumlah_nafkah_sum,
      ${pdfSelect}
      ${extraNom.selectSql}
    FROM perkara p
    INNER JOIN perkara_putusan pp ON pp.perkara_id = p.perkara_id
    LEFT JOIN perkara_akta_cerai ac ON ac.perkara_id = p.perkara_id
    LEFT JOIN perkara_pertimbangan_hukum ph ON ph.perkara_id = p.perkara_id
    WHERE (${keywordConds.join(" OR ")})
    ${mustHavePutusan}
    ${bhtClause}
    ${nafkahClause}
    ${dateClause}
    ORDER BY
      CASE WHEN pp.tanggal_bht IS NULL THEN 1 ELSE 0 END,
      COALESCE(pp.tanggal_putusan, p.tanggal_pendaftaran) DESC,
      p.perkara_id DESC
    LIMIT :limit
  `;

  assertSelectOnly(sql);
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);

  const probeSummary = {
    presentNominalColumns: probe.presentNominalColumns,
    notes: probe.notes,
    probed_at: probe.probed_at,
  };

  return rows.map((r) => {
    const tanggal_bht = r.tanggal_bht ? String(r.tanggal_bht) : null;
    const proses = r.proses_terakhir_text ? String(r.proses_terakhir_text) : null;
    const has_akta = Boolean(Number(r.has_akta));
    const amar_char_count = Number(r.amar_char_count ?? 0);
    const amar_excerpt = r.amar_excerpt ? String(r.amar_excerpt) : null;
    const anak_sum =
      r.anak_jumlah_nafkah_sum != null ? Number(r.anak_jumlah_nafkah_sum) : null;
    const dbItems = dbNominalsFromRow(
      r as Record<string, unknown>,
      extraNom.kinds,
    );
    const nominals = mergeNominals({
      dbItems,
      anakSum: anak_sum,
      amarText: amar_excerpt,
    });
    const pdf_refs = collectPdfRefs(r as Record<string, unknown>);
    const nafkah_signal =
      (anak_sum != null && anak_sum > 0) ||
      nominals.items.length > 0 ||
      /nafkah|iddah|mut.?ah|mutah|hadhanah|madhiyah/i.test(
        `${amar_excerpt || ""} ${r.petitum_excerpt || ""} ${r.posita_excerpt || ""}`,
      );

    return {
      perkara_id: Number(r.perkara_id),
      nomor_perkara: String(r.nomor_perkara || ""),
      tanggal_pendaftaran: r.tanggal_pendaftaran
        ? String(r.tanggal_pendaftaran)
        : null,
      jenis_perkara_nama: r.jenis_perkara_nama
        ? String(r.jenis_perkara_nama)
        : null,
      jenis_perkara_text: r.jenis_perkara_text
        ? String(r.jenis_perkara_text)
        : null,
      proses_terakhir_id:
        r.proses_terakhir_id != null ? Number(r.proses_terakhir_id) : null,
      proses_terakhir_text: proses,
      tahapan_terakhir_id:
        r.tahapan_terakhir_id != null ? Number(r.tahapan_terakhir_id) : null,
      tahapan_terakhir_text: r.tahapan_terakhir_text
        ? String(r.tahapan_terakhir_text)
        : null,
      pihak1_text: r.pihak1_text != null ? String(r.pihak1_text) : null,
      pihak2_text: r.pihak2_text != null ? String(r.pihak2_text) : null,
      pihak_dipublikasikan:
        r.pihak_dipublikasikan != null ? String(r.pihak_dipublikasikan) : null,
      tanggal_putusan: r.tanggal_putusan ? String(r.tanggal_putusan) : null,
      tanggal_minutasi: r.tanggal_minutasi ? String(r.tanggal_minutasi) : null,
      tanggal_bht,
      putusan_verstek: r.putusan_verstek != null ? String(r.putusan_verstek) : null,
      status_putusan_nama: r.status_putusan_nama
        ? String(r.status_putusan_nama)
        : null,
      amar_excerpt,
      amar_char_count,
      amar_truncated: amar_char_count > AMAR_FETCH_CHARS,
      petitum_excerpt: r.petitum_excerpt ? String(r.petitum_excerpt) : null,
      posita_excerpt: r.posita_excerpt ? String(r.posita_excerpt) : null,
      pertimbangan_excerpt: r.pertimbangan_excerpt
        ? String(r.pertimbangan_excerpt)
        : null,
      nomor_akta_cerai: r.nomor_akta_cerai ? String(r.nomor_akta_cerai) : null,
      tgl_akta_cerai: r.tgl_akta_cerai ? String(r.tgl_akta_cerai) : null,
      tgl_penyerahan_akta_cerai: r.tgl_penyerahan_akta_cerai
        ? String(r.tgl_penyerahan_akta_cerai)
        : null,
      jenis_cerai: r.jenis_cerai ? String(r.jenis_cerai) : null,
      pekerjaan_pihak1: r.pekerjaan_pihak1 ? String(r.pekerjaan_pihak1) : null,
      pekerjaan_pihak2: r.pekerjaan_pihak2 ? String(r.pekerjaan_pihak2) : null,
      anak_count: Number(r.anak_count ?? 0),
      anak_jumlah_nafkah_sum: anak_sum,
      bht_basis: resolveBhtBasis({ tanggal_bht, has_akta, proses }),
      nafkah_signal,
      amar_putusan_dok: r.amar_putusan_dok ? String(r.amar_putusan_dok) : null,
      amar_putusan_anonimisasi_dok: r.amar_putusan_anonimisasi_dok
        ? String(r.amar_putusan_anonimisasi_dok)
        : null,
      pdf_refs,
      nominals,
      schema_probe: probeSummary,
    };
  });
}
