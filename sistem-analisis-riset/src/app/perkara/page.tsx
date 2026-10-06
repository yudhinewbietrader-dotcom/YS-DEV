import Link from "next/link";
import { ResearchShell } from "@/components/ResearchShell";
import { BulkModusDetectButton } from "@/components/BulkModusDetectButton";
import { getDb, parseJsonArray, parseJsonObject, type CaseRow } from "@/lib/db";
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
          nafkah, dan evaluasi maqasid/al-&apos;adl. Sinkron SIPP mengimpor metadata;
          modus diisi/usulkan lewat heuristik + konfirmasi peneliti.
        </p>
        <div className="actions">
          <Link className="btn" href="/perkara/impor">
            Impor / SIPP
          </Link>
          <Link className="btn secondary" href="/perkara/baru">
            Tambah berkas manual
          </Link>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <BulkModusDetectButton />
        </div>
      </section>

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Jenis / tahun</th>
              <th>Modus</th>
              <th>Usulan</th>
              <th>Status koding</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const modus = parseJsonArray(c.modus_asimetri_json);
              const sug = parseJsonObject(c.modus_suggestions_json || null);
              const sugList = Array.isArray(sug.suggestions)
                ? (sug.suggestions as Array<{ id: string }>).map((s) => s.id)
                : [];
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.kode_berkas}</strong>
                    <div className="muted mono">{c.nomor_perkara}</div>
                  </td>
                  <td>
                    {c.jenis_perkara || "—"}
                    <div className="muted">{c.tahun}</div>
                  </td>
                  <td className="muted">{modus.join(", ") || "—"}</td>
                  <td className="muted">
                    {sugList.length ? (
                      <span className="badge warn">{sugList.join(", ")}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </section>
    </ResearchShell>
  );
}
