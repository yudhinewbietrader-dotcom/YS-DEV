/**
 * Klien read-only ke MariaDB/MySQL SIPP lokal (database tipikal: sipp32).
 *
 * WA-gateway / wabot sinkron SIPP tidak ditemukan di YS-DEV maupun repo publik
 * owner yang sama (saat penelusuran). Mapping tabel/kolom diturunkan dari
 * `sipp32.sql` di root repo — lihat docs/sipp-lokal-sync.md.
 *
 * Keamanan:
 * - Hanya SELECT (assertSelectOnly)
 * - Kredensial dari env user (SIPP_DB_*)
 * - Tidak ada bypass SIPP web
 */

import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

export type SippLocalConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

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
  amar_excerpt: string | null;
  nomor_akta_cerai: string | null;
  tgl_akta_cerai: string | null;
  tgl_penyerahan_akta_cerai: string | null;
  jenis_cerai: string | null;
};

const globalForSipp = globalThis as unknown as { __sippLocalPool?: Pool };

export function getSippLocalConfig(): SippLocalConfig {
  const enabledRaw = (process.env.SIPP_DB_ENABLED || "").toLowerCase();
  const host = process.env.SIPP_DB_HOST || process.env.DB_HOST || "";
  const user = process.env.SIPP_DB_USER || process.env.DB_USER || "";
  const password = process.env.SIPP_DB_PASSWORD || process.env.DB_PASSWORD || "";
  const database =
    process.env.SIPP_DB_NAME || process.env.DB_NAME || process.env.DB_DATABASE || "sipp32";
  const port = Number(process.env.SIPP_DB_PORT || process.env.DB_PORT || 3306);

  const enabled =
    enabledRaw === "1" ||
    enabledRaw === "true" ||
    enabledRaw === "yes" ||
    (enabledRaw === "" && Boolean(host && user));

  return { enabled, host, port, user, password, database };
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
      "SIPP lokal belum dikonfigurasi. Isi SIPP_DB_ENABLED=true dan SIPP_DB_HOST/USER/PASSWORD/NAME di .env.local.",
    );
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
      // sesuaikan charset umum SIPP
      charset: "utf8mb4",
      dateStrings: true,
      // fail fast
      connectTimeout: 10000,
    });
  }
  return globalForSipp.__sippLocalPool;
}

