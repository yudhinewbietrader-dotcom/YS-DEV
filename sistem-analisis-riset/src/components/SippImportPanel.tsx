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

type SyncResult = {
  found: number;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  skippedNonBht: number;
  truncated: boolean;
  note?: string;
  queries?: Array<{
    query: string;
    pagesFetched: number;
    rowsScanned: number;
    totalReported: number | null;
    truncated: boolean;
  }>;
  samples?: Array<{
    nomor_perkara: string;
    jenis_perkara: string;
    status_perkara: string;
    action: string;
  }>;
};

export function SippImportPanel() {
  const [keyword, setKeyword] = useState("Cerai Gugat");
  const [bhtKeywords, setBhtKeywords] = useState("Cerai Gugat, Cerai Talak");
  const [dateFrom, setDateFrom] = useState("01 Jan 2024");
  const [dateTo, setDateTo] = useState("");
  const [maxPages, setMaxPages] = useState(8);
  const [nomor, setNomor] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [savedLink, setSavedLink] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [progressHint, setProgressHint] = useState("");

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

  async function syncBht(e: FormEvent) {
    e.preventDefault();
    setSyncBusy(true);
    setError("");
    setMsg("");
    setSyncResult(null);
    setProgressHint(
      "Mengambil halaman SIPP publik (rate-limited)… proses bisa 1–3 menit tergantung jumlah halaman.",
    );
    const res = await fetch("/api/sipp/sync-bht", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: bhtKeywords,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        maxPagesPerQuery: maxPages,
        refreshExisting: true,
      }),
    });
    const data = await res.json();
    setSyncBusy(false);
    setProgressHint("");
    if (!res.ok) {
      setError(`${data.error || "Sinkron gagal"} ${data.hint || ""}`);
      return;
    }
    setSyncResult(data);
    setMsg(
      `Sinkron BHT selesai: ditemukan ${data.found}, diimpor baru ${data.imported}, diperbarui ${data.updated}, duplikat/dilewati ${data.skippedDuplicates}.`,
    );
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
          {savedLink ? <Link href={savedLink}>Buka koding →</Link> : null}{" "}
          {syncResult ? <Link href="/perkara">Lihat workspace berkas →</Link> : null}
        </div>
      ) : null}
      {progressHint ? <div className="flash info">{progressHint}</div> : null}

      <section className="panel hero">
        <h2>Sinkron BHT (satu klik)</h2>
        <p style={{ color: "var(--ink)" }}>
          Ambil perkara yang status publiknya menandakan sudah final/BHT (termasuk variasi
          teks dan proxy <em>Pembuatan/Penyerahan Akta Cerai</em> di SIPP PA Sambas), lalu{" "}
          <strong>bulk-impor</strong> ke workspace koding — tanpa klik Simpan per baris.
        </p>
        <form onSubmit={syncBht}>
          <label>Kata kunci (pisahkan koma — jenis perkara yang Anda teliti)</label>
          <input
            value={bhtKeywords}
            onChange={(e) => setBhtKeywords(e.target.value)}
            placeholder="Cerai Gugat, Cerai Talak"
            required
          />
          <div className="grid-2">
            <div>
              <label>Tanggal register dari (opsional)</label>
              <input
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="01 Jan 2024 atau 01/01/2024"
              />
            </div>
            <div>
              <label>Tanggal register sampai (opsional)</label>
              <input
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="kosong = tanpa batas atas"
              />
            </div>
          </div>
          <label>
            Maks. halaman per kueri SIPP (20 perkara/halaman; default 8 ≈ 160 baris/kueri)
          </label>
          <input
            type="number"
            min={1}
            max={40}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 8)}
          />
          <p className="muted">
            Sistem juga mencari otomatis “Pembuatan/Penyerahan Akta Cerai” lalu memfilter
            jenis perkara sesuai kata kunci Anda. Rate limit + User-Agent sopan tetap berlaku.
            SIPP publik jarang menulis teks “BHT” harfiah.
          </p>
          <div className="actions">
            <button className="btn" type="submit" disabled={syncBusy || busy}>
              {syncBusy ? "Menyinkronkan BHT…" : "Sinkron BHT ke workspace"}
            </button>
            <Link className="btn ghost" href="/perkara">
              Buka daftar berkas
            </Link>
          </div>
        </form>

        {syncResult ? (
          <div style={{ marginTop: "1rem" }}>
            <div className="grid-3">
              <div className="stat">
                <strong>{syncResult.found}</strong>
                <span>Ditemukan (BHT)</span>
              </div>
              <div className="stat">
                <strong>{syncResult.imported}</strong>
                <span>Diimpor baru</span>
              </div>
              <div className="stat">
                <strong>{syncResult.skippedDuplicates}</strong>
                <span>Duplikat / sudah ada</span>
              </div>
            </div>
            {syncResult.truncated ? (
              <p className="flash info" style={{ marginTop: "0.75rem" }}>
                Hasil terpotong karena batas halaman. Naikkan “Maks. halaman” untuk memindai
                lebih banyak (lebih lama).
              </p>
            ) : null}
            {syncResult.queries?.length ? (
              <table className="data" style={{ marginTop: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Kueri SIPP</th>
                    <th>Halaman</th>
                    <th>Baris dipindai</th>
                    <th>Total SIPP</th>
                  </tr>
                </thead>
                <tbody>
                  {syncResult.queries.map((q) => (
                    <tr key={q.query}>
                      <td>{q.query}</td>
                      <td>{q.pagesFetched}</td>
                      <td>{q.rowsScanned}</td>
                      <td>
                        {q.totalReported ?? "—"}
                        {q.truncated ? " (trunc.)" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {syncResult.samples?.length ? (
              <table className="data" style={{ marginTop: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Contoh nomor</th>
                    <th>Jenis</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {syncResult.samples.map((s) => (
                    <tr key={s.nomor_perkara + s.action}>
                      <td className="mono">{s.nomor_perkara}</td>
                      <td>{s.jenis_perkara}</td>
                      <td>{s.status_perkara}</td>
                      <td>
                        <span className="badge">{s.action}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {syncResult.note ? <p className="muted">{syncResult.note}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>1. Cari di SIPP publik (manual)</h2>
        <p className="muted">
          POST ke <span className="mono">/list_perkara/search</span> pada{" "}
          <span className="mono">https://sipp.pa-sambas.go.id</span> — User-Agent jelas +
          jeda antar permintaan.
        </p>
        <form onSubmit={search}>
          <label>Kata kunci (mis. Cerai Gugat, Cerai Talak, nomor perkara)</label>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <div className="actions">
            <button className="btn secondary" disabled={busy || syncBusy}>
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
            <button className="btn secondary" disabled={busy || syncBusy}>
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
                      disabled={busy || syncBusy}
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
            <button className="btn" disabled={busy || syncBusy}>
              Unggah & impor
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
