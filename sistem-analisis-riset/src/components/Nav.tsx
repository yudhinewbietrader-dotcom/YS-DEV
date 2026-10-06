import Link from "next/link";

export function Nav() {
  return (
    <header className="nav">
      <Link href="/dashboard" className="brand">
        Sistem Analisis Riset
        <span>PA Sambas · Nafkah & Asimetri Informasi</span>
      </Link>
      <nav className="nav-links">
        <Link href="/dashboard">Dasbor</Link>
        <Link href="/perkara">Berkas / Koding</Link>
        <Link href="/perkara/impor">Impor SIPP</Link>
        <Link href="/informan">Informan</Link>
        <Link href="/wawancara">Wawancara</Link>
        <Link href="/ekspor">Ekspor</Link>
        <form action="/api/auth/logout" method="post" style={{ display: "inline" }}>
          <button className="btn ghost" type="submit" style={{ padding: "0.25rem 0.55rem" }}>
            Keluar
          </button>
        </form>
      </nav>
    </header>
  );
}
