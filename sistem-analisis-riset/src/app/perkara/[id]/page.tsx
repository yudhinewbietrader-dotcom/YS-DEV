import Link from "next/link";
import { notFound } from "next/navigation";
import { ResearchShell } from "@/components/ResearchShell";
import { CaseCodingForm } from "@/components/CaseCodingForm";
import { getDb, parseJsonArray, parseJsonObject, type CaseRow } from "@/lib/db";
import { parseModusSuggestions } from "@/lib/modus-detect";
import { formatNominalId } from "@/lib/sipp-nominals";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

type PdfRefView = {
  kind?: string;
  relative_path?: string;
  absolute_path?: string | null;
  url?: string | null;
  label?: string;
  source_field?: string;
};

type NominalItemView = {
  kind?: string;
  amount?: number;
  source?: string;
  source_field?: string;
  evidence?: string;
};

export default async function CaseDetailPage({ params }: Props) {
  ensureSeeded();
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
  if (!row) notFound();

  const suggestions = parseModusSuggestions(row.modus_suggestions_json);
  const qualityStored = row.data_quality_json
    ? parseJsonObject(row.data_quality_json)
    : null;

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
    nominal_iddah: row.nominal_iddah,
    nominal_mutah: row.nominal_mutah,
    nominal_hadhanah: row.nominal_hadhanah,
    nominal_madhiyah: row.nominal_madhiyah,
    putusan_pdf_url: row.putusan_pdf_url,
    amar_putusan_dok: row.amar_putusan_dok,
  };

  let localExtra: Record<string, unknown> = {};
  try {
    localExtra = row.sipp_local_json
      ? (JSON.parse(row.sipp_local_json) as Record<string, unknown>)
      : {};
  } catch {
    localExtra = {};
  }

  let pdfRefs: PdfRefView[] = [];
  try {
    pdfRefs = row.putusan_pdf_json
      ? (JSON.parse(row.putusan_pdf_json) as PdfRefView[])
      : Array.isArray(localExtra.pdf_refs)
        ? (localExtra.pdf_refs as PdfRefView[])
        : [];
  } catch {
    pdfRefs = [];
  }

  let nominalItems: NominalItemView[] = [];
  try {
    const bundle = row.nominal_json
      ? (JSON.parse(row.nominal_json) as { items?: NominalItemView[] })
      : (localExtra.nominals as { items?: NominalItemView[] } | undefined);
    nominalItems = bundle?.items || [];
  } catch {
    nominalItems = [];
  }

  const labelKind = (k?: string) => {
    if (k === "iddah") return "Nafkah iddah";
    if (k === "mutah") return "Mut'ah";
    if (k === "hadhanah") return "Nafkah anak";
    if (k === "madhiyah") return "Nafkah madhiyah";
    return k || "—";
  };

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
          {row.bht_basis ? (
            <>
              {" "}
              · BHT{" "}
              <span
                className={`badge ${row.bht_basis === "tanggal_bht" ? "ok" : "warn"}`}
              >
                {row.bht_basis}
              </span>
            </>
          ) : null}
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
        row.sipp_perkara_id ||
        pdfRefs.length ||
        nominalItems.length) && (
        <section className="panel">
          <h2>Data SIPP lokal (read-only)</h2>
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
              <p className="muted" style={{ marginBottom: "0.35rem" }}>
                Panjang amar di DB:{" "}
                {localExtra.amar_char_count != null
                  ? String(localExtra.amar_char_count)
                  : "—"}
                {localExtra.amar_truncated ? " (cuplikan terpotong di impor)" : ""}
              </p>
            </div>
          </div>

          <div className="block-title">Nominal dari SIPP</div>
          {nominalItems.length ||
          row.nominal_iddah != null ||
          row.nominal_mutah != null ||
          row.nominal_hadhanah != null ? (
            <table className="data" style={{ marginBottom: "1rem" }}>
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Nominal</th>
                  <th>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {nominalItems.length ? (
                  nominalItems.map((n) => (
                    <tr key={`${n.kind}-${n.source_field}`}>
                      <td>{labelKind(n.kind)}</td>
                      <td className="mono">{formatNominalId(n.amount)}</td>
                      <td className="muted">
                        {n.source_field || n.source || "—"}
                        {n.evidence ? (
                          <div style={{ fontSize: "0.85rem" }}>“{n.evidence}”</div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr>
                      <td>Nafkah iddah</td>
                      <td className="mono">{formatNominalId(row.nominal_iddah)}</td>
                      <td className="muted">cases.nominal_iddah</td>
                    </tr>
                    <tr>
                      <td>Mut&apos;ah</td>
                      <td className="mono">{formatNominalId(row.nominal_mutah)}</td>
                      <td className="muted">cases.nominal_mutah</td>
                    </tr>
                    <tr>
                      <td>Nafkah anak</td>
                      <td className="mono">{formatNominalId(row.nominal_hadhanah)}</td>
                      <td className="muted">perkara_anak_pihak.jumlah_nafkah</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          ) : (
            <p className="muted">Belum ada nominal terurai — cek PDF / sync ulang.</p>
          )}

          <div className="block-title">PDF putusan (SIPP)</div>
          {pdfRefs.length || row.amar_putusan_dok || row.putusan_pdf_url ? (
            <ul style={{ marginTop: 0, paddingLeft: "1.1rem" }}>
              {pdfRefs.length ? (
                pdfRefs.map((p, i) => (
                  <li key={i} style={{ marginBottom: "0.4rem" }}>
                    <strong>{p.label || p.kind || "Dokumen"}</strong>{" "}
                    <span className="muted mono">({p.source_field})</span>
                    <div className="mono" style={{ fontSize: "0.9rem" }}>
                      {p.relative_path}
                    </div>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        Buka / unduh
                      </a>
                    ) : p.absolute_path ? (
                      <span className="muted">
                        Path satker: <span className="mono">{p.absolute_path}</span>
                      </span>
                    ) : (
                      <span className="muted">
                        Set <span className="mono">SIPP_PDF_BASE_URL</span> di .env.local
                        agar link LAN aktif
                      </span>
                    )}
                  </li>
                ))
              ) : (
                <li>
                  {row.putusan_pdf_url ? (
                    <a href={row.putusan_pdf_url} target="_blank" rel="noreferrer">
                      Buka PDF
                    </a>
                  ) : null}{" "}
                  <span className="mono muted">{row.amar_putusan_dok}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="muted">
              Path PDF kosong di DB untuk perkara ini (`amar_putusan_dok` /
              `perkara_dokumen` / dirput).
            </p>
          )}

          {row.amar_excerpt ? (
            <>
              <div className="block-title">Cuplikan amar putusan</div>
              <p style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{row.amar_excerpt}</p>
            </>
          ) : null}
          {row.petitum_excerpt ? (
            <>
              <div className="block-title">Cuplikan petitum</div>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                {row.petitum_excerpt}
              </p>
            </>
          ) : null}
          {row.pertimbangan_excerpt ? (
            <>
              <div className="block-title">Cuplikan pertimbangan hukum (SIPP)</div>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                {row.pertimbangan_excerpt}
              </p>
            </>
          ) : (
            <p className="muted">
              Tabel pertimbangan_hukum kosong/tidak terisi — isi pertimbangan dari PDF
              putusan.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <CaseCodingForm
          id={row.id}
          initial={initial}
          initialSuggestions={suggestions}
          initialQuality={
            (suggestions?.quality as Record<string, unknown>) ||
            (qualityStored as Record<string, unknown>) ||
            null
          }
        />
      </section>
    </ResearchShell>
  );
}
