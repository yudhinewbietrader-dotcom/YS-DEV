import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, ".."));

// Load env.local manually for script
import fs from "node:fs";
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const Database = require("better-sqlite3");
const dbPath = process.env.DATABASE_PATH || "./data/research.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.exec(`DELETE FROM meta WHERE key IN ('seeded','demo_interview_token')`);
console.log("Flag seed direset. Jalankan aplikasi (npm run dev) agar seed otomatis dijalankan ulang.");
db.close();
