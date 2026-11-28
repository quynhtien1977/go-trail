import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";

test("I03 recipient migration preserves legacy ledger rows, RLS and append-only protection", async () => {
  const database = await createTestDatabase({ beforeMigration: "20261124000100_supply_recipient" });
  try {
    const { sql } = database;
    // This database deliberately has the historical schema; today's generated Prisma Client can expect later columns.
    const user = (await sql.query(`INSERT INTO users (email, password_hash, full_name, phone, role)
      VALUES ('migration@i03.example.test', 'fixture', 'HR fixture', '0901234567', 'HRMgr') RETURNING user_id`)).rows[0];
    const item = (await sql.query(`INSERT INTO supply_items (name, category, unit)
      VALUES ('Legacy item', 'Drink', 'bottle') RETURNING item_id`)).rows[0];
    const inserted = await sql.query(`INSERT INTO supply_transactions
      (item_id, txn_type, quantity, created_by_user_id, idempotency_key, note)
      VALUES ($1, 'Receive', 3, $2, 'i03-legacy-receipt', 'Legacy receipt') RETURNING txn_id`, [item.item_id, user.user_id]);
    const id = inserted.rows[0].txn_id;
    const permissions = () => sql.query(`SELECT relrowsecurity, relacl::text AS grants
      FROM pg_class WHERE oid = 'public.supply_transactions'::regclass`);
    const before = (await permissions()).rows[0];
    assert.equal(before.relrowsecurity, true);

    await sql.exec(await readFile(new URL("../prisma/migrations/20261124000100_supply_recipient/migration.sql", import.meta.url), "utf8"));

    const ledgerRow = async () => (await sql.query(`SELECT item_id, created_by_user_id, quantity, note, recipient_staff_id
      FROM supply_transactions WHERE txn_id = $1`, [id])).rows[0];
    const row = await ledgerRow();
    assert.equal(row.recipient_staff_id, null);
    assert.equal(row.item_id, item.item_id);
    assert.equal(row.created_by_user_id, user.user_id);
    assert.equal(row.quantity, 3);
    assert.equal(row.note, "Legacy receipt");
    assert.deepEqual((await permissions()).rows[0], before);
    await assert.rejects(sql.query("UPDATE supply_transactions SET quantity = 4 WHERE txn_id = $1", [id]), { code: "23001" });
    assert.equal((await ledgerRow()).quantity, 3);
  } finally {
    await database.close();
  }
});
