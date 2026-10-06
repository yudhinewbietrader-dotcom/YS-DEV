import { randomBytes } from "node:crypto";
import { getDb } from "./db";

export function ensureSeeded() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get() as
    | { value: string }
    | undefined;
  if (row?.value === "1") return { seeded: false };

  const insertCase = db.prepare(`
    INSERT INTO cases (
      kode_berkas, nomor_perkara, nomor_perkara_masked, jenis_perkara,
      tanggal_register, status_perkara, para_pihak_masked, sipp_detail_url,
      sumber, tahun, status_pekerjaan, kehadiran, bukti_pendapatan,
      objek_nafkah_json, modus_asimetri_json, respons_hakim_json,
      indikasi_asimetri, pertimbangan_hakim, nominal_ringkas, maqasid_json,
      evaluasi_notes, evidence_quotes, catatan_peneliti, coding_status
    ) VALUES (
      @kode_berkas, @nomor_perkara, 1, @jenis_perkara,
      @tanggal_register, @status_perkara, @para_pihak_masked, @sipp_detail_url,
      @sumber, @tahun, @status_pekerjaan, @kehadiran, @bukti_pendapatan,
      @objek_nafkah_json, @modus_asimetri_json, @respons_hakim_json,
      @indikasi_asimetri, @pertimbangan_hakim, @nominal_ringkas, @maqasid_json,
      @evaluasi_notes, @evidence_quotes, @catatan_peneliti, @coding_status
    )
  `);

  const demos = [
    {
      kode_berkas: "BK-2025-001",
      nomor_perkara: "DEMO-101/Pdt.G/2025/PA.Sbs",
      jenis_perkara: "Cerai Gugat",
      tanggal_register: "12 Mar 2025",
      status_perkara: "Minutasi",
      para_pihak_masked: "Penggugat: Disamarkan; Tergugat: Disamarkan",
      sipp_detail_url: null as string | null,
      sumber: "demo",
      tahun: 2025,
      status_pekerjaan: "informal",
      kehadiran: "verstek",
      bukti_pendapatan: "Tidak ada slip; keterangan saksi tentang pekerjaan kebun",
      objek_nafkah_json: JSON.stringify(["iddah", "mutah", "hadhanah"]),
      modus_asimetri_json: JSON.stringify(["informal", "verstek"]),
      respons_hakim_json: JSON.stringify(["ex_officio", "taksiran_minimal"]),
      indikasi_asimetri:
        "Tergugat tidak hadir; pendapatan informal sulit diverifikasi.",
      pertimbangan_hakim:
        "Hakim menetapkan nafkah secara ex officio dengan taksiran minimal.",
      nominal_ringkas: "iddah RpX; mut'ah RpY; anak RpZ/bulan (disamarkan)",
      maqasid_json: JSON.stringify({
        hifz_al_mal: 3,
        hifz_al_nasl: 3,
        al_adl: 2,
        maslahah: 3,
      }),
      evaluasi_notes:
        "Proporsionalitas terbatas karena verstek + informal; hifz al-nasl sebagian terpenuhi.",
      evidence_quotes:
        '"Tidak terdapat bukti penghasilan tertulis yang diajukan di persidangan." (demo)',
      catatan_peneliti: "Berkas demo untuk uji UI pengodean.",
      coding_status: "coded",
    },
    {
      kode_berkas: "BK-2025-002",
      nomor_perkara: "DEMO-215/Pdt.G/2025/PA.Sbs",
      jenis_perkara: "Cerai Talak",
      tanggal_register: "08 Jul 2025",
      status_perkara: "Putus",
      para_pihak_masked: "Pemohon: Disamarkan; Termohon: Disamarkan",
      sipp_detail_url: null,
      sumber: "demo",
      tahun: 2025,
      status_pekerjaan: "pmi",
      kehadiran: "hadir",
      bukti_pendapatan: "Pengakuan bekerja di Malaysia; tanpa kontrak/slip ringgit",
      objek_nafkah_json: JSON.stringify(["iddah", "mutah", "hadhanah"]),
      modus_asimetri_json: JSON.stringify(["pmi", "pengakuan_tidak_mampu"]),
      respons_hakim_json: JSON.stringify([
        "hakim_aktif",
        "pembuktian_tidak_langsung",
      ]),
      indikasi_asimetri:
        "Pendapatan lintas negara; istri sulit mengakses bukti penghasilan.",
      pertimbangan_hakim:
        "Hakim aktif menggali fakta melalui saksi dan indikasi gaya hidup.",
      nominal_ringkas: "mut'ah + iddah + nafkah anak (nilai disamarkan)",
      maqasid_json: JSON.stringify({
        hifz_al_mal: 4,
        hifz_al_nasl: 4,
        al_adl: 3,
        maslahah: 4,
      }),
      evaluasi_notes:
        "Upaya hakim aktif memperkuat maslahah meski bukti formal minim.",
      evidence_quotes:
        '"Pemohon mengakui bekerja di luar negeri namun tidak menunjukkan dokumen penghasilan." (demo)',
      catatan_peneliti: "Contoh tipikal PMI Sambas–Sarawak (anonim).",
      coding_status: "draft",
    },
    {
      kode_berkas: "BK-2024-003",
      nomor_perkara: "DEMO-088/Pdt.G/2024/PA.Sbs",
      jenis_perkara: "Cerai Gugat",
      tanggal_register: "21 Nov 2024",
      status_perkara: "Minutasi",
      para_pihak_masked: "Penggugat: Disamarkan; Tergugat: Disamarkan",
      sipp_detail_url: null,
      sumber: "demo",
      tahun: 2024,
      status_pekerjaan: "wiraswasta",
      kehadiran: "hadir",
      bukti_pendapatan: "Tidak ada pembukuan; sengketa nominal signifikan",
      objek_nafkah_json: JSON.stringify(["iddah", "hadhanah", "madhiyah"]),
      modus_asimetri_json: JSON.stringify([
        "wiraswasta",
        "penyembunyian_aset",
        "gaya_hidup_tidak_sesuai",
      ]),
      respons_hakim_json: JSON.stringify(["rechtsvinding", "ex_officio"]),
      indikasi_asimetri:
        "Pengakuan penghasilan rendah tidak selaras indikasi aset/usaha.",
      pertimbangan_hakim:
        "Rechtsvinding untuk menaksir kemampuan berdasarkan fakta tidak langsung.",
      nominal_ringkas: "termasuk madhiyah (ringkas, disamarkan)",
      maqasid_json: JSON.stringify({
        hifz_al_mal: 4,
        hifz_al_nasl: 5,
        al_adl: 4,
        maslahah: 4,
      }),
      evaluasi_notes: "Relatif lebih kuat pada hifz al-nasl.",
      evidence_quotes: "",
      catatan_peneliti: "Demo coding lengkap untuk ekspor Bab IV.",
      coding_status: "coded",
    },
  ];

  const tx = db.transaction(() => {
    for (const d of demos) insertCase.run(d);

    const informants = [
      {
        kode: "HK-01",
        peran: "hakim",
        instrumen: "hakim",
        pseudonym: "Hakim A",
        jabatan_ringkas: "Hakim majelis (samaran)",
        status_wawancara: "jadwal",
        jadwal: "2026-04-10 10:00",
        checklist_json: JSON.stringify([
          "izin_institusi",
          "informed_consent",
          "rekaman_izin",
        ]),
        catatan: "Informan demo — tautan wawancara aktif.",
      },
      {
        kode: "HK-02",
        peran: "hakim",
        instrumen: "hakim",
        pseudonym: "Hakim B",
        jabatan_ringkas: "Hakim majelis (samaran)",
        status_wawancara: "belum",
        jadwal: null as string | null,
        checklist_json: JSON.stringify(["izin_institusi"]),
        catatan: "",
      },
      {
        kode: "PP-01",
        peran: "panitera",
        instrumen: "panitera",
        pseudonym: "Panitera/PP C",
        jabatan_ringkas: "Panitera Pengganti (samaran)",
        status_wawancara: "selesai",
        jadwal: "2026-03-20 14:00",
        checklist_json: JSON.stringify([
          "izin_institusi",
          "informed_consent",
          "transkrip",
        ]),
        catatan: "Respons demo terkunci untuk contoh review.",
      },
    ];

    const insInf = db.prepare(`
      INSERT INTO informants (
        kode, peran, instrumen, pseudonym, jabatan_ringkas,
        status_wawancara, jadwal, checklist_json, catatan
      ) VALUES (
        @kode, @peran, @instrumen, @pseudonym, @jabatan_ringkas,
        @status_wawancara, @jadwal, @checklist_json, @catatan
      )
    `);

    const tokens: string[] = [];
    for (const inf of informants) {
      const info = insInf.run(inf);
      const token = randomBytes(16).toString("hex");
      tokens.push(token);
      db.prepare(
        `INSERT INTO interview_tokens (informant_id, token, active) VALUES (?, ?, 1)`,
      ).run(info.lastInsertRowid, token);

      if (inf.kode === "PP-01") {
        db.prepare(
          `INSERT INTO interview_responses (
            informant_id, token, consent, answers_json, status, locked, submitted_at, reviewed_at
          ) VALUES (?, ?, 1, ?, 'reviewed', 1, datetime('now'), datetime('now'))`,
        ).run(
          info.lastInsertRowid,
          token,
          JSON.stringify({
            p1: "Bukti kapasitas ekonomi dilampirkan bila ada; sering kosong pada perkara informal.",
            p2: "PMI sulit dilacak dokumennya; verstek menambah kekosongan berkas.",
            p3: "Pertimbangan nominal biasanya ditulis ringkas di putusan.",
            p4: "ASN lebih sering punya slip; informal/PMI minim lampiran.",
            p5: "Demo jawaban panitera.",
          }),
        );
      }
    }

    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('seeded', '1'), ('demo_interview_token', ?)`,
    ).run(tokens[0]);
  });

  tx();
  return { seeded: true };
}

export function getDemoInterviewToken(): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'demo_interview_token'")
    .get() as { value: string } | undefined;
  return row?.value ?? null;
}
