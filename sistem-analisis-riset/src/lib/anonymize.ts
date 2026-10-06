/** Masking identitas untuk etika penelitian (proposal §3.5). */

const PARTY_LABELS = /^(Pemohon|Termohon|Penggugat|Tergugat|Pemohon Intervensi)\s*:?\s*/i;

export function maskPartyText(raw: string | null | undefined): string {
  if (!raw) return "Disamarkan";
  const cleaned = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
  if (!cleaned || /disamarkan/i.test(cleaned)) return "Disamarkan";

  // Pertahankan peran (Penggugat/Tergugat), samarkan nama
  const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "Disamarkan";

  return lines
    .map((line) => {
      const m = line.match(PARTY_LABELS);
      if (m) return `${m[1]}: Disamarkan`;
      if (/^[A-Za-zÀ-ÿ.'\-\s]+(bin|binti|bt\.|b\.)/i.test(line)) return "Disamarkan";
      if (line.length > 2 && !/^\d/.test(line)) return "Disamarkan";
      return line;
    })
    .join("; ");
}

export function maskNomorPerkara(nomor: string, code: string): string {
  // Simpan struktur tahun/jenis untuk analisis, samarkan nomor urut di laporan publik
  // Di database internal peneliti nomor asli boleh disimpan; ekspor publik memakai kode samaran.
  void nomor;
  return code;
}

export function makeBerkasCode(year: number | string, seq: number): string {
  return `BK-${year}-${String(seq).padStart(3, "0")}`;
}

export function makeInformanCode(role: string, seq: number): string {
  const prefix =
    role === "hakim" ? "HK" : role === "panitera" ? "PP" : role === "ketua" ? "KT" : "IN";
  return `${prefix}-${String(seq).padStart(2, "0")}`;
}
