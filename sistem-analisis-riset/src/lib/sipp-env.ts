/** Shared SIPP env helpers (WA-gateway style). */

export function truthyEnv(raw: string | undefined): boolean {
  const v = (raw || "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "y" || v === "on";
}

export function firstEnv(...keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