export async function testSippLocalConnection(): Promise<{
  ok: boolean;
  database: string;
  host: string;
  sampleCount?: number;
  error?: string;
}> {
  const cfg = getSippLocalConfig();
  if (!cfg.enabled) {
    return { ok: false, database: cfg.database, host: cfg.host, error: "SIPP_DB_ENABLED tidak aktif" };
  }
  try {
    const pool = getSippLocalPool();
    const sql = "SELECT COUNT(*) AS n FROM perkara LIMIT 1";
    assertSelectOnly(sql);
    const [rows] = await pool.query<RowDataPacket[]>(sql);
    return {
      ok: true,
      database: cfg.database,
      host: cfg.host,
      sampleCount: Number(rows[0]?.n ?? 0),
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
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m1) {
    return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  }
  // "01 Jan 2024"
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
    october: "10",
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

/**
 * Cari perkara BHT/final dari SIPP lokal.
 * Asumsi mapping (sipp32.sql):
 * - perkara (inti)
 * - perkara_putusan.tanggal_bht
 * - perkara_akta_cerai (proxy pasca-BHT cerai)
 * - proses_terakhir_text mengandung Akta Cerai / BHT / Berkekuatan
 */
export async function searchSippLocalBht(opts: {
  keywords: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyBht?: boolean;
  limit?: number;
}): Promise<SippLocalCase[]> {
  const keywords = opts.keywords.map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) throw new Error("Minimal satu kata kunci");

  const onlyBht = opts.onlyBht !== false;
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 2000));
  const dateFrom = toDateParam(opts.dateFrom);
  const dateTo = toDateParam(opts.dateTo);

  const keywordConds: string[] = [];
  const params: Record<string, string | number> = { limit };

  keywords.forEach((kw, i) => {
    const key = `kw${i}`;
    params[key] = `%${kw}%`;
    keywordConds.push(
      `(p.jenis_perkara_nama LIKE :${key} OR p.jenis_perkara_text LIKE :${key} OR p.nomor_perkara LIKE :${key} OR p.proses_terakhir_text LIKE :${key})`,
    );
  });

  const bhtClause = onlyBht
    ? `AND (
        pp.tanggal_bht IS NOT NULL
        OR ac.perkara_id IS NOT NULL
        OR p.proses_terakhir_text LIKE '%Akta Cerai%'
        OR p.proses_terakhir_text LIKE '%BHT%'
        OR p.proses_terakhir_text LIKE '%Berkekuatan%'
        OR p.proses_terakhir_text LIKE '%inkracht%'
      )`
    : "";

  let dateClause = "";
  if (dateFrom) {
    params.dateFrom = dateFrom;
    dateClause += " AND p.tanggal_pendaftaran >= :dateFrom";
  }
  if (dateTo) {
    params.dateTo = dateTo;
    dateClause += " AND p.tanggal_pendaftaran <= :dateTo";
  }

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
      pp.tanggal_putusan,
      pp.tanggal_minutasi,
      pp.tanggal_bht,
      pp.putusan_verstek,
      pp.status_putusan_nama,
      LEFT(pp.amar_putusan, 2000) AS amar_excerpt,
      ac.nomor_akta_cerai,
      ac.tgl_akta_cerai,
      ac.tgl_penyerahan_akta_cerai,
      ac.jenis_cerai
    FROM perkara p
    LEFT JOIN perkara_putusan pp ON pp.perkara_id = p.perkara_id
    LEFT JOIN perkara_akta_cerai ac ON ac.perkara_id = p.perkara_id
    WHERE (${keywordConds.join(" OR ")})
    ${bhtClause}
    ${dateClause}
    ORDER BY p.tanggal_pendaftaran DESC, p.perkara_id DESC
    LIMIT :limit
  `;

  assertSelectOnly(sql);
  const pool = getSippLocalPool();
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((r) => ({
    perkara_id: Number(r.perkara_id),
    nomor_perkara: String(r.nomor_perkara || ""),
    tanggal_pendaftaran: r.tanggal_pendaftaran ? String(r.tanggal_pendaftaran) : null,
    jenis_perkara_nama: r.jenis_perkara_nama ? String(r.jenis_perkara_nama) : null,
    jenis_perkara_text: r.jenis_perkara_text ? String(r.jenis_perkara_text) : null,
    proses_terakhir_id: r.proses_terakhir_id != null ? Number(r.proses_terakhir_id) : null,
    proses_terakhir_text: r.proses_terakhir_text ? String(r.proses_terakhir_text) : null,
    tahapan_terakhir_id: r.tahapan_terakhir_id != null ? Number(r.tahapan_terakhir_id) : null,
    tahapan_terakhir_text: r.tahapan_terakhir_text ? String(r.tahapan_terakhir_text) : null,
    pihak1_text: r.pihak1_text != null ? String(r.pihak1_text) : null,
    pihak2_text: r.pihak2_text != null ? String(r.pihak2_text) : null,
    pihak_dipublikasikan: r.pihak_dipublikasikan != null ? String(r.pihak_dipublikasikan) : null,
    tanggal_putusan: r.tanggal_putusan ? String(r.tanggal_putusan) : null,
    tanggal_minutasi: r.tanggal_minutasi ? String(r.tanggal_minutasi) : null,
    tanggal_bht: r.tanggal_bht ? String(r.tanggal_bht) : null,
    putusan_verstek: r.putusan_verstek != null ? String(r.putusan_verstek) : null,
    status_putusan_nama: r.status_putusan_nama ? String(r.status_putusan_nama) : null,
    amar_excerpt: r.amar_excerpt ? String(r.amar_excerpt) : null,
    nomor_akta_cerai: r.nomor_akta_cerai ? String(r.nomor_akta_cerai) : null,
    tgl_akta_cerai: r.tgl_akta_cerai ? String(r.tgl_akta_cerai) : null,
    tgl_penyerahan_akta_cerai: r.tgl_penyerahan_akta_cerai
      ? String(r.tgl_penyerahan_akta_cerai)
      : null,
    jenis_cerai: r.jenis_cerai ? String(r.jenis_cerai) : null,
  }));
}
