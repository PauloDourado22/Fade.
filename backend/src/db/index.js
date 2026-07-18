import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure the data directory exists before better-sqlite3 tries to create the
// file — a fresh clone won't have a `data/` folder yet.
const dataDir = path.dirname(config.databasePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(config.databasePath);

// WAL mode: readers (the availability calculation) don't block writers
// (a booking being confirmed) and vice versa. Matters once this handles more
// than a couple of concurrent requests.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);
