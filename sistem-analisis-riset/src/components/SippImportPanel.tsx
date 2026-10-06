"use client";

import { FormEvent, useEffect, useState } from "react";
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
  skippedNonBht?: number;
  truncated?: boolean;
  note?: string;
  modusDetect?: {
    scanned: number;
    withSuggestions: number;
    withoutSignal: number;
    softApplied: number;
    skippedConfirmed: number;
  };
  samples?: Array<{
    nomor_perkara: string;
    jenis_perkara: string | null;
    status_perkara: string | null;
    tanggal_bht?: string | null;
    action: string;
    modus_suggested?: string[];
  }>;
};

type LocalStatus = {
  configured: boolean;
  host: string | null;
  database: string;
  port: number;
  probe: { ok: boolean; sampleCount?: number; error?: string };
};

export function SippImportPanel() {
  const [keyword, setKeyword] = useState("Cerai Gugat");
  const [bhtKeywords, setBhtKeywords] = useState("Cerai Gugat, Cerai Talak");
  const [localKeywords, setLocalKeywords] = useState("Cerai Gugat, Cerai Talak");
  const [dateFrom, setDateFrom] = useState("01 Jan 2024");
  const [dateTo, setDateTo] = useState("");
  const [localDateFrom, setLocalDateFrom] = useState("2024-01-01");
  const [localDateTo, setLocalDateTo] = useState("");
  const [maxPages, setMaxPages] = useState(8);
  const [localLimit, setLocalLimit] = useState(500);
  const [nomor, setNomor] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [savedLink, setSavedLink] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [localResult, setLocalResult] = useState<SyncResult | null>(null);
  const [progressHint, setProgressHint] = useState("");
  const [localStatus, setLocalStatus] = useState<LocalStatus | null>(null);

  useEffect(() => {
    fetch("/api/sipp/sync-local")
      .then((r) => r.json())
      .then((d) => setLocalStatus(d))
      .catch(() => setLocalStatus(null));
  }, []);

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

  async function syncLocal(e: FormEvent) {
    e.preventDefault();
    setLocalBusy(true);
    setError("");
    setMsg("");
    setLocalResult(null);
    setProgressHint("Mengambil data dari MariaDB/MySQL SIPP lokal (read-only)…");
    const res = await fetch("/api/sipp/sync-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: localKeywords,
        dateFrom: localDateFrom || null,
        dateTo: localDateTo || null,
        onlyBht: true,
        limit: localLimit,
        refreshExisting: true,
      }),
    });
    const data = await res.json();
    setLocalBusy(false);
    setProgressHint("");
    if (!res.ok) {
      setError(`${data.error || "Sinkron lokal gagal"} ${data.hint || ""}`);
      return;
    }
    setLocalResult(data);
    const md = data.modusDetect;
    setMsg(
      `Sinkron SIPP lokal selesai: ditemukan ${data.found}, diimpor baru ${data.imported}, diperbarui ${data.updated}` +
        (md
          ? ` · usulan modus: ${md.withSuggestions}/${md.scanned} perkara, tanpa sinyal ${md.withoutSignal}`
          : "") +
        ".",
    );
    fetch("/api/sipp/sync-local")
      .then((r) => r.json())
      .then((d) => setLocalStatus(d))
      .catch(() => null);
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
      `Sinkron BHT publik selesai: ditemukan ${data.found}, diimpor baru ${data.imported}, diperbarui ${data.updated}, duplikat/dilewati ${data.skippedDuplicates}.`,
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

  const anyBusy = busy || syncBusy || localBusy;

  return (
    <div>
      {error ? <div className="flash error">{error}</div> : null}
      {msg ? (
        <div className="flash ok">
          {msg}{" "}
          {savedLink ? <Link href={savedLink}>Buka koding →</Link> : null}{" "}
          {syncResult || localResult ? (
            <Link href="/perkara">Lihat workspace berkas →</Link>
          ) : null}
        </div>
      ) : null}
      {progressHint ? <div className="flash info">{progressHint}</div> : null}

      <section className="panel hero">
        <h2>Sinkron SIPP Lokal (MySQL/MariaDB)</h2>
        <p style={{ color: "var(--ink)" }}>
          Ambil perkara BHT/final langsung dari database SIPP satker (skema{" "}
          <span className="mono">sipp32</span>) — metadata: tanggal_bht, tahapan/proses,
          verstek, cuplikan amar, akta cerai, pekerjaan pihak. Setelah sync, sistem
          menjalankan <strong>usulan otomatis modus</strong> (heuristik) — bukan koding
          final; konfirmasi di workspace. Nama pihak tetap disamarkan.
        </p>
        {localStatus ? (
          <p className="muted">
            Status koneksi:{" "}
            {localStatus.probe?.ok ? (
              <span className="badge ok">
                terhubung · {localStatus.host}/{localStatus.database} ·{" "}
                {localStatus.probe.sampleCount?.toLocaleString("id-ID")} perkara
              </span>
            ) : (
              <span className="badge warn">
                belum siap — {localStatus.probe?.error || "isi SIPP_ENABLED + SIPP_HOST/USER/PASSWORD/DB di .env.local"}
              </span>
            )}
          </p>
        ) : (
          <p className="muted">Memeriksa konfigurasi SIPP_ENABLED / SIPP_HOST…</p>
        )}
        <form onSubmit={syncLocal}>
          <label>Kata kunci (jenis perkara / nomor — pisahkan koma)</label>
          <input
            value={localKeywords}
            onChange={(e) => setLocalKeywords(e.target.value)}
            placeholder="Cerai Gugat, Cerai Talak"
            required
          />
          <div className="grid-2">
            <div>
              <label>Tanggal pendaftaran dari</label>
              <input
                value={localDateFrom}
                onChange={(e) => setLocalDateFrom(e.target.value)}
                placeholder="2024-01-01"
              />
            </div>
            <div>
              <label>Tanggal pendaftaran sampai</label>
              <input
                value={localDateTo}
                onChange={(e) => setLocalDateTo(e.target.value)}
                placeholder="kosong = tanpa batas"
              />
            </div>
          </div>
          <label>Batas jumlah perkara (LIMIT)</label>
          <input
            type="number"
            min={1}
            max={2000}
            value={localLimit}
            onChange={(e) => setLocalLimit(Number(e.target.value) || 500)}
          />
          <p className="muted">
            Filter BHT: perkara_putusan.tanggal_bht tidak kosong, atau ada
            perkara_akta_cerai, atau proses terakhir mengandung Akta Cerai/BHT/Berkekuatan.
            Hanya SELECT.
          </p>
          <div className="actions">
            <button className="btn" type="submit" disabled={anyBusy}>
              {localBusy ? "Menyinkronkan lokal…" : "Sinkron SIPP Lokal"}
            </button>
            <Link className="btn ghost" href="/perkara">
              Buka daftar berkas
            </Link>
          </div>
        </form>
        {localResult ? (
          <div style={{ marginTop: "1rem" }}>
            <div className="grid-3">
              <div className="stat">
                <strong>{localResult.found}</strong>
                <span>Ditemukan</span>
              </div>
              <div className="stat">
                <strong>{localResult.imported}</strong>
                <span>Diimpor baru</span>
              </div>
              <div className="stat">
                <strong>{localResult.updated ?? localResult.skippedDuplicates}</strong>
                <span>Diperbarui / duplikat</span>
              </div>
            </div>
            {localResult.modusDetect ? (
              <div className="grid-3" style={{ marginTop: "0.75rem" }}>
                <div className="stat">
                  <strong>{localResult.modusDetect.scanned}</strong>
                  <span>Dipindai modus</span>
                </div>
                <div className="stat">
                  <strong>{localResult.modusDetect.withSuggestions}</strong>
                  <span>Dengan usulan</span>
                </div>
                <div className="stat">
                  <strong>{localResult.modusDetect.withoutSignal}</strong>
                  <span>Tanpa sinyal</span>
                </div>
              </div>
            ) : null}
            {localResult.samples?.length ? (
              <table className="data" style={{ marginTop: "0.75rem" }}>
                <thead>
                  <tr>
                    <th>Nomor</th>
                    <th>Jenis</th>
                    <th>Status</th>
                    <th>tgl BHT</th>
                    <th>Usulan modus</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {localResult.samples.map((s) => (
                    <tr key={s.nomor_perkara + s.action}>
                      <td className="mono">{s.nomor_perkara}</td>
                      <td>{s.jenis_perkara}</td>
                      <td>{s.status_perkara}</td>
                      <td className="mono">{s.tanggal_bht || "—"}</td>
                      <td className="muted">
                        {s.modus_suggested?.length
                          ? s.modus_suggested.join(", ")
                          : "—"}
                      </td>
                      <td>
                        <span className="badge">{s.action}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {localResult.note ? <p className="muted">{localResult.note}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Sinkron BHT publik (cadangan web)</h2>
        <p className="muted">
          Fallback jika DB lokal tidak tersedia. Lihat batasan teks status publik di
          dokumentasi.
        </p>
        <form onSubmit={syncBht}>
          <label>Kata kunci (pisahkan koma)</label>
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
                placeholder="01 Jan 2024"
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
          <label>Maks. halaman per kueri SIPP publik</label>
          <input
            type="number"
            min={1}
            max={40}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value) || 8)}
          />
          <div className="actions">
            <button className="btn secondary" type="submit" disabled={anyBusy}>
              {syncBusy ? "Menyinkronkan BHT publik…" : "Sinkron BHT (publik)"}
            </button>
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
            {syncResult.note ? <p className="muted">{syncResult.note}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>1. Cari di SIPP publik (manual)</h2>
        <form onSubmit={search}>
          <label>Kata kunci</label>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <div className="actions">
            <button className="btn secondary" disabled={anyBusy}>
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
            <button className="btn secondary" disabled={anyBusy}>
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
                      disabled={anyBusy}
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
        <h2>3. Impor CSV / JSON (cadangan)</h2>
        <form onSubmit={uploadFile}>
          <label>File .csv atau .json</label>
          <input type="file" name="file" accept=".csv,.json,text/csv,application/json" required />
          <div className="actions">
            <button className="btn" disabled={anyBusy}>
              Unggah & impor
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
