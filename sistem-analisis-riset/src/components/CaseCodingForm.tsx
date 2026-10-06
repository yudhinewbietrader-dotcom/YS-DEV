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

type SuggestionsBundle = {
  suggestions: Suggestion[];
  empty_reason: string | null;
  detected_at?: string;
  source?: string;
} | null;

type Props = {
  id?: number;
  initial?: Record<string, unknown>;
  initialSuggestions?: SuggestionsBundle;
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function CaseCodingForm({
  id,
  initial = {},
  initialSuggestions = null,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionsBundle>(
    initialSuggestions,
  );

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
      empty_reason: data.empty_reason || null,
      detected_at: new Date().toISOString(),
      source: "case_redetect",
    });
    if (!data.skippedConfirmed && Array.isArray(data.suggestions)) {
      const ids = data.suggestions.map((s: Suggestion) => s.id);
      if (ids.length && modus.length === 0) setModus(ids);
    }
    setMsg(
      data.suggestions?.length
        ? `Usulan: ${data.suggestions.length} modus. ${data.skippedConfirmed ? "(koding terkonfirmasi tidak ditimpa)" : "Dapat diterima ke checklist."}`
        : data.empty_reason || "Belum terdeteksi.",
    );
    router.refresh();
  }

  function acceptSuggestion(sid: string) {
    setModus((prev) => (prev.includes(sid) ? prev : [...prev, sid]));
  }

  function acceptAllSuggestions() {
    const ids = suggestions?.suggestions?.map((s) => s.id) || [];
    setModus((prev) => [...new Set([...prev, ...ids])]);
  }

  const suggestionList = suggestions?.suggestions || [];

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? <div className="flash ok">{msg}</div> : null}

      <div className="flash info" style={{ marginBottom: "1rem" }}>
        Sinkron SIPP mengimpor <strong>metadata</strong> perkara (status, BHT, verstek,
        cuplikan amar, pekerjaan pihak). Modus asimetri dapat diisi lewat{" "}
        <strong>usulan otomatis (heuristik)</strong> — bukan klasifikasi final. Periksa
        bukti, lalu konfirmasi manual. Modus seperti tadlis/PMI sering butuh teks putusan
        lengkap.
      </div>

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
          <label>Tahun</label>
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
          <label>Bukti pendapatan yang diajukan</label>
          <textarea value={bukti_pendapatan} onChange={(e) => setBukti(e.target.value)} />
        </div>
      </div>

      <div className="block-title">Objek nafkah</div>
      <div className="checks">
        {OBJEK_NAFKAH.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={objek.includes(o.id)}
              onChange={() => setObjek(toggle(objek, o.id))}
            />
            {o.label}
          </label>
        ))}
      </div>

      <div className="block-title">Modus asimetri informasi</div>
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
          Usulan otomatis (heuristik SIPP)
        </div>
        {id ? (
          <div className="actions" style={{ marginBottom: "0.5rem" }}>
            <button
              className="btn secondary"
              type="button"
              disabled={detecting || saving}
              onClick={() => redetectModus()}
            >
              {detecting ? "Mendeteksi…" : "Deteksi ulang modus"}
            </button>
            {suggestionList.length > 0 ? (
              <button
                className="btn ghost"
                type="button"
                onClick={() => acceptAllSuggestions()}
              >
                Terima semua usulan
              </button>
            ) : null}
          </div>
        ) : (
          <p className="muted">Simpan berkas dulu untuk menjalankan deteksi.</p>
        )}

        {suggestionList.length > 0 ? (
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
            {suggestionList.map((s) => (
              <li key={s.id} style={{ marginBottom: "0.45rem" }}>
                <strong>{s.label}</strong>{" "}
                <span className={`badge ${s.confidence === "med" ? "ok" : "warn"}`}>
                  {s.confidence}
                </span>{" "}
                <span className="muted mono">({s.field})</span>
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  “{s.evidence}”
                </div>
                {!modus.includes(s.id) ? (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ marginTop: 4 }}
                    onClick={() => acceptSuggestion(s.id)}
                  >
                    Terima
                  </button>
                ) : (
                  <span className="badge ok">di checklist</span>
                )}
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

      <label>Indikasi asimetri informasi</label>
      <textarea value={indikasi} onChange={(e) => setIndikasi(e.target.value)} />

      <label>Pertimbangan hakim terkait kemampuan ekonomi</label>
      <textarea value={pertimbangan} onChange={(e) => setPertimbangan(e.target.value)} />

      <label>Nominal yang diputus (ringkas / disamarkan)</label>
      <input value={nominal} onChange={(e) => setNominal(e.target.value)} />

      <div className="block-title">Rubrik maqasid / al-&apos;adl (1–5)</div>
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

      <label>Catatan evaluasi maqasid / keadilan distribusi</label>
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
