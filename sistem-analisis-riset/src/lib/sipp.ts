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

/** Status publik yang menandai perkara sudah final / pasca-BHT di SIPP PA Sambas. */
export function isBhtStatus(status: string | null | undefined): boolean {
  const s = (status || "").replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (/\bBHT\b/i.test(s)) return true;
  if (/berkekuatan\s+hukum\s+tetap/i.test(s)) return true;
  if (/inkracht/i.test(s)) return true;
  // Di portal publik PA Sambas, teks "BHT" jarang muncul; tahap pasca-BHT cerai
  // biasanya tampil sebagai pembuatan/penyerahan akta cerai.
  if (/pembuatan\s+akta\s+cerai/i.test(s)) return true;
  if (/penyerahan\s+akta\s+cerai/i.test(s)) return true;
  return false;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  januari: 0,
  feb: 1,
  february: 1,
  februari: 1,
  mar: 2,
  march: 2,
  maret: 2,
  apr: 3,
  april: 3,
  may: 4,
  mei: 4,
  jun: 5,
  june: 5,
  juni: 5,
  jul: 6,
  july: 6,
  juli: 6,
  aug: 7,
  august: 7,
  agustus: 7,
  agu: 7,
  sep: 8,
  september: 8,
  sept: 8,
  oct: 9,
  october: 9,
  oktober: 9,
  okt: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  desember: 11,
  des: 11,
};

/** Parse tanggal register SIPP ("06 Oct 2026", "12 Mar 2025", "01/01/2024"). */
export function parseSippDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const t = raw.trim();
  const m1 = t.match(/^(\d{1,2})\s+([A-Za-z.]+)\s+(\d{4})$/);
  if (m1) {
    const day = Number(m1[1]);
    const mon = MONTHS[m1[2].replace(/\./g, "").toLowerCase()];
    const year = Number(m1[3]);
    if (mon == null || !day || !year) return null;
    return new Date(Date.UTC(year, mon, day));
  }
  const m2 = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m2) {
    return new Date(Date.UTC(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1])));
  }
  const parsed = Date.parse(t);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function dateInRange(
  tanggalRegister: string,
  from?: string | null,
  to?: string | null,
): boolean {
  if (!from && !to) return true;
  const d = parseSippDate(tanggalRegister);
  if (!d) return !from && !to ? true : false;
  if (from) {
    const f = parseSippDate(from) || new Date(from);
    if (Number.isFinite(+f) && d < f) return false;
  }
  if (to) {
    const t = parseSippDate(to) || new Date(to);
    if (Number.isFinite(+t) && d > t) return false;
  }
  return true;
}

function parseSearchMeta(html: string): {
  totalReported: number | null;
  pagePrefix: string | null;
  pageTokenSuffix: string | null;
} {
  const totalMatch = html.match(/Total\s*:\s*([\d.]+)\s*Perkara/i);
  const totalReported = totalMatch
    ? Number(totalMatch[1].replace(/\./g, ""))
    : null;
  const pag = html.match(
    /window\.open\('([^']*list_perkara\/(?:search_detail\/)?page\/)'\s*\+\s*pageNumber\s*\+\s*'([^']+)'/,
  );
  return {
    totalReported: Number.isFinite(totalReported as number) ? totalReported : null,
    pagePrefix: pag?.[1] || `${SIPP_BASE_URL}/list_perkara/page/`,
    pageTokenSuffix: pag?.[2] || null,
  };
}

async function postKeywordSearch(
  keyword: string,
  cookiesIn: string[],
): Promise<{ html: string; cookies: string[]; enc: string }> {
  const { enc, cookies } = await getEncToken(cookiesIn);
  const body = new URLSearchParams({ search_keyword: keyword, enc });
  const res = await politeFetch(`${SIPP_BASE_URL}/list_perkara/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(cookies),
      Referer: `${SIPP_BASE_URL}/`,
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`SIPP search gagal: HTTP ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() || [];
  const nextCookies = [...cookies, ...setCookie.map((c) => c.split(";")[0])];
  return { html: await res.text(), cookies: nextCookies, enc };
}

async function fetchSearchPage(
  page: number,
  pagePrefix: string,
  pageTokenSuffix: string,
  cookies: string[],
): Promise<{ html: string; cookies: string[] }> {
  const url = `${pagePrefix}${page}${pageTokenSuffix}`;
  const res = await politeFetch(url, {
    headers: {
      Cookie: cookieHeader(cookies),
      Referer: `${SIPP_BASE_URL}/`,
    },
  });
  if (!res.ok) throw new Error(`SIPP halaman ${page} gagal: HTTP ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() || [];
  return {
    html: await res.text(),
    cookies: [...cookies, ...setCookie.map((c) => c.split(";")[0])],
  };
}

/**
 * Pencarian publik + pagination (rate-limited).
 * maxPages membatasi jumlah halaman yang diambil (etika + waktu).
 */
export async function searchSippPublicPaginated(
  keyword: string,
  opts?: { maxPages?: number; useCache?: boolean },
): Promise<{
  items: SippListItem[];
  pagesFetched: number;
  totalReported: number | null;
  truncated: boolean;
}> {
  const q = keyword.trim();
  const maxPages = Math.max(1, Math.min(opts?.maxPages ?? 10, 50));
  if (!q) {
    return { items: [], pagesFetched: 0, totalReported: null, truncated: false };
  }

  const cacheKey = `search_pages:${q.toLowerCase()}:p${maxPages}`;
  if (opts?.useCache !== false) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        items: SippListItem[];
        pagesFetched: number;
        totalReported: number | null;
        truncated: boolean;
      };
    }
  }

  const first = await postKeywordSearch(q, []);
  const meta = parseSearchMeta(first.html);
  const page1 = parseListTable(first.html);
  const byNomor = new Map<string, SippListItem>();
  for (const it of page1) byNomor.set(it.nomor_perkara, it);

  let pagesFetched = 1;
  let cookies = first.cookies;
  let truncated = false;

  const totalPages =
    meta.totalReported != null
      ? Math.ceil(meta.totalReported / 20)
      : maxPages;

  if (meta.pageTokenSuffix && totalPages > 1) {
    const limit = Math.min(maxPages, totalPages);
    for (let page = 2; page <= limit; page++) {
      const next = await fetchSearchPage(
        page,
        meta.pagePrefix || `${SIPP_BASE_URL}/list_perkara/page/`,
        meta.pageTokenSuffix,
        cookies,
      );
      cookies = next.cookies;
      const items = parseListTable(next.html);
      for (const it of items) byNomor.set(it.nomor_perkara, it);
      pagesFetched++;
      if (items.length === 0) break;
    }
    truncated = limit < totalPages;
  }

  const result = {
    items: [...byNomor.values()],
    pagesFetched,
    totalReported: meta.totalReported,
    truncated,
  };
  cacheSet(cacheKey, JSON.stringify(result));
  return result;
}

/** Istilah pencarian tambahan untuk menangkap perkara pasca-BHT di SIPP publik. */
export const BHT_PROXY_SEARCH_TERMS = [
  "Pembuatan Akta Cerai",
  "Penyerahan Akta Cerai",
  "Berkekuatan Hukum Tetap",
  "BHT",
] as const;

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
