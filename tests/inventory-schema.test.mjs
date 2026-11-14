import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./helpers/test-database.mjs";

const root = new URL("../prisma/migrations/", import.meta.url);
const current = "20261114000000_inventory_ledger";
let database, sql, user, departure, item;
const key = (n) => `supply-test-key-${String(n).padStart(4, "0")}`;
const insert = (values) => sql.query(`INSERT INTO supply_transactions (item_id, txn_type, quantity, departure_id, created_by_user_id, idempotency_key, note)
  VALUES ($1, $2::"SupplyTransactionType", $3, $4, $5, $6, $7) RETURNING *`,
[values.item_id ?? item, values.txn_type, values.quantity ?? 1, values.departure_id ?? null, values.user_id ?? user, values.key, values.note ?? null]);

before(async () => { database = await createTestDatabase(); sql = database.sql; });
beforeEach(async () => {
  await sql.exec("TRUNCATE users, trips, supply_items RESTART IDENTITY CASCADE");
  user = (await sql.query("INSERT INTO users (email, password_hash, full_name, phone, role) VALUES ('hr@supply.example.test', 'unused', 'HR', '0900000000', 'HRMgr') RETURNING user_id")).rows[0].user_id;
  const trip = (await sql.query("INSERT INTO trips (name, city, location_name, length_km, base_price, description, schedule_content) VALUES ('Núi', 'Tây Ninh', 'Núi', 1, 0, 'Mô tả', 'Lịch') RETURNING trip_id")).rows[0].trip_id;
  departure = (await sql.query("INSERT INTO departures (trip_id, departure_date, booking_deadline, min_passengers) VALUES ($1, '2030-01-02', '2030-01-01', 1) RETURNING departure_id", [trip])).rows[0].departure_id;
  item = (await sql.query("INSERT INTO supply_items (name, category, unit) VALUES ('Nước suối', 'Drink', 'chai 500ml') RETURNING item_id")).rows[0].item_id;
});
after(async () => { await database?.close(); });

test("migration keeps existing data, enables RLS and revokes Supabase default grants on tables, sequences and the trigger function", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
    for (const name of (await readdir(root)).filter((n) => /^\d+_/.test(n) && n < current).sort()) {
      await db.exec(await readFile(new URL(`${name}/migration.sql`, root), "utf8"));
    }
    await db.exec("INSERT INTO users (email, password_hash, full_name, phone) VALUES ('existing@example.test', 'hash', 'Existing', '0900000000')");
    const before = (await db.query("SELECT * FROM users")).rows;
    await db.exec(await readFile(new URL(`${current}/migration.sql`, root), "utf8"));
    assert.deepEqual((await db.query("SELECT * FROM users")).rows, before);
    const rls = (await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('supply_items', 'supply_transactions') ORDER BY relname")).rows;
    assert.deepEqual(rls, [{ relname: "supply_items", relrowsecurity: true }, { relname: "supply_transactions", relrowsecurity: true }]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const [row] = (await db.query(`SELECT has_table_privilege($1, 'supply_items', 'SELECT') AS items,
        has_table_privilege($1, 'supply_transactions', 'INSERT') AS ledger,
        has_sequence_privilege($1, 'supply_transactions_txn_id_seq', 'USAGE') AS sequence,
        has_function_privilege($1, 'public.reject_supply_ledger_change()', 'EXECUTE') AS fn`, [role])).rows;
      assert.deepEqual(row, { items: false, ledger: false, sequence: false, fn: false }, role);
    }
  } finally { await db.close(); }
});

