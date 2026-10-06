"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BulkModusDetectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/cases/detect-modus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: true, onlyDraft: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Deteksi gagal");
      return;
    }
    setMsg(
      `Dipindai ${data.scanned} perkara · ${data.withSuggestions} dengan usulan · ${data.withoutSignal} tanpa sinyal · soft-isi ${data.softApplied} · dilewati (sudah terkode) ${data.skippedConfirmed}.`,
    );
    router.refresh();
  }

  return (
    <div>
      <button className="btn secondary" type="button" disabled={busy} onClick={run}>
        {busy ? "Mendeteksi modus…" : "Deteksi modus (massal)"}
      </button>
      {error ? <div className="flash error" style={{ marginTop: 8 }}>{error}</div> : null}
      {msg ? <div className="flash ok" style={{ marginTop: 8 }}>{msg}</div> : null}
      <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
        Heuristik dari amar/status/pekerjaan/verstek SIPP. Tidak menimpa perkara berstatus{" "}
        <span className="mono">coded</span> atau yang sudah punya modus.
      </p>
    </div>
  );
}
