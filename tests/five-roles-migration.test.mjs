import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { UserRole } from "../src/generated/prisma/enums.ts";
import { userRoles, accountAccessSchema } from "../src/schemas/auth.ts";
import { canLoginAtGate } from "../src/lib/auth-portal.ts";
import { requireActor, canAccessRouteGroup } from "../src/server/auth/authorization.ts";
import { createTestDatabase } from "./helpers/test-database.mjs";

const migration = "20261021000000_five_roles";
const roles = ["Customer", "Leader", "RouteMgr", "HRMgr", "Admin"];
const apply = async (database) => database.sql.exec(await readFile(
  new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));
const enumRoles = async (database) => (await database.sql.query(
  `SELECT unnest(enum_range(NULL::"UserRole"))::text AS role`)).rows.map((row) => row.role);

async function legacyFixtures(database) {
  await database.sql.exec(`
    INSERT INTO users(user_id,email,password_hash,full_name,phone,role,status,auth_version) VALUES
      (1,'legacy-active@example.test','fixture-hash','Legacy Active','0900000001','Accountant','Active',4),
      (2,'legacy-locked@example.test','fixture-hash','Legacy Locked','0900000002','Accountant','Locked',11),
      (3,'admin@example.test','fixture-hash','Admin','0900000003','Admin','Active',2),
      (4,'customer@example.test','fixture-hash','Customer','0900000004','Customer','Active',3),
      (5,'leader@example.test','fixture-hash','Leader','0900000005','Leader','Active',0),
      (6,'routes@example.test','fixture-hash','RouteMgr','0900000006','RouteMgr','Active',0),
      (7,'hr@example.test','fixture-hash','HRMgr','0900000007','HRMgr','Active',0);
    SELECT setval('users_user_id_seq',7);
    INSERT INTO staff(user_id,full_name,phone,staff_type) VALUES(5,'Leader','0900000005','Leader');
    INSERT INTO trips(name,city,location_name,length_km,base_price,description,schedule_content)
      VALUES('Legacy trail','Test','Test',5,500000,'Fixture','Fixture');
    INSERT INTO departures(trip_id,departure_date,booking_deadline,min_passengers)
      VALUES(1,'2030-01-01','2029-12-31',1);
    INSERT INTO invoices(customer_id,departure_id,payment_code,total_amount,status,expires_at)
      VALUES(1,1,'LEGACY-PAID',500000,'Paid','2029-12-31');
    INSERT INTO payments(invoice_id,amount,transaction_id,reference_code,status,raw_payload)
      VALUES(1,500000,'legacy-payment','LEGACY-PAID','Success','{}');
    INSERT INTO refunds(invoice_id,payment_id,amount,refund_type,status,reason,idempotency_key,requested_by,approved_by)
      VALUES(1,1,500000,'CustomerCancel','Completed','Historical fixture','legacy-refund',1,2);
    INSERT INTO audit_logs(user_id,action,table_name,record_id,description)
      VALUES(2,'RoleChanged','users','1','{"action":"RoleChanged","record_id":1,"from":"Customer","to":"Accountant"}');
  `);
}

test("shared role contracts allow exactly five roles and reject retired Accountant entry points", () => {
  assert.deepEqual(Object.values(UserRole), roles);
  assert.deepEqual([...userRoles], roles);
  assert.equal(accountAccessSchema.safeParse({ role: "Accountant" }).success, false);
  assert.equal(canLoginAtGate("Accountant", "customer"), false);
  assert.equal(canLoginAtGate("Accountant", "staff"), false);
  for (const route of ["/staff", "/admin", "/leader", "/account"]) {
    assert.equal(canAccessRouteGroup("Accountant", route), false);
  }
});

