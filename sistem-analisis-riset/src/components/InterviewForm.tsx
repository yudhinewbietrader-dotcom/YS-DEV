"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { InstrumentDef } from "@/lib/instruments";

type Props = { token: string };

export function InterviewForm({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(false);
  const [consent, setConsent] = useState(false);
  const [informant, setInformant] = useState<{ kode: string; pseudonym: string } | null>(
    null,
  );
  const [instrument, setInstrument] = useState<InstrumentDef | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/public/interview/${token}`);
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error || "Tautan tidak valid");
        return;
      }
      setInformant(data.informant);
      setInstrument(data.instrument);
      if (data.existing?.locked) {
        setLocked(true);
        setDone(true);
      } else if (data.existing?.answers) {
        setAnswers(data.existing.answers);
        setConsent(Boolean(data.existing.consent));
      }
    })();
  }, [token]);

  const blocks = useMemo(() => {
    if (!instrument) return [] as string[];
    return [...new Set(instrument.questions.map((q) => q.block))];
  }, [instrument]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Centang persetujuan informed consent terlebih dahulu.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/public/interview/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true, answers }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal mengirim");
      return;
    }
    setDone(true);
  }

  if (loading) {
    return <div className="panel">Memuat formulir…</div>;
  }

  if (error && !instrument) {
    return <div className="panel flash error">{error}</div>;
  }

  if (done) {
    return (
      <div className="panel">
        <h1>Terima kasih</h1>
        <p style={{ color: "var(--ink)" }}>
          {locked
            ? "Respons Anda sudah dikunci oleh peneliti dan tidak dapat diubah."
            : "Jawaban telah tersimpan. Peneliti dapat meninjaunya di dasbor lapangan."}
        </p>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <p className="badge">Formulir informan · tanpa akun</p>
      <h1 style={{ marginTop: "0.5rem" }}>{instrument?.title}</h1>
      <p>{instrument?.description}</p>
      <p className="muted">
        Kode informan: <strong>{informant?.kode}</strong> ({informant?.pseudonym}) — identitas
        disamarkan dalam laporan.
      </p>

      <div className="flash info">
        <label style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", margin: 0 }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: "0.25rem" }}
          />
          <span>
            Saya memahami tujuan penelitian, bersedia diwawancarai secara sukarela, dan
            menyetujui bahwa jawaban akan dipakai untuk tesis dengan identitas disamarkan
            (informed consent).
          </span>
        </label>
      </div>

      {error ? <div className="flash error">{error}</div> : null}

      {blocks.map((block) => (
        <div key={block}>
          <div className="block-title">{block}</div>
          {instrument?.questions
            .filter((q) => q.block === block)
            .map((q) => (
              <div key={q.id}>
                <label>
                  {q.prompt}
                  {q.required ? " *" : ""}
                </label>
                {q.type === "multiselect" ? (
                  <div className="checks">
                    {(q.options || []).map((opt) => {
                      const current = Array.isArray(answers[q.id])
                        ? (answers[q.id] as string[])
                        : [];
                      return (
                        <label key={opt.value}>
                          <input
                            type="checkbox"
                            checked={current.includes(opt.value)}
                            onChange={() => {
                              const next = current.includes(opt.value)
                                ? current.filter((x) => x !== opt.value)
                                : [...current, opt.value];
                              setAnswers({ ...answers, [q.id]: next });
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    required={q.required}
                    value={String(answers[q.id] || "")}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                )}
              </div>
            ))}
        </div>
      ))}

      <div className="actions">
        <button className="btn" type="submit" disabled={saving || !consent}>
          {saving ? "Mengirim…" : "Kirim jawaban"}
        </button>
      </div>
    </form>
  );
}
