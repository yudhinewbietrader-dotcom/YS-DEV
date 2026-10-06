# Sistem Analisis Riset — PA Sambas

Perangkat lokal untuk pelaksanaan tesis S2 **Yudhi Septiandy** tentang asimetri informasi pendapatan suami dalam penetapan nafkah pasca-perceraian di Pengadilan Agama Sambas.

## Fitur

1. **Berkas + koding SIPP** — cari/impor data perkara dari SIPP publik, workspace pengodean (modus asimetri, respons hakim, objek nafkah, rubrik maqasid), ekspor CSV/Excel.
2. **Riset lapangan + wawancara** — daftar informan, jadwal, tautan token unik, formulir informed consent, review/kunci respons.

## Prasyarat

- Node.js 20+ (disarankan 22)
- npm

## Menjalankan

```bash
cd sistem-analisis-riset
cp .env.example .env.local   # jika belum ada
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

- Login peneliti: kata sandi dari `RESEARCHER_PASSWORD` (default contoh di `.env.example`)
- Seed demo (3 berkas + informan + tautan wawancara) dijalankan otomatis saat pertama kali DB dibuat

Produksi lokal:

```bash
npm run build
npm start
```

## SIPP yang dipakai

### A. SIPP lokal (disarankan)

Baca langsung MariaDB/MySQL satker (skema `sipp32`) lewat env **WA-gateway**:
`SIPP_ENABLED`, `SIPP_HOST`, `SIPP_PORT`, `SIPP_DB`, `SIPP_USER`, `SIPP_PASSWORD`, `SIPP_CHARSET=latin1`.

Tombol UI: **Sinkron SIPP Lokal** di `/perkara/impor`.

Setelah sync, **usulan modus** otomatis (heuristik dari amar/verstek/pekerjaan) — bukan koding final. Tombol **Deteksi modus** di `/perkara` dan form koding.
### B. SIPP publik (cadangan)

- **Base URL publik:** https://sipp.pa-sambas.go.id/
- Pencarian: `POST /list_perkara/search`
- Detail: `GET /show_detil/{token}`
- Pagination: `GET /list_perkara/page/{n}/{token…}`
- **Sinkron BHT publik:** filter status final + bulk upsert (teks “BHT” jarang; proxy Akta Cerai)

Hanya halaman publik untuk jalur B. Tidak ada bypass login web.

## Etika & batasan

- Nama pihak disamarkan secara bawaan.
- Rate limiting + User-Agent jelas + cache hasil fetch.
- Jika SIPP memblokir atau HTML berubah: gunakan impor CSV/JSON (`samples/contoh-impor-perkara.csv`) dan isi koding dari salinan putusan berizin.
- File `sipp32.sql` di root repo (jika ada) adalah skema/referensi — **bukan** sumber impor aplikasi ini.

## Struktur penting

```
src/app/          # halaman Next.js (dasbor, perkara, informan, wawancara publik)
src/lib/sipp.ts   # klien SIPP publik
src/lib/instruments.ts  # instrumen hakim/panitera (Lampiran proposal)
data/             # SQLite lokal (diabaikan git)
samples/          # contoh CSV impor
```

Dokumentasi pengguna (bahasa Indonesia): lihat juga `docs/sistem-analisis-riset.md` di Agent Store proyek.
