import { ResearchShell } from "@/components/ResearchShell";

export const dynamic = "force-dynamic";

export default function EksporPage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Ekspor dataset</h1>
        <p style={{ color: "var(--ink)" }}>
          Unduh matriks koding untuk reduksi/penyajian Bab IV. Ekspor bawaan memakai kode
          berkas samaran (bukan nomor perkara mentah).
        </p>
      </section>
      <section className="panel">
        <h2>Berkas terkode</h2>
        <div className="actions">
          <a className="btn" href="/api/export/cases?format=csv">
            Unduh CSV
          </a>
          <a className="btn secondary" href="/api/export/cases?format=xlsx">
            Unduh Excel
          </a>
          <a className="btn ghost" href="/api/export/cases?format=csv&mask=0">
            CSV (nomor internal peneliti)
          </a>
        </div>
      </section>
      <section className="panel">
        <h2>Respons wawancara</h2>
        <div className="actions">
          <a className="btn secondary" href="/api/export/interviews">
            Unduh JSON wawancara
          </a>
        </div>
      </section>
    </ResearchShell>
  );
}
