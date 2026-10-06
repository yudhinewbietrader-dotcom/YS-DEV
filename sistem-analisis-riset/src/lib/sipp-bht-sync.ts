import { getDb } from "./db";
import { makeBerkasCode, maskPartyText } from "./anonymize";
import {
  BHT_PROXY_SEARCH_TERMS,
  dateInRange,
  isBhtStatus,
  searchSippPublicPaginated,
  type SippListItem,
} from "./sipp";

export type BhtSyncQueryLog = {
  query: string;
  pagesFetched: number;
  rowsScanned: number;
  totalReported: number | null;
  truncated: boolean;
};

export type BhtSyncResult = {
  keywords: string[];
  queries: BhtSyncQueryLog[];
  found: number;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  skippedNonBht: number;
  skippedDate: number;
  skippedJenis: number;
  truncated: boolean;
  samples: Array<{
    nomor_perkara: string;
    jenis_perkara: string;
    status_perkara: string;
    action: "imported" | "updated" | "skipped";
  }>;
  note: string;
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

function isProxyTerm(q: string): boolean {
  const n = q.toLowerCase();
  return BHT_PROXY_SEARCH_TERMS.some((t) => t.toLowerCase() === n);
}

function jenisMatchesKeywords(jenis: string, keywords: string[]): boolean {
  const caseKeywords = keywords.filter((k) => !isProxyTerm(k));
  if (caseKeywords.length === 0) return true;
  const j = jenis.toLowerCase();
  return caseKeywords.some((k) => j.includes(k.toLowerCase()));
}

function buildSearchPlan(keywords: string[]): string[] {
  const plan = [...keywords];
  // Jika peneliti memberi jenis perkara (Cerai Gugat, dll.), tambahkan pencarian
  // proxy BHT/akta cerai agar perkara final terambil meski halaman awal keyword masih "Sidang pertama".
  const hasCaseType = keywords.some((k) => !isProxyTerm(k));
  if (hasCaseType) {
    for (const t of ["Pembuatan Akta Cerai", "Penyerahan Akta Cerai"]) {
      if (!plan.some((p) => p.toLowerCase() === t.toLowerCase())) plan.push(t);
    }
  }
  return plan;
}

function upsertCase(item: SippListItem): "imported" | "updated" | "skipped" {
  const db = getDb();
  const existing = db
    .prepare("SELECT id, kode_berkas FROM cases WHERE nomor_perkara = ?")
    .get(item.nomor_perkara) as { id: number; kode_berkas: string } | undefined;

  const pihak = maskPartyText(item.para_pihak_masked);
  const year =
    Number(item.nomor_perkara.match(/\/(\d{4})\//)?.[1]) ||
    new Date().getFullYear();

  if (existing) {
    db.prepare(
      `UPDATE cases SET
        jenis_perkara = COALESCE(?, jenis_perkara),
        tanggal_register = COALESCE(?, tanggal_register),
        status_perkara = ?,
        para_pihak_masked = ?,
        sipp_detail_url = COALESCE(?, sipp_detail_url),
        sumber = CASE WHEN sumber = 'demo' THEN sumber ELSE 'sipp_bht_sync' END,
        updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      item.jenis_perkara || null,
      item.tanggal_register || null,
      item.status_perkara || null,
      pihak,
      item.detail_url || null,
      existing.id,
    );
    return "updated";
  }

  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM cases WHERE tahun = ?").get(year) as {
      n: number;
    }
  ).n;
  const kode = makeBerkasCode(year, count + 1);
  db.prepare(
    `INSERT INTO cases (
      kode_berkas, nomor_perkara, jenis_perkara, tanggal_register,
      status_perkara, para_pihak_masked, sipp_detail_url, sumber, tahun, coding_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sipp_bht_sync', ?, 'draft')`,
  ).run(
    kode,
    item.nomor_perkara,
    item.jenis_perkara || null,
    item.tanggal_register || null,
    item.status_perkara || null,
    pihak,
    item.detail_url || null,
    year,
  );
  return "imported";
}

export async function syncBhtCases(opts: {
  keywords: string | string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  maxPagesPerQuery?: number;
  refreshExisting?: boolean;
}): Promise<BhtSyncResult> {
  const keywords = splitKeywords(opts.keywords);
  if (keywords.length === 0) {
    throw new Error("Minimal satu kata kunci diperlukan");
  }

  const maxPages = Math.max(1, Math.min(opts.maxPagesPerQuery ?? 10, 40));
  const refreshExisting = opts.refreshExisting !== false;
  const plan = buildSearchPlan(keywords);

  const queries: BhtSyncQueryLog[] = [];
  const pooled = new Map<string, SippListItem>();
  let truncated = false;
  let skippedNonBht = 0;
  let skippedDate = 0;
  let skippedJenis = 0;

  for (const query of plan) {
    const pageResult = await searchSippPublicPaginated(query, {
      maxPages,
      useCache: true,
    });
    queries.push({
      query,
      pagesFetched: pageResult.pagesFetched,
      rowsScanned: pageResult.items.length,
      totalReported: pageResult.totalReported,
      truncated: pageResult.truncated,
    });
    if (pageResult.truncated) truncated = true;

    for (const item of pageResult.items) {
      if (!isBhtStatus(item.status_perkara)) {
        skippedNonBht++;
        continue;
      }
      if (!dateInRange(item.tanggal_register, opts.dateFrom, opts.dateTo)) {
        skippedDate++;
        continue;
      }
      // Untuk hasil dari proxy "Akta Cerai", wajib cocok jenis dengan kata kunci perkara
      if (isProxyTerm(query) && !jenisMatchesKeywords(item.jenis_perkara, keywords)) {
        skippedJenis++;
        continue;
      }
      // Untuk hasil dari keyword perkara sendiri, status sudah BHT — tetap masuk
      pooled.set(item.nomor_perkara, item);
    }
  }

  let imported = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  const samples: BhtSyncResult["samples"] = [];

  const tx = getDb().transaction((items: SippListItem[]) => {
    for (const item of items) {
      const existing = getDb()
        .prepare("SELECT id FROM cases WHERE nomor_perkara = ?")
        .get(item.nomor_perkara);
      if (existing && !refreshExisting) {
        skippedDuplicates++;
        if (samples.length < 12) {
          samples.push({
            nomor_perkara: item.nomor_perkara,
            jenis_perkara: item.jenis_perkara,
            status_perkara: item.status_perkara,
            action: "skipped",
          });
        }
        continue;
      }
      const action = upsertCase(item);
      if (action === "imported") imported++;
      else if (action === "updated") {
        updated++;
        skippedDuplicates++; // sudah ada sebelumnya
      }
      if (samples.length < 12) {
        samples.push({
          nomor_perkara: item.nomor_perkara,
          jenis_perkara: item.jenis_perkara,
          status_perkara: item.status_perkara,
          action: action === "imported" ? "imported" : "updated",
        });
      }
    }
  });
  tx([...pooled.values()]);

  return {
    keywords,
    queries,
    found: pooled.size,
    imported,
    updated,
    skippedDuplicates,
    skippedNonBht,
    skippedDate,
    skippedJenis,
    truncated,
    samples,
    note:
      "SIPP publik PA Sambas jarang menampilkan teks status 'BHT' secara harfiah. " +
      "Filter BHT mencakup variasi 'Berkekuatan Hukum Tetap'/'BHT'/'inkracht' serta " +
      "proxy praktis 'Pembuatan/Penyerahan Akta Cerai' (tahap pasca-BHT pada perkara cerai). " +
      "Hanya halaman publik; pagination dibatasi maxPagesPerQuery demi etika rate limiting.",
  };
}
