/** Instrumen wawancara semi-terstruktur (adaptasi Lampiran 1A–B proposal). */

export type QuestionType = "text" | "textarea" | "select" | "multiselect";

export type InterviewQuestion = {
  id: string;
  block: string;
  prompt: string;
  type: QuestionType;
  required?: boolean;
  options?: { value: string; label: string }[];
};

export type InstrumentDef = {
  id: "hakim" | "panitera";
  title: string;
  description: string;
  questions: InterviewQuestion[];
};

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  hakim: {
    id: "hakim",
    title: "Pedoman Wawancara — Hakim",
    description:
      "Instrumen semi-terstruktur untuk majelis hakim PA Sambas terkait asimetri informasi pendapatan suami dalam penetapan nafkah pasca-perceraian.",
    questions: [
      {
        id: "h1",
        block: "Blok 1 — Konteks perkara nafkah",
        prompt:
          "Bagaimana tipikal perkara nafkah iddah, mut'ah, dan nafkah anak yang Bapak/Ibu tangani di PA Sambas dalam 2–3 tahun terakhir?",
        type: "textarea",
        required: true,
      },
      {
        id: "h2",
        block: "Blok 1 — Konteks perkara nafkah",
        prompt:
          "Apa perbedaan utama pembuktian pendapatan antara suami berstatus ASN/karyawan tetap dengan pelaku sektor informal atau PMI?",
        type: "textarea",
        required: true,
      },
      {
        id: "h3",
        block: "Blok 2 — Bentuk dan modus asimetri informasi",
        prompt:
          "Bentuk ketertutupan atau ketidakjelasan informasi pendapatan suami apa yang paling sering muncul di persidangan?",
        type: "textarea",
        required: true,
      },
      {
        id: "h4",
        block: "Blok 2 — Bentuk dan modus asimetri informasi",
        prompt:
          "Bagaimana Bapak/Ibu membaca indikasi moral hazard (pengakuan tidak mampu, ketiadaan bukti, atau ketidaksesuaian gaya hidup/aset)?",
        type: "textarea",
        required: true,
      },
      {
        id: "h5",
        block: "Blok 2 — Bentuk dan modus asimetri informasi",
        prompt:
          "Apa tantangan khusus perkara verstek dalam menetapkan nominal nafkah?",
        type: "textarea",
        required: true,
      },
      {
        id: "h6",
        block: "Blok 3 — Respons dan pertimbangan hakim",
        prompt:
          "Bagaimana Bapak/Ibu menerapkan asas hakim aktif dan/atau hak ex officio dalam penetapan nafkah?",
        type: "textarea",
        required: true,
      },
      {
        id: "h7",
        block: "Blok 3 — Respons dan pertimbangan hakim",
        prompt:
          "Metode rechtsvinding atau pembuktian tidak langsung apa yang digunakan untuk menaksir kemampuan ekonomi ketika bukti formal minim?",
        type: "textarea",
        required: true,
      },
      {
        id: "h8",
        block: "Blok 3 — Respons dan pertimbangan hakim",
        prompt:
          "Apa batasan operasional yang dirasakan dalam menembus ketimpangan informasi (administratif, yurisdiksi lintas negara, waktu, atau bukti)?",
        type: "textarea",
        required: true,
      },
      {
        id: "h9",
        block: "Blok 4 — Keadilan dan kemaslahatan",
        prompt:
          "Bagaimana Bapak/Ibu menimbang proporsionalitas (wus') suami dengan kebutuhan kelayakan hidup mantan istri dan anak?",
        type: "textarea",
        required: true,
      },
      {
        id: "h10",
        block: "Blok 4 — Keadilan dan kemaslahatan",
        prompt:
          "Menurut pengalaman Bapak/Ibu, sejauh mana putusan nafkah dalam kondisi informasi terbatas masih dapat mewujudkan perlindungan ekonomi perempuan dan anak?",
        type: "textarea",
        required: true,
      },
      {
        id: "h_modus_sering",
        block: "Blok tambahan — tipologi ringkas",
        prompt: "Modus asimetri yang paling sering ditemui (boleh lebih dari satu):",
        type: "multiselect",
        options: [
          { value: "informal", label: "Sektor informal" },
          { value: "pmi", label: "PMI / lintas negara" },
          { value: "verstek", label: "Verstek" },
          { value: "penyembunyian_aset", label: "Penyembunyian aset" },
          { value: "slip_gaji", label: "Slip gaji problematik" },
          { value: "pengakuan_tidak_mampu", label: "Pengakuan tidak mampu" },
        ],
      },
    ],
  },
  panitera: {
    id: "panitera",
    title: "Pedoman Wawancara — Panitera / Panitera Pengganti",
    description:
      "Instrumen untuk panitera/PP terkait dokumentasi dan kelengkapan bukti kapasitas ekonomi suami.",
    questions: [
      {
        id: "p1",
        block: "Dokumentasi & administrasi",
        prompt:
          "Bagaimana alur pencatatan dan kelengkapan bukti terkait kapasitas ekonomi suami dalam berkas perkara nafkah?",
        type: "textarea",
        required: true,
      },
      {
        id: "p2",
        block: "Dokumentasi & administrasi",
        prompt:
          "Kendala administratif apa yang sering muncul pada perkara informal / PMI / verstek?",
        type: "textarea",
        required: true,
      },
      {
        id: "p3",
        block: "Dokumentasi & administrasi",
        prompt:
          "Bagaimana praktik dokumentasi putusan terkait pertimbangan nominal nafkah?",
        type: "textarea",
        required: true,
      },
      {
        id: "p4",
        block: "Observasi proses",
        prompt:
          "Apakah ada pola kelengkapan berkas yang berbeda antara perkara ASN dan sektor informal/PMI? Jelaskan.",
        type: "textarea",
        required: true,
      },
      {
        id: "p5",
        block: "Observasi proses",
        prompt:
          "Catatan lain yang relevan bagi penelitian asimetri informasi pendapatan suami:",
        type: "textarea",
      },
    ],
  },
};

export function getInstrument(id: string): InstrumentDef | null {
  return INSTRUMENTS[id] ?? null;
}
