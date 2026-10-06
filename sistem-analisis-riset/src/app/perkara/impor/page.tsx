import { ResearchShell } from "@/components/ResearchShell";
import { SippImportPanel } from "@/components/SippImportPanel";

export default function ImportPage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Impor & sinkron SIPP</h1>
        <p style={{ color: "var(--ink)" }}>
          Hanya data publik. Jika SIPP memblokir atau struktur HTML berubah, andalkan
          impor CSV/JSON + pengodean manual dari salinan putusan berizin.
        </p>
      </section>
      <SippImportPanel />
    </ResearchShell>
  );
}
