import { ResearchShell } from "@/components/ResearchShell";
import { SippImportPanel } from "@/components/SippImportPanel";

export default function ImportPage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Impor & sinkron SIPP</h1>
        <p style={{ color: "var(--ink)" }}>
          Hanya data publik. Gunakan <strong>Sinkron BHT</strong> untuk bulk-impor perkara
          final dalam satu klik. Jika SIPP memblokir atau struktur HTML berubah, andalkan
          impor CSV/JSON + pengodean manual dari salinan putusan berizin.
        </p>
      </section>
      <SippImportPanel />
    </ResearchShell>
  );
}
