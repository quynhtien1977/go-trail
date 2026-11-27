import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";

test("Q02 threshold migration preserves legacy inventory, ledger protection and nullable defaults", async () => {
  const database = await createTestDatabase({ beforeMigration: "20261124000200_supply_threshold" });
  try {
    const { sql } = database;
    const user = (await sql.query(`INSERT INTO users (email, password_hash, full_name, phone, role)
      VALUES ('migration@q02.example.test', 'fixture', 'HR fixture', '0901234567', 'HRMgr') RETURNING user_id`)).rows[0];
    const item = (await sql.query(`INSERT INTO supply_items (name, category, unit)
      VALUES ('Legacy threshold item', 'Drink', 'bottle') RETURNING item_id`)).rows[0];
    const ledger = (await sql.query(`INSERT INTO supply_transactions
      (item_id, txn_type, quantity, created_by_user_id, idempotency_key, note)
      VALUES ($1, 'Receive', 3, $2, 'q02-legacy-receipt', 'Legacy receipt') RETURNING txn_id`, [item.item_id, user.user_id])).rows[0];
    const readLedger = async () => (await sql.query(`SELECT item_id, txn_type, quantity, created_by_user_id, note, recipient_staff_id
      FROM supply_transactions WHERE txn_id = $1`, [ledger.txn_id])).rows[0];
    const permissions = async () => (await sql.query(`SELECT relname, relrowsecurity, relacl::text AS grants FROM pg_class
      WHERE oid IN ('public.supply_items'::regclass, 'public.supply_transactions'::regclass) ORDER BY relname`)).rows;
    const beforeLedger = await readLedger(), beforePermissions = await permissions();
    assert.ok(beforePermissions.every(row => row.relrowsecurity));

    await sql.exec(await readFile(new URL("../prisma/migrations/20261124000200_supply_threshold/migration.sql", import.meta.url), "utf8"));

    const after = (await sql.query("SELECT name, category, unit, is_active, low_stock_threshold FROM supply_items WHERE item_id = $1", [item.item_id])).rows[0];
    assert.deepEqual(after, { name: "Legacy threshold item", category: "Drink", unit: "bottle", is_active: true, low_stock_threshold: null });
    assert.deepEqual(await readLedger(), beforeLedger);
    assert.deepEqual(await permissions(), beforePermissions);
    await sql.query("UPDATE supply_items SET low_stock_threshold = 0 WHERE item_id = $1", [item.item_id]);
    await sql.query("UPDATE supply_items SET low_stock_threshold = 7 WHERE item_id = $1", [item.item_id]);
    await assert.rejects(sql.query("UPDATE supply_items SET low_stock_threshold = -1 WHERE item_id = $1", [item.item_id]), { code: "23514" });
    assert.equal((await sql.query("SELECT low_stock_threshold FROM supply_items WHERE item_id = $1", [item.item_id])).rows[0].low_stock_threshold, 7);
    await assert.rejects(sql.query("UPDATE supply_transactions SET quantity = 4 WHERE txn_id = $1", [ledger.txn_id]), { code: "23001" });
    assert.deepEqual(await readLedger(), beforeLedger);
  } finally {
    await database.close();
  }
});
