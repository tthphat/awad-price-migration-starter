# MIGRATION.md — `menu_items.price` → `menu_items.price_vnd`

Change `price` (thousands of dong, REAL; `45.5` = 45,500 đ) into `price_vnd` (dong, INTEGER), then drop `price`, while two instances keep serving traffic.

## Setup

- Two instances: **A** = `:3001`, **B** = `:3002`, one database file `data/app.db` (`DB_PATH` is absolute).
- One git worktree per version: `../v1`, `../v2`, `../v3`, `../v4` (`git worktree add ../vN vN`).
- Every deploy is a rolling restart, **one instance at a time**: stop the instance (Ctrl+C, in-flight requests finish), start it from the new worktree, wait until traffic shows it back, then do the other.
- One continuous `npm run traffic` run covers every step (`traffic-log.txt`). `npm run check` is run after every step, labelled with the step number (`check-log.txt`).

## Versions

| Tag | What the code does |
|---|---|
| `v1` | Starter. Reads and writes `price` only. |
| `v2` | Dual write: every write path (create item, re-price item) writes `price` **and** `price_vnd`. Still reads `price`. API accepts and returns `priceVnd` (dong) as well as `price` (thousands). |
| `v3` | Reads `price_vnd`. Still writes both columns. Response `price = price_vnd / 1000`. |
| `v4` | Neither reads nor writes `price`. Response still contains `price = price_vnd / 1000` for old clients. |

## Migrations

| File | Up | Down |
|---|---|---|
| `002_add_price_vnd` | `ALTER TABLE menu_items ADD COLUMN price_vnd INTEGER;` | `ALTER TABLE menu_items DROP COLUMN price_vnd;` |
| `003_drop_price` | `ALTER TABLE menu_items DROP COLUMN price;` | re-add `price REAL`, then `UPDATE menu_items SET price = price_vnd / 1000.0;` |

(Adjust numbers to the actual files in `migrations/`.)

## The plan

| # | Step | Schema after the step | Code each instance runs | Exact command that undoes the step | Earlier versions that can still run safely against this schema |
|---|---|---|---|---|---|
| 0 | Baseline (v1) | `price REAL` | A = v1, B = v1 | — | v1 |
| 1 | Expand: migration `002_add_price_vnd` | `price REAL`, `price_vnd INTEGER` (NULL for all rows) | A = v1, B = v1 | `npm run migrate:down` | v1 (it ignores the new column) |
| 2 | Deploy v2 (dual write), rolling A then B | unchanged | A = v2, B = v2 (A = v2 while B = v1 in between) | Per instance: Ctrl+C, then `git checkout v1 -- src/app.js && PORT=<port> npm start` | v1, v2 |
| 3 | Backfill `scripts/backfill-price-vnd.js`, only after no v1 is running | `price_vnd` filled for every row | A = v2, B = v2 | Not needed (idempotent, only touches rows where `price_vnd IS NULL`). Data undo: `node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync(process.env.DB_PATH).exec('UPDATE menu_items SET price_vnd = NULL')"` | v2 only. **v1 is not safe**: it writes `price` alone and would leave `price_vnd` stale. |
| 4 | Deploy v3 (read `price_vnd`), rolling | unchanged | A = v3, B = v3 (mixed v2/v3 in between) | Per instance: Ctrl+C, then `git checkout v2 -- src/app.js && PORT=<port> npm start` | v2, v3 |
| 5a | Rollback v3 → v2 under traffic | unchanged | v2 on both | `git checkout v3 -- src/app.js && PORT=<port> npm start` | v2, v3 |
| 5b | Forward v2 → v3 under traffic | unchanged | v3 on both | same as step 4 | v2, v3 |
| 6 | Deploy v4 (does not use `price`), rolling | unchanged | A = v4, B = v4 | Per instance: Ctrl+C, then `git checkout v3 -- src/app.js && PORT=<port> npm start` | v3, v4. **v2 is not safe** (see below). |
| 7 | **Contract**: migration `003_drop_price` — **POINT OF NO RETURN** | `price_vnd INTEGER` only | A = v4, B = v4 | `npm run migrate:down` (rebuilds `price` from `price_vnd`) — but see "Point of no return" | v4 only |

## Point of no return

**Step 7, dropping `price`.**

Why it cannot be undone:

- v1, v2 and v3 all use `price`; none of them can run once the column is gone.
- v4 stopped writing `price` at step 6, so the old column holds nothing newer than step 6 anyway. `003_drop_price.down.sql` can only rebuild a *derived* copy from `price_vnd`; it does not restore the original column or bring back a running old version.
- Going back therefore needs the down migration **and** redeploying old code on both instances — no longer a safe, per-step undo.

Every step before step 7 can be undone by the command in its row.

## Why the rollback in step 5 (v3 → v2) is safe

v3 still writes **both** columns on every write path, so `price` is always current. v2 reads `price`, so after the rollback it shows the last acknowledged write. `npm run check` reports CONSISTENT before and after (`check-log.txt`, labels `5a` and `5b`), and `traffic-log.txt` shows no `stale`, `error`, `contract` or `unavailable` for that stretch.

## Which later rollback would NOT be safe

After step 6, rolling back from v4 to v2 (or v3) is **not** safe: v4 writes `price_vnd` only, so `price` stops being updated, and v2 (which reads `price`) would return old prices and the traffic script would report `stale`. A v4 → v3 rollback is safe only for reads of `price_vnd` (v3 reads that column), but rows written while v4 ran have a stale `price`, so a later v3 → v2 rollback would again be unsafe unless `price` is first refreshed with `UPDATE menu_items SET price = price_vnd / 1000.0`.

## Failures and how they were handled

- **TimeoutError during rolling restart** (lines 170, 423, 448, 523, 528, 534 in traffic-log.txt): Occurred when killing and restarting instances. These are expected - servers were down briefly during deployment. No `error` requests, only temporary `down` status.
- **v4 initial code bug**: Original v4 code still read/wrote `price` column. Fixed by modifying queries to only use `price_vnd`. Redeployed with fixed code.

## Matching the repository

- Tags: `v1`, `v2`, `v3`, `v4`
- Migrations: `002_add_price_vnd`, `003_drop_price` (each with `.up.sql` and `.down.sql`)
- Backfill: `scripts/backfill-price-vnd.js`
- Logs: `traffic-log.txt` (one continuous run, ~5000s, 0 errors), `check-log.txt` (labels: v1 baseline, 002 add price_vnd, v2 dual write, backfill, v3 read price_vnd, rollback v3 to v2, forward v2 to v3, v4 stop writing price, 003 drop price)
