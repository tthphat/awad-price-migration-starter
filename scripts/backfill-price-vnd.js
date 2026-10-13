import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? join(__dirname, '..', 'data', 'app.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000');

const BATCH = 500;
const stmt = db.prepare(`
  UPDATE menu_items SET price_vnd = CAST(ROUND(price * 1000) AS INTEGER)
  WHERE id IN (SELECT id FROM menu_items WHERE price_vnd IS NULL LIMIT ?)`);

let total = 0, n;
do {
  db.exec('BEGIN');
  n = stmt.run(BATCH).changes;
  db.exec('COMMIT');
  total += n;
  if (n > 0) {
    process.stdout.write(`\rbackfilled ${total} rows...`);
    await new Promise(r => setTimeout(r, 20));
  }
} while (n > 0);

console.log(`\nbackfilled ${total} rows`);
