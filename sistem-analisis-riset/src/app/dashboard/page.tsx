import Link from "next/link";
import { ResearchShell } from "@/components/ResearchShell";
import { getDb } from "@/lib/db";
import { ensureSeeded, getDemoInterviewToken } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  ensureSeeded();
  const db = getDb();
  const cases = db.prepare("SELECT COUNT(*) AS n FROM cases").get() as { n: number };
  const coded = db
    .prepare("SELECT COUNT(*) AS n FROM cases WHERE coding_status = 'coded'")
    .get() as { n: number };
  const informants = db.prepare("SELECT COUNT(*) AS n FROM informants").get() as {
    n: number;
  };
  const responses = db
    .prepare("SELECT COUNT(*) AS n FROM interview_responses")
    .get() as { n: number };
  const demoToken = getDemoInterviewToken();

  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Dasbor penelitian</h1>
        <p style={{ color: "var(--ink)" }}>
          Ringkasan progress pengodean berkas dan wawancara lapangan untuk tesis
          asimetri informasi nafkah di PA Sambas.
        </p>
      </section>

      <div className="grid-3">
        <div className="stat">
          <strong>{cases.n}</strong>
          <span>Berkas dalam workspace</span>
        </div>
        <div className="stat">
          <strong>{coded.n}</strong>
          <span>Sudah dikodekan</span>
        </div>
        <div className="stat">
          <strong>
            {informants.n} / {responses.n}
          </strong>
          <span>Informan / respons masuk</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <section className="panel">
          <h2>Langkah cepat</h2>
          <div className="actions">
            <Link className="btn" href="/perkara/impor">
              Impor / sinkron SIPP
            </Link>
            <Link className="btn secondary" href="/perkara">
              Buka koding berkas
            </Link>
            <Link className="btn ghost" href="/informan">
              Kelola informan
            </Link>
            <Link className="btn ghost" href="/ekspor">
              Ekspor dataset Bab IV
            </Link>
          </div>
        </section>
        <section className="panel">
          <h2>Demo wawancara</h2>
          <p>
            Tautan token unik untuk informan (tanpa akun). Bagikan hanya kepada informan
            yang relevan.
          </p>
          {demoToken ? (
            <>
              <p className="mono">/w/{demoToken}</p>
              <Link className="btn secondary" href={`/w/${demoToken}`} target="_blank">
                Buka formulir demo
              </Link>
            </>
          ) : (
            <p>Seed demo belum membuat token.</p>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>SIPP publik yang dipakai</h2>
        <p>
          Basis URL:{" "}
          <a href="https://sipp.pa-sambas.go.id/" target="_blank" rel="noreferrer">
            https://sipp.pa-sambas.go.id/
          </a>
        </p>
        <p className="muted">
          Integrasi hanya ke daftar/pencarian/detail publik. Tidak ada bypass login.
          Jika situs menolak atau HTML berubah, gunakan impor CSV/JSON manual.
        </p>
      </section>
    </ResearchShell>
  );
}
