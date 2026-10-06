/**
 * Klien SIPP publik PA Sambas — hanya halaman yang tersedia tanpa login.
 * Base URL: https://sipp.pa-sambas.go.id
 *
 * Batasan:
 * - Tidak mengakses area terotentikasi / cookie admin / API internal.
 * - Rate limiting + cache untuk etika fetch.
 * - Struktur HTML SIPP bisa berubah; impor CSV/JSON tetap jalur utama.
 */

import * as cheerio from "cheerio";
import { getDb } from "./db";
import { maskPartyText } from "./anonymize";

export const SIPP_BASE_URL =
  process.env.SIPP_BASE_URL || "https://sipp.pa-sambas.go.id";

const USER_AGENT =
  process.env.SIPP_USER_AGENT ||
  "YS-Research-Dashboard/1.0 (+thesis PA Sambas; polite public fetch)";

const MIN_INTERVAL_MS = Number(process.env.SIPP_MIN_INTERVAL_MS || 1500);
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit

let lastFetchAt = 0;

export type SippListItem = {
  nomor_perkara: string;
  tanggal_register: string;
  jenis_perkara: string;
  para_pihak_masked: string;
  status_perkara: string;
  lama_proses: string;
  detail_url: string;
};

export type SippDetail = SippListItem & {
  raw_fields: Record<string, string>;
};

async function politeFetch(url: string, init?: RequestInit): Promise<Response> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();

  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      ...(init?.headers || {}),
    },
    redirect: "follow",
    cache: "no-store",
  });
  return res;
}

function cacheGet(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT payload, fetched_at FROM sipp_cache WHERE cache_key = ?")
    .get(key) as { payload: string; fetched_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - Date.parse(row.fetched_at + "Z");
  // SQLite datetime is UTC-ish without Z; treat as local parse fallback
  const fetched = Date.parse(row.fetched_at.includes("T") ? row.fetched_at : row.fetched_at.replace(" ", "T") + "Z");
  if (Number.isFinite(fetched) && Date.now() - fetched > CACHE_TTL_MS) return null;
  void age;
  return row.payload;
}

function cacheSet(key: string, payload: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO sipp_cache (cache_key, payload, fetched_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = datetime('now')`,
  ).run(key, payload);
}

function parseListTable(html: string): SippListItem[] {
  const $ = cheerio.load(html);
  const items: SippListItem[] = [];
  $("#tablePerkaraAll tr").each((i, el) => {
    if (i === 0) return;
    const tds = $(el).find("td");
    if (tds.length < 8) return;
    const nomor = $(tds[1]).text().trim();
    if (!nomor || !/\//.test(nomor)) return;
    const detailHref = $(tds[7]).find("a").attr("href") || "";
    const detail_url = detailHref.startsWith("http")
      ? detailHref
      : detailHref
        ? new URL(detailHref, SIPP_BASE_URL).toString()
        : "";
    items.push({
      nomor_perkara: nomor,
      tanggal_register: $(tds[2]).text().trim(),
      jenis_perkara: $(tds[3]).text().trim(),
      para_pihak_masked: maskPartyText($(tds[4]).html() || $(tds[4]).text()),
      status_perkara: $(tds[5]).text().trim(),
      lama_proses: $(tds[6]).text().trim(),
      detail_url,
    });
  });
  return items;
}

async function getEncToken(cookieJar: string[]): Promise<{ enc: string; cookies: string[] }> {
  const res = await politeFetch(`${SIPP_BASE_URL}/`);
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookies = [...cookieJar, ...setCookie.map((c) => c.split(";")[0])];
  const html = await res.text();
  const $ = cheerio.load(html);
  const enc = $('input[name="enc"]').attr("value") || "";
  if (!enc) throw new Error("Token pencarian SIPP (enc) tidak ditemukan — struktur halaman mungkin berubah.");
  return { enc, cookies };
}

function cookieHeader(cookies: string[]): string {
  // keep last value per name
  const map = new Map<string, string>();
  for (const c of cookies) {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    if (i > 0) map.set(nv.slice(0, i), nv.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Pencarian kata kunci di SIPP publik (POST /list_perkara/search). */
export async function searchSippPublic(keyword: string): Promise<SippListItem[]> {
  const q = keyword.trim();
  if (!q) return [];

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as SippListItem[];

  const { enc, cookies } = await getEncToken([]);
  const body = new URLSearchParams({
    search_keyword: q,
    enc,
  });

  const res = await politeFetch(`${SIPP_BASE_URL}/list_perkara/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(cookies),
      Referer: `${SIPP_BASE_URL}/`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`SIPP search gagal: HTTP ${res.status}`);
  }

  const html = await res.text();
  const items = parseListTable(html);
  cacheSet(cacheKey, JSON.stringify(items));
  return items;
}

