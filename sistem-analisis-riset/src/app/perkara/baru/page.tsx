import Link from "next/link";
import { ResearchShell } from "@/components/ResearchShell";
import { CaseCodingForm } from "@/components/CaseCodingForm";

export default function NewCasePage() {
  return (
    <ResearchShell>
      <section className="panel hero">
        <p className="muted">
          <Link href="/perkara">← Daftar berkas</Link>
        </p>
        <h1>Tambah berkas manual</h1>
        <p>Gunakan jika data berasal dari salinan putusan/izin internal, bukan SIPP publik.</p>
      </section>
      <section className="panel">
        <CaseCodingForm />
      </section>
    </ResearchShell>
  );
}