test("catalog items need a unique name, a category and an explicit counted unit", async () => {
  await assert.rejects(sql.query("INSERT INTO supply_items (name, category, unit) VALUES ('Nước suối', 'Drink', 'thùng 24 chai')"), { code: "23505" });
  await assert.rejects(sql.query("INSERT INTO supply_items (name, category, unit) VALUES ('  ', 'Food', 'gói')"), { code: "23514" });
  await assert.rejects(sql.query("INSERT INTO supply_items (name, category, unit) VALUES ('Bánh mì', 'Food', ' ')"), { code: "23514" });
  await assert.rejects(sql.query("INSERT INTO supply_items (name, category, unit) VALUES ('Bánh mì', 'Snack', 'ổ')"), { code: "22P02" });
  const row = (await sql.query("INSERT INTO supply_items (name, category, unit) VALUES ('Bánh mì', 'Food', 'ổ') RETURNING is_active")).rows[0];
  assert.equal(row.is_active, true);
});

test("ledger rows need a positive quantity, a well-formed unique idempotency key and a departure exactly for Issue/Return", async () => {
  for (const quantity of [0, -1]) await assert.rejects(insert({ txn_type: "Receive", quantity, key: key(1) }), { code: "23514" });
  for (const bad of ["short", "has space in the key!!", "x".repeat(65)]) await assert.rejects(insert({ txn_type: "Receive", key: bad }), { code: "23514" });
  await assert.rejects(insert({ txn_type: "Receive", departure_id: departure, key: key(2) }), { code: "23514" });
  await assert.rejects(insert({ txn_type: "Dispose", departure_id: departure, key: key(3) }), { code: "23514" });
  await assert.rejects(insert({ txn_type: "Issue", key: key(4) }), { code: "23514" });
  await assert.rejects(insert({ txn_type: "Return", key: key(5) }), { code: "23514" });
  await assert.rejects(insert({ txn_type: "Receive", note: "   ", key: key(6) }), { code: "23514" });
  await assert.rejects(insert({ txn_type: "Receive", user_id: 999, key: key(7) }), { code: "23503" });
  await assert.rejects(insert({ txn_type: "Issue", departure_id: 999, key: key(8) }), { code: "23503" });

  await insert({ txn_type: "Receive", quantity: 100, key: key(10) });
  await assert.rejects(insert({ txn_type: "Receive", quantity: 100, key: key(10) }), { code: "23505" });
  await insert({ txn_type: "Issue", quantity: 30, departure_id: departure, key: key(11) });
  await insert({ txn_type: "Return", quantity: 5, departure_id: departure, key: key(12), note: "Dư sau chuyến" });
  await insert({ txn_type: "Dispose", quantity: 2, key: key(13), note: "Hết hạn" });
  // Stock is derived from the ledger: Receive + Return - Issue - Dispose.
  const { rows: [stock] } = await sql.query(`SELECT SUM(CASE WHEN txn_type IN ('Receive', 'Return') THEN quantity ELSE -quantity END)::int AS on_hand
    FROM supply_transactions WHERE item_id = $1`, [item]);
  assert.equal(stock.on_hand, 73);
});

test("the ledger is append-only and pins its item, departure and operator", async () => {
  const [row] = (await insert({ txn_type: "Issue", quantity: 3, departure_id: departure, key: key(20) })).rows;
  await assert.rejects(sql.query("UPDATE supply_transactions SET quantity = 1 WHERE txn_id = $1", [row.txn_id]), { code: "23001" });
  await assert.rejects(sql.query("DELETE FROM supply_transactions WHERE txn_id = $1", [row.txn_id]), { code: "23001" });
  assert.deepEqual((await sql.query("SELECT * FROM supply_transactions")).rows, [row]);
  await assert.rejects(sql.query("DELETE FROM supply_items WHERE item_id = $1", [item]), { code: "23001" });
  await assert.rejects(sql.query("DELETE FROM departures WHERE departure_id = $1", [departure]), { code: "23001" });
  await assert.rejects(sql.query("DELETE FROM users WHERE user_id = $1", [user]), { code: "23001" });
  // Items are retired, not deleted.
  await sql.query("UPDATE supply_items SET is_active = false WHERE item_id = $1", [item]);
  assert.equal(await database.client.supplyTransaction.count({ where: { item: { is_active: false } } }), 1);
});
