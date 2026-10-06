/**
 * Nominal nafkah dari SIPP:
 * 1) Kolom terstruktur bila ada di DB satker (probe INFORMATION_SCHEMA —
 *    dump sipp32.sql hanya punya perkara_anak_pihak.jumlah_nafkah untuk anak;
 *    beberapa instalasi PA menampilkan/menyimpan iddah–mut’ah di UI/patch).
 * 2) Fallback parse dari amar_putusan (bukan mengganti angka DB).
 */

export type NominalSource = "db_column" | "anak_jumlah_nafkah" | "amar_parse";

export type NominalItem = {
  kind: "iddah" | "mutah" | "hadhanah" | "madhiyah";
  amount: number;
  raw: string;
  source: NominalSource;
  source_field: string;
  evidence?: string;
};

export type NominalBundle = {
  iddah: NominalItem | null;
  mutah: NominalItem | null;
  hadhanah: NominalItem | null;
  madhiyah: NominalItem | null;
  items: NominalItem[];
  notes: string[];
};

/** Kandidat kolom yang kadang ada di patch/instalasi SIPP PA (dicek via information_schema). */
export const NOMINAL_COLUMN_CANDIDATES: Array<{
  table: string;
  column: string;
  kind: NominalItem["kind"];
}> = [
  { table: "perkara_putusan", column: "nafkah_iddah", kind: "iddah" },
  { table: "perkara_putusan", column: "iddah", kind: "iddah" },
  { table: "perkara_putusan", column: "uang_iddah", kind: "iddah" },
  { table: "perkara_putusan", column: "jumlah_iddah", kind: "iddah" },
  { table: "perkara_putusan", column: "mutah", kind: "mutah" },
  { table: "perkara_putusan", column: "mutaah", kind: "mutah" },
  { table: "perkara_putusan", column: "uang_mutah", kind: "mutah" },
  { table: "perkara_putusan", column: "uang_mutaah", kind: "mutah" },
  { table: "perkara_putusan", column: "nafkah_mutah", kind: "mutah" },
  { table: "perkara_putusan", column: "jumlah_mutah", kind: "mutah" },
  { table: "perkara_putusan", column: "nafkah_anak", kind: "hadhanah" },
  { table: "perkara_putusan", column: "hadhanah", kind: "hadhanah" },
  { table: "perkara_putusan", column: "jumlah_nafkah_anak", kind: "hadhanah" },
  { table: "perkara_putusan", column: "madhiyah", kind: "madhiyah" },
  { table: "perkara_putusan", column: "nafkah_madhiyah", kind: "madhiyah" },
  { table: "perkara_putusan", column: "uang_madhiyah", kind: "madhiyah" },
];

/** Kolom yang pasti ada di sipp32.sql dump */
export const CONFIRMED_DUMP_NOMINALS = {
  anak: {
    table: "perkara_anak_pihak",
    column: "jumlah_nafkah",
    kind: "hadhanah" as const,
  },
};

export function parseRpAmount(raw: string): number | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // "Rp 1.000.000,-" / "Rp1.000.000" / "1000000"
  s = s.replace(/rp\.?\s*/i, "").replace(/,-\s*$/, "").trim();
  // Indonesian thousand dots
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(/,.*/, "");
  } else if (/^\d+,\d+$/.test(s)) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/[^\d.]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function snippet(text: string, index: number, len = 90): string {
  const a = Math.max(0, index - 20);
  const b = Math.min(text.length, index + len);
  return text.slice(a, b).replace(/\s+/g, " ").trim();
}

/**
 * Ekstrak nominal dari teks amar/petitum.
 * Pola tipikal SIPP/putusan PA: "nafkah iddah sebesar Rp …", "mut'ah sejumlah Rp …"
 */