/** Ambil detail perkara dari URL publik show_detil. */
export async function fetchSippDetail(detailUrl: string): Promise<SippDetail> {
  if (!detailUrl.includes("sipp.pa-sambas.go.id") && !detailUrl.startsWith(SIPP_BASE_URL)) {
    throw new Error("URL detail harus dari SIPP publik PA Sambas.");
  }

  const cacheKey = `detail:${detailUrl}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached) as SippDetail;

  const res = await politeFetch(detailUrl);
  if (!res.ok) throw new Error(`SIPP detail gagal: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const raw_fields: Record<string, string> = {};
  // Tabel info utama
  const cells = $("#tableinfo tr").eq(1).find("td");
  const nomor = $(cells[0]).text().trim();
  const pihak1 = maskPartyText($(cells[1]).text());
  const pihak2 = maskPartyText($(cells[2]).text());
  const status = $(cells[3]).text().trim();

  $("#tableDetil tr, table tr").each((_, el) => {
    const tds = $(el).find("td");
    if (tds.length === 2) {
      const k = $(tds[0]).text().replace(/\s+/g, " ").trim();
      const v = $(tds[1]).text().replace(/\s+/g, " ").trim();
      if (k && v && k.length < 80) raw_fields[k] = v;
    }
  });

  // Coba baca klasifikasi dari halaman list-like fields
  const jenis =
    raw_fields["Klasifikasi Perkara"] ||
    raw_fields["Jenis Perkara"] ||
    raw_fields["Klasifikasi"] ||
    "";

  const tanggal =
    raw_fields["Tanggal Register"] ||
    raw_fields["Tanggal Pendaftaran"] ||
    "";

  const detail: SippDetail = {
    nomor_perkara: nomor,
    tanggal_register: tanggal,
    jenis_perkara: jenis,
    para_pihak_masked: [pihak1, pihak2].filter(Boolean).join("; "),
    status_perkara: status,
    lama_proses: raw_fields["Lama Proses"] || "",
    detail_url: detailUrl,
    raw_fields,
  };

  cacheSet(cacheKey, JSON.stringify(detail));
  return detail;
}

/**
 * Best-effort: cari nomor perkara di SIPP publik lalu ambil detail bila unik.
 */
export async function fetchByNomorPerkara(nomor: string): Promise<{
  list: SippListItem[];
  detail: SippDetail | null;
}> {
  const list = await searchSippPublic(nomor);
  const exact = list.filter(
    (x) => x.nomor_perkara.toLowerCase() === nomor.trim().toLowerCase(),
  );
  const pick = exact[0] || (list.length === 1 ? list[0] : null);
  if (!pick?.detail_url) return { list, detail: null };
  const detail = await fetchSippDetail(pick.detail_url);
  // Lengkapi field list yang sering lebih lengkap di halaman daftar
  if (!detail.jenis_perkara) detail.jenis_perkara = pick.jenis_perkara;
  if (!detail.tanggal_register) detail.tanggal_register = pick.tanggal_register;
  if (!detail.lama_proses) detail.lama_proses = pick.lama_proses;
  return { list, detail };
}
