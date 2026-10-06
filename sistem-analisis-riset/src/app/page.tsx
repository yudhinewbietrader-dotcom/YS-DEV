import Link from "next/link";
import { ensureSeeded, getDemoInterviewToken } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default function HomePage() {
  ensureSeeded();
  const demoToken = getDemoInterviewToken();

  return (
    <div className="shell">
      <section className="panel hero" style={{ marginTop: "2rem" }}>
        <p className="badge">Tesis S2 · Ekonomi Syariah</p>
        <h1 style={{ fontSize: "2rem", marginTop: "0.6rem" }}>
          Sistem Analisis Riset
        </h1>
        <p style={{ maxWidth: "38rem", fontSize: "1.05rem", color: "var(--ink)" }}>
          Perangkat kerja lapangan untuk analisis asimetri informasi pendapatan suami
          dalam penetapan nafkah pasca-perceraian di Pengadilan Agama Sambas.
        </p>
        <div className="actions">
          <Link className="btn" href="/login">
            Masuk area peneliti
          </Link>
          {demoToken ? (
            <Link className="btn secondary" href={`/w/${demoToken}`}>
              Coba formulir wawancara demo
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>A. Berkas & koding SIPP</h2>
          <p>
            Impor perkara dari halaman publik SIPP PA Sambas atau CSV/JSON manual,
            lalu kodekan modus asimetri, respons hakim, objek nafkah, dan rubrik
            maqasid/al-&apos;adl untuk Bab IV.
          </p>
        </section>
        <section className="panel">
          <h2>B. Wawancara lapangan</h2>
          <p>
            Kelola informan (pseudonim), jadwal, dan tautan token unik. Informan mengisi
            formulir tanpa akun; peneliti meninjau dan mengunci respons.
          </p>
        </section>
      </div>
    </div>
  );
}
