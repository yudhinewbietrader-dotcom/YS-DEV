"use client";

import { FormEvent, useEffect, useState } from "react";

type Inf = {
  id: number;
  kode: string;
  peran: string;
  instrumen: string;
  pseudonym: string;
  jabatan_ringkas: string | null;
  status_wawancara: string;
  jadwal: string | null;
  token?: string;
  response_status?: string | null;
};

const CHECKLIST = [
  { id: "izin_institusi", label: "Izin institusi" },
  { id: "informed_consent", label: "Informed consent" },
  { id: "rekaman_izin", label: "Izin rekaman (jika ada)" },
  { id: "transkrip", label: "Transkrip selesai" },
];

export function InformantManager() {
  const [rows, setRows] = useState<Inf[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pseudonym, setPseudonym] = useState("");
  const [peran, setPeran] = useState("hakim");
  const [jadwal, setJadwal] = useState("");

  async function load() {
    const res = await fetch("/api/informants");
    const data = await res.json();
    setRows(data.informants || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const res = await fetch("/api/informants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peran,
        instrumen: peran === "panitera" ? "panitera" : "hakim",
        pseudonym: pseudonym || undefined,
        jadwal: jadwal || null,
        status_wawancara: jadwal ? "jadwal" : "belum",
        checklist: ["izin_institusi", "informed_consent"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Gagal menambah");
      return;
    }
    setMsg(`Informan ${data.kode} dibuat. Token: ${data.token}`);
    setPseudonym("");
    await load();
  }

  async function updateStatus(id: number, status_wawancara: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    await fetch(`/api/informants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pseudonym: row.pseudonym,
        jabatan_ringkas: row.jabatan_ringkas,
        status_wawancara,
        jadwal: row.jadwal,
        checklist: ["izin_institusi", "informed_consent"],
        catatan: "",
      }),
    });
    await load();
  }

  return (
    <div>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? <div className="flash ok mono">{msg}</div> : null}

      <section className="panel">
        <h2>Tambah informan</h2>
        <form onSubmit={create} className="grid-2">
          <div>
            <label>Pseudonim</label>
            <input
              value={pseudonym}
              onChange={(e) => setPseudonym(e.target.value)}
              placeholder="Hakim D / Panitera E"
            />
            <label>Peran / instrumen</label>
            <select value={peran} onChange={(e) => setPeran(e.target.value)}>
              <option value="hakim">Hakim (instrumen hakim)</option>
              <option value="ketua">Ketua/Wakil (instrumen hakim)</option>
              <option value="panitera">Panitera/PP</option>
            </select>
          </div>
          <div>
            <label>Jadwal wawancara</label>
            <input
              type="datetime-local"
              value={jadwal}
              onChange={(e) => setJadwal(e.target.value)}
            />
            <div className="actions">
              <button className="btn" type="submit">
                Buat + generate tautan
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Daftar informan</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Pseudonim</th>
              <th>Status</th>
              <th>Jadwal</th>
              <th>Tautan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.kode}</strong>
                  <div className="muted">{r.instrumen}</div>
                </td>
                <td>{r.pseudonym}</td>
                <td>
                  <span className="badge">{r.status_wawancara}</span>
                  {r.response_status ? (
                    <div className="muted">respons: {r.response_status}</div>
                  ) : null}
                </td>
                <td className="muted">{r.jadwal || "—"}</td>
                <td className="mono">
                  {r.token ? (
                    <a href={`/w/${r.token}`} target="_blank" rel="noreferrer">
                      /w/{r.token.slice(0, 8)}…
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <select
                    value={r.status_wawancara}
                    onChange={(e) => updateStatus(r.id, e.target.value)}
                  >
                    <option value="belum">belum</option>
                    <option value="jadwal">jadwal</option>
                    <option value="berlangsung">berlangsung</option>
                    <option value="selesai">selesai</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: "0.75rem" }}>
          Checklist instrumen disarankan: {CHECKLIST.map((c) => c.label).join(" · ")}.
        </p>
      </section>
    </div>
  );
}
