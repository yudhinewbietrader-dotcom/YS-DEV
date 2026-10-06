import Link from "next/link";
import { ResearchShell } from "@/components/ResearchShell";
import { getDb, parseJsonArray, type CaseRow } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default function PerkaraPage() {
  ensureSeeded();
  const db = getDb();
  const cases = db
    .prepare("SELECT * FROM cases ORDER BY tahun DESC, kode_berkas ASC")
    .all() as CaseRow[];

  return (
    <ResearchShell>
      <section className="panel hero">
        <h1>Workspace koding berkas</h1>
        <p style={{ color: "var(--ink)" }}>
          Unit analisis dokumen (Lampiran 1C): modus asimetri, respons hakim, objek
          nafkah, dan evaluasi maqasid/al-&apos;adl.
        </p>
        <div className="actions">
          <Link className="btn" href="/perkara/impor">
            Impor / SIPP
          </Link>
          <Link className="btn secondary" href="/perkara/baru">
            Tambah berkas manual
          </Link>
        </div>
      </section>

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Jenis / tahun</th>
              <th>Modus</th>
              <th>Status koding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.kode_berkas}</strong>
                  <div className="muted mono">{c.nomor_perkara}</div>
                </td>
                <td>
                  {c.jenis_perkara || "—"}
                  <div className="muted">{c.tahun}</div>
                </td>
                <td className="muted">
                  {parseJsonArray(c.modus_asimetri_json).join(", ") || "—"}
                </td>
                <td>
                  <span
                    className={`badge ${c.coding_status === "coded" ? "ok" : "warn"}`}
                  >
                    {c.coding_status}
                  </span>
                </td>
                <td>
                  <Link href={`/perkara/${c.id}`}>Kodekan →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </ResearchShell>
  );
}
