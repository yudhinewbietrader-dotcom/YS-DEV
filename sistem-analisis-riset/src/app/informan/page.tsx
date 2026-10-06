import { ResearchShell } from "@/components/ResearchShell";
import { InformantManager } from "@/components/InformantManager";

export const dynamic = "force-dynamic";

export default function InformanPage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Informan & jadwal lapangan</h1>
        <p style={{ color: "var(--ink)" }}>
          Kelola pseudonim, status wawancara, jadwal, dan tautan token unik (tanpa akun
          informan).
        </p>
      </section>
      <InformantManager />
    </ResearchShell>
  );
}
