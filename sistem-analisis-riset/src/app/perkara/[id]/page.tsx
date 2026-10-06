import Link from "next/link";
import { notFound } from "next/navigation";
import { ResearchShell } from "@/components/ResearchShell";
import { CaseCodingForm } from "@/components/CaseCodingForm";
import { getDb, parseJsonArray, parseJsonObject, type CaseRow } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CaseDetailPage({ params }: Props) {
  ensureSeeded();
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as CaseRow | undefined;
  if (!row) notFound();

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
      <section className="panel">
        <CaseCodingForm id={row.id} initial={initial} />
      </section>
    </ResearchShell>
  );
}
