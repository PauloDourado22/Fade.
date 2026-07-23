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

// Lightweight, idempotent column migrations. schema.sql uses
// CREATE TABLE IF NOT EXISTS, which silently does nothing to a table that
// already exists - so a *new column* on an existing appointments table
// needs an explicit ALTER. ADD COLUMN is non-destructive in SQLite (it
// can't drop or rewrite existing rows), and guarding on PRAGMA table_info
// makes re-running on boot a no-op. Add future additive columns here the
// same way rather than editing existing rows in schema.sql.
function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

if (!columnExists('appointments', 'is_block')) {
  // Marks an appointment row that is really a staff time-block (lunch, a
  // sick barber, equipment down) rather than a customer booking. Blocks
  // still occupy the chair - they're stored with status 'confirmed' so
  // every existing "is this slot busy" check treats them as taken - but
  // this flag lets counts/revenue exclude them (a block earns $0 and
  // isn't a customer).
  db.exec('ALTER TABLE appointments ADD COLUMN is_block INTEGER NOT NULL DEFAULT 0');
}
