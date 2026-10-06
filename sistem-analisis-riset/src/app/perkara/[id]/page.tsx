import Link from "next/link";
import { notFound } from "next/navigation";
import { ResearchShell } from "@/components/ResearchShell";
import { CaseCodingForm } from "@/components/CaseCodingForm";
import { getDb, parseJsonArray, parseJsonObject, type CaseRow } from "@/lib/db";
import { parseModusSuggestions } from "@/lib/modus-detect";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CaseDetailPage({ params }: Props) {
  ensureSeeded();
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
  if (!row) notFound();

  const suggestions = parseModusSuggestions(row.modus_suggestions_json);

  const initial = {
    nomor_perkara: row.nomor_perkara,
    jenis_perkara: row.jenis_perkara,
    tanggal_register: row.tanggal_register,
    status_perkara: row.status_perkara,
    tahun: row.tahun,
    status_pekerjaan: row.status_pekerjaan,
    kehadiran: row.kehadiran,
    bukti_pendapatan: row.bukti_pendapatan,
    objek_nafkah: parseJsonArray(row.objek_nafkah_json),
    modus_asimetri: parseJsonArray(row.modus_asimetri_json),
    respons_hakim: parseJsonArray(row.respons_hakim_json),
    indikasi_asimetri: row.indikasi_asimetri,
    pertimbangan_hakim: row.pertimbangan_hakim,
    nominal_ringkas: row.nominal_ringkas,
    maqasid: parseJsonObject(row.maqasid_json) as Record<string, number>,
    evaluasi_notes: row.evaluasi_notes,
    evidence_quotes: row.evidence_quotes,
    catatan_peneliti: row.catatan_peneliti,
    coding_status: row.coding_status,
    para_pihak_masked: row.para_pihak_masked,
    sipp_detail_url: row.sipp_detail_url,
    sumber: row.sumber,
  };

  let localExtra: Record<string, unknown> = {};
  try {
    localExtra = row.sipp_local_json
      ? (JSON.parse(row.sipp_local_json) as Record<string, unknown>)
      : {};
  } catch {
    localExtra = {};
  }

  return (
    <ResearchShell>
      <section className="panel hero">
        <p className="muted">
          <Link href="/perkara">← Daftar berkas</Link>
        </p>
        <h1>{row.kode_berkas}</h1>
        <p style={{ color: "var(--ink)" }}>
          {row.jenis_perkara || "—"} · {row.para_pihak_masked || "Disamarkan"} · sumber{" "}
          <span className="badge muted">{row.sumber}</span>
        </p>
        {row.sipp_detail_url ? (
          <p>
            <a href={row.sipp_detail_url} target="_blank" rel="noreferrer">
              Buka halaman detil SIPP publik
            </a>
          </p>
        ) : null}
      </section>

      {(row.tanggal_bht ||
        row.amar_excerpt ||
        row.tahapan_text ||
        row.nomor_akta_cerai ||
        row.sipp_perkara_id) && (
        <section className="panel">
          <h2>Data SIPP lokal (read-only sync)</h2>
          <div className="grid-2">
            <div>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                ID perkara: <span className="mono">{row.sipp_perkara_id ?? "—"}</span>
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Tahapan: {row.tahapan_text || "—"}
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Proses: {row.proses_text || "—"}
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Verstek: {row.putusan_verstek || "—"} · Status putusan:{" "}
                {row.status_putusan || "—"}
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Pekerjaan pihak1:{" "}
                {typeof localExtra.pekerjaan_pihak1 === "string"
                  ? localExtra.pekerjaan_pihak1
                  : "—"}
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Pekerjaan pihak2:{" "}
                {typeof localExtra.pekerjaan_pihak2 === "string"
                  ? localExtra.pekerjaan_pihak2
                  : "—"}
              </p>
            </div>
            <div>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Tgl putusan: <span className="mono">{row.tanggal_putusan || "—"}</span>
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Tgl minutasi: <span className="mono">{row.tanggal_minutasi || "—"}</span>
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Tgl BHT: <span className="mono">{row.tanggal_bht || "—"}</span>
              </p>
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Akta cerai: {row.nomor_akta_cerai || "—"} (
                <span className="mono">{row.tgl_akta_cerai || "—"}</span>)
              </p>
            </div>
          </div>
          {row.amar_excerpt ? (
            <>
              <div className="block-title">Cuplikan amar putusan</div>
              <p style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{row.amar_excerpt}</p>
            </>
          ) : null}
        </section>
      )}

      <section className="panel">
        <CaseCodingForm
          id={row.id}
          initial={initial}
          initialSuggestions={suggestions}
        />
      </section>
    </ResearchShell>
  );
}