export function extractNominalsFromAmar(text: string | null | undefined): NominalItem[] {
  if (!text) return [];
  const items: NominalItem[] = [];
  const rules: Array<{ kind: NominalItem["kind"]; re: RegExp }> = [
    {
      kind: "iddah",
      re: /(?:nafkah\s+)?iddah[^0-9Rp]{0,40}(?:sebesar|sejumlah|sebanyak|sebesar\s*)?(?:rp\.?\s*)?([\d.]+(?:\.\d{3})*(?:,\d+)?)/gi,
    },
    {
      kind: "mutah",
      re: /mut\s*['’`]?\s*a+h[^0-9Rp]{0,40}(?:sebesar|sejumlah|sebanyak)?(?:\s*rp\.?\s*)?([\d.]+(?:\.\d{3})*(?:,\d+)?)/gi,
    },
    {
      kind: "hadhanah",
      re: /(?:nafkah\s+anak|hadhanah|nafkah\s+pemeliharaan(?:\s+anak)?)[^0-9Rp]{0,50}(?:sebesar|sejumlah|sebanyak)?(?:\s*rp\.?\s*)?([\d.]+(?:\.\d{3})*(?:,\d+)?)/gi,
    },
    {
      kind: "madhiyah",
      re: /(?:nafkah\s+)?madhiyah[^0-9Rp]{0,40}(?:sebesar|sejumlah|sebanyak)?(?:\s*rp\.?\s*)?([\d.]+(?:\.\d{3})*(?:,\d+)?)/gi,
    },
  ];

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const amount = parseRpAmount(m[1]);
      if (amount == null) continue;
      items.push({
        kind: rule.kind,
        amount,
        raw: m[1],
        source: "amar_parse",
        source_field: "perkara_putusan.amar_putusan",
        evidence: snippet(text, m.index),
      });
      break; // first hit per kind
    }
  }
  return items;
}

export function mergeNominals(opts: {
  dbItems?: NominalItem[];
  anakSum?: number | null;
  amarText?: string | null;
}): NominalBundle {
  const byKind = new Map<NominalItem["kind"], NominalItem>();
  const notes: string[] = [];

  for (const it of opts.dbItems || []) {
    byKind.set(it.kind, it);
  }

  if (
    opts.anakSum != null &&
    Number(opts.anakSum) > 0 &&
    !byKind.has("hadhanah")
  ) {
    byKind.set("hadhanah", {
      kind: "hadhanah",
      amount: Number(opts.anakSum),
      raw: String(opts.anakSum),
      source: "anak_jumlah_nafkah",
      source_field: "perkara_anak_pihak.jumlah_nafkah",
      evidence: "SUM(jumlah_nafkah) anak",
    });
  }

  const fromAmar = extractNominalsFromAmar(opts.amarText);
  for (const it of fromAmar) {
    if (!byKind.has(it.kind)) {
      byKind.set(it.kind, it);
      notes.push(
        `${it.kind}: diambil dari parse amar (tidak ada kolom typed di DB untuk field ini).`,
      );
    }
  }

  if (!byKind.has("iddah") && !byKind.has("mutah")) {
    notes.push(
      "Belum ada angka iddah/mut'ah dari kolom typed maupun parse amar pada cuplikan ini — " +
        "cek PDF (amar_putusan_dok) atau sync dengan SIPP_PDF_BASE_URL di LAN satker.",
    );
  }

  const items = [...byKind.values()];
  return {
    iddah: byKind.get("iddah") || null,
    mutah: byKind.get("mutah") || null,
    hadhanah: byKind.get("hadhanah") || null,
    madhiyah: byKind.get("madhiyah") || null,
    items,
    notes,
  };
}

export function formatNominalId(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function nominalsToRingkas(bundle: NominalBundle): string {
  const parts: string[] = [];
  if (bundle.iddah) parts.push(`iddah ${formatNominalId(bundle.iddah.amount)}`);
  if (bundle.mutah) parts.push(`mut'ah ${formatNominalId(bundle.mutah.amount)}`);
  if (bundle.hadhanah)
    parts.push(`anak ${formatNominalId(bundle.hadhanah.amount)}`);
  if (bundle.madhiyah)
    parts.push(`madhiyah ${formatNominalId(bundle.madhiyah.amount)}`);
  return parts.join("; ");
}
