"use client";

import { useEffect, useState } from "react";
import { getInstrument } from "@/lib/instruments";

type Row = {
  id: number;
  kode: string;
  pseudonym: string;
  peran: string;
  instrumen: string;
  status: string;
  locked: number;
  submitted_at: string | null;
};

type Detail = Row & {
  answers_json: string;
  consent: number;
};

export function InterviewReview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/interviews");
    const data = await res.json();
    setRows(data.responses || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function open(id: number) {
    const res = await fetch(`/api/interviews/${id}`);
    const data = await res.json();
    setDetail(data.response);
  }

  async function lock(id: number, lock: boolean) {
    await fetch(`/api/interviews/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lock ? { lock: true } : { unlock: true }),
    });
    setMsg(lock ? "Respons dikunci." : "Kunci dibuka.");
    await load();
    await open(id);
  }

  const answers = detail ? JSON.parse(detail.answers_json || "{}") : {};
  const instrument = detail ? getInstrument(detail.instrumen) : null;

  return (
    <div>
      {msg ? <div className="flash ok">{msg}</div> : null}
      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Informan</th>
              <th>Instrumen</th>
              <th>Status</th>
              <th>Dikirim</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.kode}</strong> · {r.pseudonym}
                </td>
                <td>{r.instrumen}</td>
                <td>
                  <span className={`badge ${r.locked ? "ok" : "warn"}`}>
                    {r.locked ? "terkunci" : r.status}
                  </span>
                </td>
                <td className="muted">{r.submitted_at || "—"}</td>
                <td>
                  <button className="btn ghost" type="button" onClick={() => open(r.id)}>
                    Tinjau
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Belum ada respons.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {detail && instrument ? (
        <section className="panel">
          <h2>
            {detail.kode} — {detail.pseudonym}
          </h2>
          <p className="muted">
            Consent: {detail.consent ? "ya" : "tidak"} · {instrument.title}
          </p>
          {instrument.questions.map((q) => (
            <div key={q.id} style={{ marginBottom: "0.85rem" }}>
              <div className="block-title">{q.block}</div>
              <strong style={{ fontSize: "0.92rem" }}>{q.prompt}</strong>
              <p style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                {Array.isArray(answers[q.id])
                  ? answers[q.id].join(", ")
                  : answers[q.id] || "—"}
              </p>
            </div>
          ))}
          <div className="actions">
            {!detail.locked ? (
              <button className="btn" type="button" onClick={() => lock(detail.id, true)}>
                Kunci respons
              </button>
            ) : (
              <button
                className="btn secondary"
                type="button"
                onClick={() => lock(detail.id, false)}
              >
                Buka kunci
              </button>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
