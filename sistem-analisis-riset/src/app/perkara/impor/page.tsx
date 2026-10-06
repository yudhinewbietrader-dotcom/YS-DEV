import { ResearchShell } from "@/components/ResearchShell";
import { SippImportPanel } from "@/components/SippImportPanel";

export default function ImportPage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Impor & sinkron SIPP</h1>
        <p style={{ color: "var(--ink)" }}>
          Utamakan <strong>Sinkron SIPP Lokal</strong> (MySQL/MariaDB satker) untuk data BHT
          lebih akurat. Cadangan: Sinkron BHT publik atau impor CSV/JSON + koding manual dari
          salinan putusan berizin.
        </p>
      </section>
      <SippImportPanel />
    </ResearchShell>
  );
}
