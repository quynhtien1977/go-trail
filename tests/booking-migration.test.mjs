import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrations = new URL("../prisma/migrations/", import.meta.url);
const target = "20261019000000_invoice_hold_snapshot";
const fixture = `INSERT INTO users(user_id,email,password_hash,full_name,phone,role) VALUES
  (1,'buyer@migration.example.test','unused','Buyer','0901234567','Customer'),
  (2,'owner@migration.example.test','unused','Owner','0901234567','RouteMgr');
  INSERT INTO trips(trip_id,name,city,location_name,length_km,base_price,description,schedule_content)
    VALUES(1,'Legacy','Test','Test',5,500000,'Fixture','Fixture');
  INSERT INTO departures(departure_id,trip_id,departure_date,booking_deadline,min_passengers,status)
    VALUES(1,1,'2035-01-02','2035-01-01',1,'Open');
  INSERT INTO invoices(invoice_id,customer_id,departure_id,payment_code,total_amount,expires_at)
    VALUES(1,1,1,'LEGACY-UNASSIGNED',500000,'2035-01-01');`;

for (const mode of ["fresh chronological", "upgrade after A02"]) {
  test(`K02 snapshot migration supports ${mode}, preserves legacy data and keeps Data API isolation`, async () => {
    const sql = await PGlite.create();
    try {
      await sql.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
      const names = (await readdir(migrations)).filter(n => /^\d+_/.test(n)).sort();
      let before;
      for (const name of names) {
        if (name === target) {
          if (mode === "upgrade after A02") continue;
          await sql.exec(fixture);
          before = (await sql.query("SELECT * FROM invoices WHERE invoice_id = 1")).rows[0];
        }
        await sql.exec(await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"));
      }
      if (mode === "upgrade after A02") {
        await sql.exec(fixture);
        before = (await sql.query("SELECT * FROM invoices WHERE invoice_id = 1")).rows[0];
        await sql.exec(await readFile(new URL(`${target}/migration.sql`, migrations), "utf8"));
      }
      const { responsible_user_id, responsible_name_snapshot, responsible_role_snapshot, idempotency_key, ...after } =
        (await sql.query("SELECT * FROM invoices WHERE invoice_id = 1")).rows[0];
      assert.deepEqual(after, before);
      assert.deepEqual([responsible_user_id, responsible_name_snapshot, responsible_role_snapshot, idempotency_key], [null, null, null, null]);
      assert.equal((await sql.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'responsible_role_snapshot'")).rows[0].data_type, "text");
      assert.equal((await sql.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'invoices'::regclass")).rows[0].relrowsecurity, true);
      for (const role of ["anon", "authenticated", "service_role"]) {
        assert.equal((await sql.query("SELECT has_table_privilege($1,'invoices','SELECT,INSERT,UPDATE,DELETE') AS allowed", [role])).rows[0].allowed, false);
      }
      await assert.rejects(sql.exec("UPDATE invoices SET responsible_user_id = 2 WHERE invoice_id = 1"), { code: "23514" });
      await assert.rejects(sql.exec("UPDATE invoices SET idempotency_key = 'migration-key-0001' WHERE invoice_id = 1"), { code: "23514" });
      await sql.exec("UPDATE invoices SET responsible_user_id=2,responsible_name_snapshot='Owner',responsible_role_snapshot='RouteMgr',idempotency_key='migration-key-0001' WHERE invoice_id=1");
      await assert.rejects(sql.exec("UPDATE invoices SET responsible_role_snapshot='Admin' WHERE invoice_id=1"), { code: "23514" });
      await assert.rejects(sql.exec("DELETE FROM users WHERE user_id=2"), { code: "23001" });
      await assert.rejects(sql.exec("INSERT INTO invoices(invoice_id,customer_id,departure_id,payment_code,total_amount,expires_at,responsible_user_id,responsible_name_snapshot,responsible_role_snapshot,idempotency_key) VALUES(2,1,1,'DUPLICATE',500000,'2035-01-01',2,'Owner','RouteMgr','migration-key-0001')"), { code: "23505" });
    } finally { await sql.close(); }
  });
}
