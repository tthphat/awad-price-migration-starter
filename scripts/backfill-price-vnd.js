import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.DB_PATH ?? './data/app.db');
db.exec('PRAGMA busy_timeout = 5000');

const BATCH = 500;
let total = 0, n;

do {
  // Get IDs to update
  const ids = db.prepare('SELECT id FROM menu_items WHERE price_vnd IS NULL LIMIT ?').all(BATCH).map(r => r.id);
  if (ids.length === 0) break;

  n = 0;
  for (const id of ids) {
    const price = db.prepare('SELECT price FROM menu_items WHERE id = ?').get(id);
    if (price) {
      const priceVnd = Math.round(price.price * 1000);
      db.prepare('UPDATE menu_items SET price_vnd = ? WHERE id = ?').run(priceVnd, id);
      n++;
    }
  }
  total += n;
  if (n > 0) console.log(`backfilled ${n} rows...`);
} while (n === BATCH);

console.log(`backfilled ${total} rows total`);
db.close();
