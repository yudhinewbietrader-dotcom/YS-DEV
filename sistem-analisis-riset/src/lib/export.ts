import ExcelJS from "exceljs";
import { getDb, parseJsonArray, parseJsonObject, type CaseRow } from "./db";

function caseToFlat(c: CaseRow, publicExport = false) {
  const maqasid = parseJsonObject(c.maqasid_json);
  return {
    kode_berkas: c.kode_berkas,
    nomor_perkara: publicExport || c.nomor_perkara_masked ? c.kode_berkas : c.nomor_perkara,
    tahun: c.tahun,
    jenis_perkara: c.jenis_perkara,
    tanggal_register: c.tanggal_register,
    status_perkara: c.status_perkara,
    para_pihak: c.para_pihak_masked,
    status_pekerjaan: c.status_pekerjaan,
    kehadiran: c.kehadiran,
    objek_nafkah: parseJsonArray(c.objek_nafkah_json).join("; "),
    modus_asimetri: parseJsonArray(c.modus_asimetri_json).join("; "),
    respons_hakim: parseJsonArray(c.respons_hakim_json).join("; "),
    bukti_pendapatan: c.bukti_pendapatan,
    indikasi_asimetri: c.indikasi_asimetri,
    pertimbangan_hakim: c.pertimbangan_hakim,
    nominal_ringkas: c.nominal_ringkas,
    skor_hifz_al_mal: maqasid.hifz_al_mal ?? "",
    skor_hifz_al_nasl: maqasid.hifz_al_nasl ?? "",
    skor_al_adl: maqasid.al_adl ?? "",
    skor_maslahah: maqasid.maslahah ?? "",
    evaluasi_notes: c.evaluasi_notes,
    evidence_quotes: c.evidence_quotes,
    catatan_peneliti: c.catatan_peneliti,
    coding_status: c.coding_status,
    sumber: c.sumber,
    sipp_detail_url: c.sipp_detail_url,
  };
}

export function exportCasesCsv(opts?: { publicMask?: boolean }): string {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM cases ORDER BY tahun DESC, kode_berkas ASC")
    .all() as CaseRow[];
  const flat = rows.map((r) => caseToFlat(r, opts?.publicMask ?? true));
  if (flat.length === 0) return "kode_berkas\n";

  const headers = Object.keys(flat[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...flat.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join(
    "\n",
  );
}

export async function exportCasesExcel(opts?: { publicMask?: boolean }): Promise<Buffer> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM cases ORDER BY tahun DESC, kode_berkas ASC")
    .all() as CaseRow[];
  const flat = rows.map((r) => caseToFlat(r, opts?.publicMask ?? true));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistem Analisis Riset — Tesis Yudhi Septiandy";
  const ws = wb.addWorksheet("Koding Berkas");
  if (flat.length === 0) {
    ws.addRow(["kode_berkas"]);
  } else {
    const headers = Object.keys(flat[0]);
    ws.addRow(headers);
    for (const r of flat) {
      ws.addRow(headers.map((h) => (r as Record<string, unknown>)[h] ?? ""));
    }
    ws.getRow(1).font = { bold: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function exportInterviewsJson() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.kode, i.pseudonym, i.peran, i.instrumen, r.consent, r.answers_json,
              r.status, r.locked, r.submitted_at, r.reviewed_at
       FROM interview_responses r
       JOIN informants i ON i.id = r.informant_id
       ORDER BY i.kode`,
    )
    .all();
  return JSON.stringify(rows, null, 2);
}
