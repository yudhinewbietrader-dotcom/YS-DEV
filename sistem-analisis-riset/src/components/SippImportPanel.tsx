"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Item = {
  nomor_perkara: string;
  tanggal_register: string;
  jenis_perkara: string;
  para_pihak_masked: string;
  status_perkara: string;
  detail_url: string;
};

export function SippImportPanel() {
  const [keyword, setKeyword] = useState("Cerai Gugat");
  const [nomor, setNomor] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedLink, setSavedLink] = useState("");

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/sipp/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(`${data.error || "Gagal"} ${data.hint || ""}`);
      return;
    }
    setItems(data.items || []);
    setMsg(`Ditemukan ${data.count} baris dari SIPP publik (halaman hasil pencarian).`);
  }

  async function fetchNomor(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    setSavedLink("");
    const res = await fetch("/api/sipp/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nomor_perkara: nomor, save: true }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(`${data.error || "Gagal"} ${data.hint || ""}`);
      if (data.list) setItems(data.list);
      return;
    }
    setMsg(`Tersimpan sebagai ${data.kode_berkas}`);
    if (data.savedId) setSavedLink(`/perkara/${data.savedId}`);
  }

  async function saveItem(item: Item) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/sipp/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail_url: item.detail_url, save: true }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    setMsg(`Tersimpan ${data.kode_berkas}`);
    if (data.savedId) setSavedLink(`/perkara/${data.savedId}`);
  }

  async function uploadFile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/cases/import", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Impor gagal");
      return;
    }
    setMsg(`Impor selesai: ${data.inserted} baru, ${data.updated} diperbarui.`);
  }

  return (
    <div>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? (
        <div className="flash ok">
          {msg}{" "}
          {savedLink ? (
            <Link href={savedLink}>Buka koding →</Link>
          ) : null}
        </div>
      ) : null}

      <section className="panel">
        <h2>1. Cari di SIPP publik</h2>
        <p className="muted">
          POST ke <span className="mono">/list_perkara/search</span> pada{" "}
          <span className="mono">https://sipp.pa-sambas.go.id</span> — User-Agent jelas +
          jeda antar permintaan.
        </p>
        <form onSubmit={search}>
          <label>Kata kunci (mis. Cerai Gugat, Cerai Talak, nomor perkara)</label>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <div className="actions">
            <button className="btn" disabled={busy}>
              Cari SIPP
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>2. Tempel nomor perkara → fetch + simpan</h2>
        <form onSubmit={fetchNomor}>
          <label>Nomor perkara</label>
          <input
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            placeholder="contoh: 1212/Pdt.G/2026/PA.Sbs"
          />
          <div className="actions">
            <button className="btn secondary" disabled={busy}>
              Fetch & simpan
            </button>
          </div>
        </form>
      </section>

      {items.length > 0 ? (
        <section className="panel">
          <h2>Hasil pencarian</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Nomor</th>
                <th>Jenis</th>
                <th>Status</th>
                <th>Pihak (disamarkan)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.nomor_perkara + it.detail_url}>
                  <td className="mono">{it.nomor_perkara}</td>
                  <td>{it.jenis_perkara}</td>
                  <td>{it.status_perkara}</td>
                  <td className="muted">{it.para_pihak_masked}</td>
                  <td>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => saveItem(it)}
                    >
                      Simpan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="panel">
        <h2>3. Impor CSV / JSON (jalur utama cadangan)</h2>
        <p className="muted">
          Kolom disarankan:{" "}
          <span className="mono">
            nomor_perkara,jenis_perkara,tanggal_register,status_perkara,para_pihak,sipp_detail_url,tahun
          </span>
        </p>
        <form onSubmit={uploadFile}>
          <label>File .csv atau .json</label>
          <input type="file" name="file" accept=".csv,.json,text/csv,application/json" required />
          <div className="actions">
            <button className="btn" disabled={busy}>
              Unggah & impor
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