test("five-role upgrade locks and revokes legacy accountants, audits actual changes and preserves history", async () => {
  const database = await createTestDatabase({ beforeMigration: migration });
  try {
    await legacyFixtures(database);
    const beforeUsers = (await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows;
    const preserved = {};
    for (const table of ["staff", "invoices", "payments", "refunds", "audit_logs"]) {
      preserved[table] = (await database.sql.query(`SELECT * FROM ${table}`)).rows;
    }
    await apply(database);
    const afterUsers = (await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows;
    assert.deepEqual(afterUsers.slice(2), beforeUsers.slice(2));
    for (let index = 0; index < 2; index++) {
      assert.deepEqual(afterUsers[index], { ...beforeUsers[index], role: "Customer", status: "Locked",
        auth_version: beforeUsers[index].auth_version + 1 });
    }
    for (const table of ["staff", "invoices", "payments", "refunds"]) {
      assert.deepEqual((await database.sql.query(`SELECT * FROM ${table}`)).rows, preserved[table]);
    }
    const logs = (await database.sql.query("SELECT * FROM audit_logs ORDER BY log_id")).rows;
    assert.deepEqual(logs[0], preserved.audit_logs[0]);
    const added = logs.slice(1).map((row) => ({ ...row, event: JSON.parse(row.description) }));
    assert.equal(added.length, 3, "Two role changes and only the Active to Locked status change");
    for (const userId of [1, 2]) {
      const row = added.find((log) => log.record_id === String(userId) && log.action === "RoleChanged");
      assert.ok(row);
      assert.equal(row.user_id, userId);
      assert.equal(row.table_name, "users");
      assert.deepEqual(row.event, { action: "RoleChanged", record_id: userId, from: "Accountant", to: "Customer",
        source: "SystemMigration", migration });
    }
    const status = added.find((log) => log.action === "AccountStatusChanged");
    assert.equal(status.record_id, "1");
    assert.equal(status.event.from, "Active");
    assert.equal(status.event.to, "Locked");
    assert.ok(added.every((log) => !log.description.includes("@") && !log.description.includes("fixture-hash")));
    assert.deepEqual(await enumRoles(database), roles);
    await assert.rejects(database.sql.exec("UPDATE users SET role='Accountant' WHERE user_id=1"), { code: "22P02" });
    await database.sql.exec(`INSERT INTO users(email,password_hash,full_name,phone)
      VALUES('default-role@example.test','fixture-hash','Default','0900000008')`);
    assert.equal((await database.sql.query("SELECT role FROM users WHERE email='default-role@example.test'")).rows[0].role, "Customer");
    // Even a validly signed old identity cannot survive cutover or a later unlock.
    const oldIdentity = { user_id: 1, role: "Accountant", auth_version: 4 };
    await assert.rejects(requireActor(database.client, oldIdentity), { code: "UNAUTHENTICATED" });
    await database.sql.exec("UPDATE users SET status='Active' WHERE user_id=1");
    await assert.rejects(requireActor(database.client, oldIdentity), { code: "UNAUTHENTICATED" });
    assert.equal((await requireActor(database.client, { ...oldIdentity, auth_version: 5 })).role, "Customer");
  } finally { await database.close(); }
});

test("migration failure rolls back role, status, version, audit rows and enum replacement together", async () => {
  const database = await createTestDatabase({ beforeMigration: migration });
  try {
    await legacyFixtures(database);
    const before = (await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows;
    await database.sql.exec(`CREATE FUNCTION reject_migration_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='AccountStatusChanged' THEN RAISE EXCEPTION 'isolated audit failure'; END IF;
      RETURN NEW; END $$;
      CREATE TRIGGER reject_migration_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_migration_audit();`);
    await assert.rejects(apply(database), /isolated audit failure/);
    await database.sql.exec("ROLLBACK");
    assert.deepEqual((await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows, before);
    assert.equal((await database.sql.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0].count, 1);
    assert.ok((await enumRoles(database)).includes("Accountant"));
    await database.sql.exec("DROP TRIGGER reject_migration_audit ON audit_logs; DROP FUNCTION reject_migration_audit()");
    await apply(database);
    assert.deepEqual(await enumRoles(database), roles, "Can retry the rolled-back migration without duplicate audit/data");
    assert.equal((await database.sql.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0].count, 4);
  } finally { await database.close(); }
});

test("fresh databases have five roles, preserve Data API isolation and need no legacy audit actor", async () => {
  const database = await createTestDatabase({ beforeMigration: migration });
  try {
    await database.sql.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
    await apply(database);
    assert.deepEqual(await enumRoles(database), roles);
    assert.equal((await database.sql.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0].count, 0);
    assert.equal((await database.sql.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass")).rows[0].relrowsecurity, true);
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await database.sql.query(`SELECT has_table_privilege($1,'users','SELECT') AS can_read,
        has_table_privilege($1,'users','INSERT') AS can_write`, [role]);
      assert.equal(rows[0].can_read, false);
      assert.equal(rows[0].can_write, false);
    }
  } finally { await database.close(); }
});

test("a dependency blocking the enum swap rolls back the completed backfill and audits", async () => {
  const database = await createTestDatabase({ beforeMigration: migration });
  try {
    await legacyFixtures(database);
    const before = (await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows;
    await database.sql.exec(`CREATE FUNCTION existing_role_formatter(value public."UserRole")
      RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT value::text';`);
    await assert.rejects(apply(database), { code: "2BP01" });
    await database.sql.exec("ROLLBACK");
    assert.deepEqual((await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows, before);
    assert.equal((await database.sql.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0].count, 1);
    assert.ok((await enumRoles(database)).includes("Accountant"));
    assert.equal((await database.sql.query(`SELECT existing_role_formatter('Accountant') AS role`)).rows[0].role, "Accountant");
  } finally { await database.close(); }
});

test("schema compatibility rollback restores the old enum without restoring retired privileges or sessions", async () => {
  const database = await createTestDatabase({ beforeMigration: migration });
  try {
    await legacyFixtures(database);
    await apply(database);
    const before = (await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows;
    const logs = (await database.sql.query("SELECT * FROM audit_logs ORDER BY log_id")).rows;
    await database.sql.exec(await readFile(new URL(`../prisma/rollbacks/${migration}.sql`, import.meta.url), "utf8"));
    assert.deepEqual(await enumRoles(database), ["Customer", "Leader", "RouteMgr", "HRMgr", "Accountant", "Admin"]);
    assert.deepEqual((await database.sql.query("SELECT * FROM users ORDER BY user_id")).rows, before);
    assert.deepEqual((await database.sql.query("SELECT * FROM audit_logs ORDER BY log_id")).rows, logs);
  } finally { await database.close(); }
});
