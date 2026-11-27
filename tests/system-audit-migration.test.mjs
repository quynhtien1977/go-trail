import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";

const migration = "20261127000000_system_audit_actor";

test("Q03 audit migration retains human history and allows only scoped system events", async () => {
  const database = await createTestDatabase({ beforeMigration: migration });
  try {
    const { sql } = database;
    const user = (await sql.query(`INSERT INTO users (email, password_hash, full_name, phone, role)
      VALUES ('audit-migration@example.test', 'fixture', 'Auditor', '0901234567', 'Admin') RETURNING user_id`)).rows[0];
    const old = (await sql.query(`INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
      VALUES ($1, 'DepartureStatusChanged', 'departures', '17', 'legacy') RETURNING log_id`, [user.user_id])).rows[0];
    const snapshot = async () => (await sql.query("SELECT user_id, action, table_name, record_id, description FROM audit_logs WHERE log_id = $1", [old.log_id])).rows[0];
    const permissions = async () => (await sql.query(`SELECT relrowsecurity, relacl::text AS grants FROM pg_class WHERE oid = 'public.audit_logs'::regclass`)).rows[0];
    const before = await snapshot(), beforePermissions = await permissions();
    assert.equal(beforePermissions.relrowsecurity, true);

    await sql.exec(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));

    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await permissions(), beforePermissions);
    const system = (await sql.query(`INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
      VALUES (NULL, 'DepartureStatusChanged', 'departures', '18', '{"source":"cron"}') RETURNING user_id`)).rows[0];
    assert.equal(system.user_id, null);
    await assert.rejects(sql.query(`INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
      VALUES (NULL, 'RoleChanged', 'users', '1', '{}')`), { code: "23514" });
    await assert.rejects(sql.query(`INSERT INTO audit_logs (user_id, action, table_name, record_id, description)
      VALUES (2147483647, 'RoleChanged', 'users', '1', '{}')`), { code: "23503" });
  } finally { await database.close(); }
});
