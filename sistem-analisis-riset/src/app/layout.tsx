import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistem Analisis Riset — PA Sambas",
  description:
    "Dasbor pengodean berkas SIPP dan portal wawancara lapangan untuk tesis asimetri informasi nafkah pasca-perceraian.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
