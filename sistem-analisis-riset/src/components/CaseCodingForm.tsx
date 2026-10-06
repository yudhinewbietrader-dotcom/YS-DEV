"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KEHADIRAN,
  MAQASID_RUBRIC,
  MODUS_ASIMETRI,
  OBJEK_NAFKAH,
  RESPONS_HAKIM,
  STATUS_PEKERJAAN,
} from "@/lib/coding-taxonomy";

type Suggestion = {
  id: string;
  label: string;
  confidence: "low" | "med";
  evidence: string;
  field: string;
};

type QualityReport = {
  summary?: string;
  messages?: string[];
  sufficiency?: Record<string, string>;
  provenance?: Array<{
    label: string;
    source: string;
    preview: string | null;
    note?: string;
  }>;
  bht_basis?: string;
  amar_char_count?: number;
  amar_truncated?: boolean;
};

type SuggestionsBundle = {
  suggestions: Suggestion[];
  objek_suggestions?: Suggestion[];
  respons_suggestions?: Suggestion[];
  empty_reason: string | null;
  quality?: QualityReport;
  detected_at?: string;
  source?: string;
} | null;

type Props = {
  id?: number;
  initial?: Record<string, unknown>;
  initialSuggestions?: SuggestionsBundle;
  initialQuality?: QualityReport | null;
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function sufBadge(s?: string) {
  if (s === "cukup") return "ok";
  if (s === "partial") return "warn";
  return "muted";
}

export function CaseCodingForm({
  id,
  initial = {},
  initialSuggestions = null,
  initialQuality = null,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionsBundle>(
    initialSuggestions,
  );
  const quality =
    suggestions?.quality || initialQuality || null;

  const [nomor_perkara, setNomor] = useState(String(initial.nomor_perkara || ""));
  const [jenis_perkara, setJenis] = useState(String(initial.jenis_perkara || ""));
  const [tanggal_register, setTanggal] = useState(String(initial.tanggal_register || ""));
  const [status_perkara, setStatus] = useState(String(initial.status_perkara || ""));
  const [tahun, setTahun] = useState(String(initial.tahun || ""));
  const [status_pekerjaan, setPekerjaan] = useState(String(initial.status_pekerjaan || ""));
  const [kehadiran, setKehadiran] = useState(String(initial.kehadiran || ""));
  const [bukti_pendapatan, setBukti] = useState(String(initial.bukti_pendapatan || ""));
  const [objek, setObjek] = useState<string[]>(
    (initial.objek_nafkah as string[]) || [],
  );
  const [modus, setModus] = useState<string[]>(
    (initial.modus_asimetri as string[]) || [],
  );
  const [respons, setRespons] = useState<string[]>(
    (initial.respons_hakim as string[]) || [],
  );
  const [indikasi, setIndikasi] = useState(String(initial.indikasi_asimetri || ""));
  const [pertimbangan, setPertimbangan] = useState(
    String(initial.pertimbangan_hakim || ""),
  );
  const [nominal, setNominal] = useState(String(initial.nominal_ringkas || ""));
  const [maqasid, setMaqasid] = useState<Record<string, number>>(
    (initial.maqasid as Record<string, number>) || {},
  );
  const [evaluasi, setEvaluasi] = useState(String(initial.evaluasi_notes || ""));
  const [quotes, setQuotes] = useState(String(initial.evidence_quotes || ""));
  const [catatan, setCatatan] = useState(String(initial.catatan_peneliti || ""));
  const [coding_status, setCodingStatus] = useState(
    String(initial.coding_status || "draft"),
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMsg("");
    const payload = {
      nomor_perkara,
      jenis_perkara,
      tanggal_register,
      status_perkara,
      tahun: tahun ? Number(tahun) : undefined,
      status_pekerjaan,
      kehadiran,
      bukti_pendapatan,
      objek_nafkah: objek,
      modus_asimetri: modus,
      respons_hakim: respons,
      indikasi_asimetri: indikasi,
      pertimbangan_hakim: pertimbangan,
      nominal_ringkas: nominal,
      maqasid,
      evaluasi_notes: evaluasi,
      evidence_quotes: quotes,
      catatan_peneliti: catatan,
      coding_status,
      para_pihak_masked: initial.para_pihak_masked || "Disamarkan",
      sipp_detail_url: initial.sipp_detail_url || null,
      sumber: initial.sumber || "manual",
    };

    const res = await fetch(id ? `/api/cases/${id}` : "/api/cases", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal menyimpan");
      return;
    }
    const data = await res.json();
    setMsg("Tersimpan.");
    if (!id && data.id) {
      router.push(`/perkara/${data.id}`);
      router.refresh();
    } else {
      router.refresh();
    }
  }

  async function redetectModus() {
    if (!id) return;
    setDetecting(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/cases/detect-modus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: id }),
    });
    const data = await res.json().catch(() => ({}));
    setDetecting(false);
    if (!res.ok) {
      setError(data.error || "Deteksi gagal");
      return;
    }
    setSuggestions({
      suggestions: data.suggestions || [],
      objek_suggestions: data.objek_suggestions || [],
      respons_suggestions: data.respons_suggestions || [],
      empty_reason: data.empty_reason || null,
      quality: data.quality,
      detected_at: new Date().toISOString(),
      source: "case_redetect",
    });
    if (!data.skippedConfirmed) {
      const med = (data.suggestions || []).filter(
        (s: Suggestion) => s.confidence === "med",
      );
      if (med.length && modus.length === 0) {
        setModus(med.map((s: Suggestion) => s.id));
      }
    }
    setMsg(
      data.suggestions?.length || data.objek_suggestions?.length
        ? `Usulan andal diperbarui. ${data.skippedConfirmed ? "(koding terkonfirmasi tidak ditimpa)" : ""}`
        : data.empty_reason || "Belum terdeteksi.",
    );
    router.refresh();
  }

  const suggestionList = suggestions?.suggestions || [];
  const objekSug = suggestions?.objek_suggestions || [];
  const responsSug = suggestions?.respons_suggestions || [];
  const suf = quality?.sufficiency || {};

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? <div className="flash ok">{msg}</div> : null}

      <div className="flash info" style={{ marginBottom: "1rem" }}>
        Sinkron SIPP mengimpor identitas, BHT, verstek, amar, pekerjaan,{" "}
        <strong>nominal iddah/mut&apos;ah/anak</strong> (kolom DB bila ada, else parse amar;
        anak dari <span className="mono">jumlah_nafkah</span>), serta{" "}
        <strong>path/URL PDF putusan</strong>. Checklist di bawah tetap untuk koding Bab I /
        Lampiran 1C; modus dalam (tadlis/gaya hidup) dan maqasid tetap analisis peneliti.
      </div>

      {Boolean(
        initial.nominal_iddah != null ||
          initial.nominal_mutah != null ||
          initial.nominal_hadhanah != null ||
          initial.putusan_pdf_url ||
          initial.amar_putusan_dok,
      ) ? (
        <div className="panel" style={{ marginBottom: "1rem", padding: "0.85rem 1rem" }}>
          <div className="block-title" style={{ marginTop: 0 }}>
            Nominal &amp; PDF dari sync SIPP
          </div>
          <div className="grid-2">
            <div>
              <p className="muted" style={{ marginBottom: "0.25rem" }}>
                Iddah:{" "}
                <span className="mono">
                  {initial.nominal_iddah != null
                    ? Number(initial.nominal_iddah).toLocaleString("id-ID")
                    : "—"}
                </span>
              </p>
              <p className="muted" style={{ marginBottom: "0.25rem" }}>
                Mut&apos;ah:{" "}
                <span className="mono">
                  {initial.nominal_mutah != null
                    ? Number(initial.nominal_mutah).toLocaleString("id-ID")
                    : "—"}
                </span>
              </p>
              <p className="muted" style={{ marginBottom: "0.25rem" }}>
                Nafkah anak:{" "}
                <span className="mono">
                  {initial.nominal_hadhanah != null
                    ? Number(initial.nominal_hadhanah).toLocaleString("id-ID")
                    : "—"}
                </span>
              </p>
              {initial.nominal_madhiyah != null ? (
                <p className="muted" style={{ marginBottom: "0.25rem" }}>
                  Madhiyah:{" "}
                  <span className="mono">
                    {Number(initial.nominal_madhiyah).toLocaleString("id-ID")}
                  </span>
                </p>
              ) : null}
            </div>
            <div>
              {typeof initial.putusan_pdf_url === "string" && initial.putusan_pdf_url ? (
                <p>
                  <a href={initial.putusan_pdf_url} target="_blank" rel="noreferrer">
                    Buka PDF putusan
                  </a>
                </p>
              ) : typeof initial.amar_putusan_dok === "string" &&
                initial.amar_putusan_dok ? (
                <p className="muted">
                  Path relatif:{" "}
                  <span className="mono">{String(initial.amar_putusan_dok)}</span>
                  <br />
                  Set <span className="mono">SIPP_PDF_BASE_URL</span> agar menjadi link.
                </p>
              ) : (
                <p className="muted">PDF path belum terisi.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {quality ? (
        <div className="panel" style={{ marginBottom: "1rem", padding: "0.85rem 1rem" }}>
          <div className="block-title" style={{ marginTop: 0 }}>
            Kecukupan data SIPP untuk koding
          </div>
          <p style={{ marginBottom: "0.5rem" }}>{quality.summary}</p>
          <div className="checks" style={{ marginBottom: "0.75rem" }}>
            {Object.entries(suf).map(([k, v]) => (
              <span key={k} className={`badge ${sufBadge(v)}`} title={k}>
                {k}: {v}
              </span>
            ))}
          </div>
          {quality.messages?.length ? (
            <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.1rem" }}>
              {quality.messages.map((m, i) => (
                <li key={i} className="muted">
                  {m}
                </li>
              ))}
            </ul>
          ) : null}
          <details>
            <summary className="muted">Provenance field (sumber SIPP)</summary>
            <table className="data" style={{ marginTop: "0.5rem" }}>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Sumber</th>
                  <th>Isi</th>
                </tr>
              </thead>
              <tbody>
                {(quality.provenance || []).map((p) => (
                  <tr key={p.source + p.label}>
                    <td>{p.label}</td>
                    <td className="mono muted">{p.source}</td>
                    <td>
                      {p.preview || "—"}
                      {p.note ? (
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {p.note}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          <label>Nomor perkara (internal peneliti)</label>
          <input value={nomor_perkara} onChange={(e) => setNomor(e.target.value)} />
          <label>Jenis / klasifikasi</label>
          <input value={jenis_perkara} onChange={(e) => setJenis(e.target.value)} />
          <label>Tanggal register</label>
          <input value={tanggal_register} onChange={(e) => setTanggal(e.target.value)} />
          <label>Status perkara (SIPP)</label>
          <input value={status_perkara} onChange={(e) => setStatus(e.target.value)} />
          <label>Tahun (dokumen / putusan)</label>
          <input value={tahun} onChange={(e) => setTahun(e.target.value)} />
        </div>
        <div>
          <label>Status pekerjaan suami</label>
          <select value={status_pekerjaan} onChange={(e) => setPekerjaan(e.target.value)}>
            <option value="">— pilih —</option>
            {STATUS_PEKERJAAN.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <label>Kehadiran tergugat/termohon</label>
          <select value={kehadiran} onChange={(e) => setKehadiran(e.target.value)}>
            <option value="">— pilih —</option>
            {KEHADIRAN.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <label>Status koding</label>
          <select value={coding_status} onChange={(e) => setCodingStatus(e.target.value)}>
            <option value="draft">draft</option>
            <option value="coded">coded</option>
          </select>
          <label>Bukti pendapatan yang diajukan (1C — dari putusan)</label>
          <textarea value={bukti_pendapatan} onChange={(e) => setBukti(e.target.value)} />
        </div>
      </div>

      <div className="block-title">Objek nafkah (fokus: iddah, mut&apos;ah, anak)</div>
      <div className="checks">
        {OBJEK_NAFKAH.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={objek.includes(o.id)}
              onChange={() => setObjek(toggle(objek, o.id))}
            />
            {o.label}
            {objekSug.some((s) => s.id === o.id) ? (
              <span className="badge warn" style={{ marginLeft: 6 }}>
                usulan
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <div className="block-title">Modus / indikasi asimetri (operasionalisasi)</div>
      <div className="checks">
        {MODUS_ASIMETRI.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={modus.includes(o.id)}
              onChange={() => setModus(toggle(modus, o.id))}
            />
            {o.label}
            {suggestionList.some((s) => s.id === o.id) ? (
              <span className="badge warn" style={{ marginLeft: 6 }}>
                usulan
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <div className="panel" style={{ marginTop: "0.75rem", padding: "0.85rem 1rem" }}>
        <div className="block-title" style={{ marginTop: 0 }}>
          Usulan andal dari SIPP
        </div>
        {id ? (
          <div className="actions" style={{ marginBottom: "0.5rem" }}>
            <button
              className="btn secondary"
              type="button"
              disabled={detecting || saving}
              onClick={() => redetectModus()}
            >
              {detecting ? "Mendeteksi…" : "Deteksi ulang"}
            </button>
          </div>
        ) : null}
        {suggestionList.length || objekSug.length || responsSug.length ? (
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
            {suggestionList.map((s) => (
              <li key={"m-" + s.id} style={{ marginBottom: "0.4rem" }}>
                <strong>Modus: {s.label}</strong>{" "}
                <span className={`badge ${s.confidence === "med" ? "ok" : "warn"}`}>
                  {s.confidence}
                </span>{" "}
                <span className="muted mono">({s.field})</span>
                <div className="muted">“{s.evidence}”</div>
                {!modus.includes(s.id) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setModus((p) => [...p, s.id])}
                  >
                    Terima
                  </button>
                ) : (
                  <span className="badge ok">di checklist</span>
                )}
              </li>
            ))}
            {objekSug.map((s) => (
              <li key={"o-" + s.id} style={{ marginBottom: "0.4rem" }}>
                <strong>Objek: {s.label}</strong>{" "}
                <span className={`badge ${s.confidence === "med" ? "ok" : "warn"}`}>
                  {s.confidence}
                </span>
                <div className="muted">“{s.evidence}”</div>
                {!objek.includes(s.id) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setObjek((p) => [...p, s.id])}
                  >
                    Terima
                  </button>
                ) : null}
              </li>
            ))}
            {responsSug.map((s) => (
              <li key={"r-" + s.id} style={{ marginBottom: "0.4rem" }}>
                <strong>Respons: {s.label}</strong>{" "}
                <span className={`badge ${s.confidence === "med" ? "ok" : "warn"}`}>
                  {s.confidence}
                </span>
                <div className="muted">“{s.evidence}”</div>
                {!respons.includes(s.id) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setRespons((p) => [...p, s.id])}
                  >
                    Terima
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            {suggestions?.empty_reason ||
              "belum terdeteksi — lengkapi manual / unggah putusan"}
          </p>
        )}
      </div>

      <div className="block-title">Respons hakim</div>
      <div className="checks">
        {RESPONS_HAKIM.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={respons.includes(o.id)}
              onChange={() => setRespons(toggle(respons, o.id))}
            />
            {o.label}
          </label>
        ))}
      </div>

      <label>Indikasi asimetri informasi (1C — naratif)</label>
      <textarea value={indikasi} onChange={(e) => setIndikasi(e.target.value)} />

      <label>Pertimbangan hakim terkait kemampuan ekonomi (1C)</label>
      <textarea value={pertimbangan} onChange={(e) => setPertimbangan(e.target.value)} />

      <label>
        Nominal yang diputus — ringkas (diisi otomatis dari SIPP: iddah / mut&apos;ah /
        anak; boleh disunting)
      </label>
      <input value={nominal} onChange={(e) => setNominal(e.target.value)} />

      <div className="block-title">Rubrik maqasid / al-&apos;adl (opsional 1–5; 1C = catatan)</div>
      <div className="grid-2">
        {MAQASID_RUBRIC.map((r) => (
          <div key={r.id}>
            <label>{r.label}</label>
            <select
              value={maqasid[r.id] ?? ""}
              onChange={(e) =>
                setMaqasid({ ...maqasid, [r.id]: Number(e.target.value) })
              }
            >
              <option value="">—</option>
              {r.scale.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <label>Catatan evaluasi maqasid / keadilan distribusi (1C — analisis peneliti)</label>
      <textarea value={evaluasi} onChange={(e) => setEvaluasi(e.target.value)} />

      <label>Kutipan bukti / putusan (evidence quotes)</label>
      <textarea value={quotes} onChange={(e) => setQuotes(e.target.value)} />

      <label>Catatan peneliti</label>
      <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} />

      <div className="actions">
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan koding"}
        </button>
      </div>
    </form>
  );
}
