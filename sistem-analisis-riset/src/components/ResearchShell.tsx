import { Nav } from "./Nav";

export function ResearchShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Nav />
      {children}
      <p className="footer-note">
        Data identitas disamarkan secara bawaan. Fetch SIPP hanya dari halaman publik
        (sipp.pa-sambas.go.id) dengan rate limiting. Jangan mengunggah data sensitif ke
        repositori publik.
      </p>
    </div>
  );
}
