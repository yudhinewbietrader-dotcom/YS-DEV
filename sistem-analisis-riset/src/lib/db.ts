import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const globalForDb = globalThis as unknown as { __researchDb?: Database.Database };

function resolveDbPath() {
  const configured = process.env.DATABASE_PATH || "";
  if (configured && path.isAbsolute(configured)) return configured;
  // Path dibatasi ke subfolder data/ agar bundler tidak men-trace seluruh proyek
  const fileName = configured
    ? path.basename(configured)
    : "research.db";
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", fileName);
}

export function getDb(): Database.Database {
  if (globalForDb.__researchDb) return globalForDb.__researchDb;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  globalForDb.__researchDb = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_berkas TEXT NOT NULL UNIQUE,
      nomor_perkara TEXT,
      nomor_perkara_masked INTEGER NOT NULL DEFAULT 1,
      jenis_perkara TEXT,
      tanggal_register TEXT,
      status_perkara TEXT,
      para_pihak_masked TEXT,
      sipp_detail_url TEXT,
      sumber TEXT NOT NULL DEFAULT 'manual',
      tahun INTEGER,
      status_pekerjaan TEXT,
      kehadiran TEXT,
      bukti_pendapatan TEXT,
      objek_nafkah_json TEXT NOT NULL DEFAULT '[]',
      modus_asimetri_json TEXT NOT NULL DEFAULT '[]',
      respons_hakim_json TEXT NOT NULL DEFAULT '[]',
      indikasi_asimetri TEXT,
      pertimbangan_hakim TEXT,
      nominal_ringkas TEXT,
      maqasid_json TEXT NOT NULL DEFAULT '{}',
      evaluasi_notes TEXT,
      evidence_quotes TEXT,
      catatan_peneliti TEXT,
      coding_status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS informants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT NOT NULL UNIQUE,
      peran TEXT NOT NULL,
      instrumen TEXT NOT NULL,
      pseudonym TEXT NOT NULL,
      jabatan_ringkas TEXT,
      status_wawancara TEXT NOT NULL DEFAULT 'belum',
      jadwal TEXT,
      checklist_json TEXT NOT NULL DEFAULT '[]',
      catatan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      informant_id INTEGER NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (informant_id) REFERENCES informants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS interview_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      informant_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      consent INTEGER NOT NULL DEFAULT 0,
      answers_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'submitted',
      locked INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (informant_id) REFERENCES informants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sipp_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Kolom tambahan untuk sinkron SIPP lokal (idempotent)
  const extraCols: Array<[string, string]> = [
    ["sipp_perkara_id", "INTEGER"],
    ["tanggal_putusan", "TEXT"],
    ["tanggal_minutasi", "TEXT"],
    ["tanggal_bht", "TEXT"],
    ["tahapan_text", "TEXT"],
    ["proses_text", "TEXT"],
    ["putusan_verstek", "TEXT"],
    ["status_putusan", "TEXT"],
    ["amar_excerpt", "TEXT"],
    ["nomor_akta_cerai", "TEXT"],
    ["tgl_akta_cerai", "TEXT"],
    ["sipp_local_json", "TEXT"],
  ];
  const existing = new Set(
    (
      db.prepare("PRAGMA table_info(cases)").all() as Array<{ name: string }>
    ).map((c) => c.name),
  );
  for (const [name, type] of extraCols) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE cases ADD COLUMN ${name} ${type}`);
    }
  }
}

export type CaseRow = {
  id: number;
  kode_berkas: string;
  nomor_perkara: string | null;
  nomor_perkara_masked: number;
  jenis_perkara: string | null;
  tanggal_register: string | null;
  status_perkara: string | null;
  para_pihak_masked: string | null;
  sipp_detail_url: string | null;
  sumber: string;
  tahun: number | null;
  status_pekerjaan: string | null;
  kehadiran: string | null;
  bukti_pendapatan: string | null;
  objek_nafkah_json: string;
  modus_asimetri_json: string;
  respons_hakim_json: string;
  indikasi_asimetri: string | null;
  pertimbangan_hakim: string | null;
  nominal_ringkas: string | null;
  maqasid_json: string;
  evaluasi_notes: string | null;
  evidence_quotes: string | null;
  catatan_peneliti: string | null;
  coding_status: string;
  created_at: string;
  updated_at: string;
  sipp_perkara_id?: number | null;
  tanggal_putusan?: string | null;
  tanggal_minutasi?: string | null;
  tanggal_bht?: string | null;
  tahapan_text?: string | null;
  proses_text?: string | null;
  putusan_verstek?: string | null;
  status_putusan?: string | null;
  amar_excerpt?: string | null;
  nomor_akta_cerai?: string | null;
  tgl_akta_cerai?: string | null;
  sipp_local_json?: string | null;
};

export type InformantRow = {
  id: number;
  kode: string;
  peran: string;
  instrumen: string;
  pseudonym: string;
  jabatan_ringkas: string | null;
  status_wawancara: string;
  jadwal: string | null;
  checklist_json: string;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
