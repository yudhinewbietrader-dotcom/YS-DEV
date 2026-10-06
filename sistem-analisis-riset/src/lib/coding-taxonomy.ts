/**
 * Kategori pengodean — operasionalisasi app dari Bab I + instrumen wawancara +
 * field terbuka Lampiran 1C (proposal). Bukan daftar kode literal tertutup di 1C.
 *
 * 1C mensyaratkan pencatatan: jenis nafkah, pekerjaan, kehadiran, bukti,
 * indikasi asimetri, pertimbangan, ex officio/hakim aktif, nominal, catatan maqasid.
 * Checklist di bawah membantu konsistensi Bab IV; field naratif tetap wajib.
 */

export const MODUS_ASIMETRI = [
  { id: "informal", label: "Sektor informal / minim dokumen" },
  { id: "pmi", label: "PMI / pendapatan lintas negara" },
  { id: "wiraswasta", label: "Wiraswasta mandiri (fluktuatif)" },
  {
    id: "verstek",
    label: "Konteks perkara verstek (faktor pembuktian)",
  },
  { id: "penyembunyian_aset", label: "Indikasi penyembunyian aset / tadlis" },
  { id: "slip_gaji", label: "Slip gaji / bukti formal problematik" },
  { id: "pengakuan_tidak_mampu", label: "Pengakuan tidak mampu sepihak" },
  { id: "gaya_hidup_tidak_sesuai", label: "Ketidaksesuaian gaya hidup/aset" },
  { id: "lainnya", label: "Lainnya" },
] as const;

export const RESPONS_HAKIM = [
  { id: "ex_officio", label: "Hak ex officio" },
  { id: "hakim_aktif", label: "Asas hakim aktif" },
  { id: "rechtsvinding", label: "Rechtsvinding / penemuan hukum" },
  { id: "pembuktian_tidak_langsung", label: "Pembuktian tidak langsung" },
  { id: "taksiran_minimal", label: "Taksiran nominal minimal" },
  { id: "pasif_formal", label: "Cenderung pasif/formalistik" },
  { id: "lainnya", label: "Lainnya" },
] as const;

/** Fokus proposal: iddah, mut'ah, nafkah anak. Madhiyah sekunder bila muncul. */
export const OBJEK_NAFKAH = [
  { id: "iddah", label: "Nafkah iddah" },
  { id: "mutah", label: "Mut'ah" },
  { id: "hadhanah", label: "Nafkah anak / hadhanah" },
  { id: "madhiyah", label: "Nafkah madhiyah (sekunder, jika muncul)" },
] as const;

export const STATUS_PEKERJAAN = [
  { id: "asn", label: "ASN / karyawan tetap" },
  { id: "informal", label: "Sektor informal" },
  { id: "wiraswasta", label: "Wiraswasta" },
  { id: "pmi", label: "PMI / luar negeri" },
  { id: "tidak_diketahui", label: "Tidak diketahui" },
  { id: "lainnya", label: "Lainnya" },
] as const;

export const KEHADIRAN = [
  { id: "hadir", label: "Hadir" },
  { id: "verstek", label: "Verstek" },
  { id: "campuran", label: "Campuran / sebagian" },
  { id: "tidak_jelas", label: "Tidak jelas di putusan" },
] as const;

/** Rubrik opsional peneliti (1C = catatan naratif; skor membantu agregasi Bab IV). */
export const MAQASID_RUBRIC = [
  {
    id: "hifz_al_mal",
    label: "Hifz al-mal (perlindungan harta / distribusi)",
    scale: [1, 2, 3, 4, 5],
  },
  {
    id: "hifz_al_nasl",
    label: "Hifz al-nasl (perlindungan keturunan / anak)",
    scale: [1, 2, 3, 4, 5],
  },
  {
    id: "al_adl",
    label: "Al-'adl (keadilan distribusi nominal)",
    scale: [1, 2, 3, 4, 5],
  },
  {
    id: "maslahah",
    label: "Maslahah (kemaslahatan praktis putusan)",
    scale: [1, 2, 3, 4, 5],
  },
] as const;

export type ModusId = (typeof MODUS_ASIMETRI)[number]["id"];
export type ResponsId = (typeof RESPONS_HAKIM)[number]["id"];
export type ObjekNafkahId = (typeof OBJEK_NAFKAH)[number]["id"];
