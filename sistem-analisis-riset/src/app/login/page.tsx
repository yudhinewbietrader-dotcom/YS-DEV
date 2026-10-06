"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login gagal");
      return;
    }
    router.push(params.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? <div className="flash error">{error}</div> : null}
      <label htmlFor="password">Kata sandi peneliti</label>
      <input
        id="password"
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="RESEARCHER_PASSWORD"
        required
      />
      <div className="actions">
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: "1rem" }}>
        Default lokal: lihat <span className="mono">.env.example</span>. Ganti sebelum
        dipakai di lapangan.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="panel login-card">
        <h1>Area peneliti</h1>
        <p>Autentikasi sederhana berbasis kata sandi lingkungan (env).</p>
        <Suspense fallback={<p>Memuat…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
