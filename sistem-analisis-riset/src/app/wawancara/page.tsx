import { ResearchShell } from "@/components/ResearchShell";
import { InterviewReview } from "@/components/InterviewReview";

export const dynamic = "force-dynamic";

export default function WawancaraPage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Tinjauan respons wawancara</h1>
        <p style={{ color: "var(--ink)" }}>
          Review jawaban informan, lalu kunci agar tidak dapat diubah dari tautan publik.
        </p>
      </section>
      <InterviewReview />
    </ResearchShell>
  );
}
