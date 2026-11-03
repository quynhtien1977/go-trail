import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("O03 owner migration applies after the five-role baseline without inventing owners or changing legacy rows", async () => {
  const sql = await PGlite.create();
  const migrations = new URL("../prisma/migrations/", import.meta.url);
  const ownerMigration = "20261018000000_departure_invoice_owner";
  try {
    await sql.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    for (const name of (await readdir(migrations)).filter(n => /^\d+_/.test(n) && n !== ownerMigration).sort()) {
      await sql.exec(await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"));
    }
    await sql.exec(`
      INSERT INTO users(user_id,email,password_hash,full_name,phone,role)
        VALUES(1,'owner@migration.example.test','unused','Owner','0901234567','RouteMgr');
      INSERT INTO trips(trip_id,name,city,location_name,length_km,base_price,description,schedule_content)
        VALUES(1,'Legacy','Test','Test',5,500000,'Fixture','Fixture');
      INSERT INTO departures(departure_id,trip_id,departure_date,booking_deadline,min_passengers,status)
        VALUES(1,1,'2030-01-02','2030-01-01',1,'Open');
    `);
    const before = (await sql.query("SELECT * FROM departures")).rows[0];
    await sql.exec(await readFile(new URL(`${ownerMigration}/migration.sql`, migrations), "utf8"));
    const { invoice_owner_user_id, ...after } = (await sql.query("SELECT * FROM departures")).rows[0];
    assert.equal(invoice_owner_user_id, null);
    assert.deepEqual(after, before);
    await assert.rejects(sql.exec("UPDATE departures SET invoice_owner_user_id = 999 WHERE departure_id = 1"), { code: "23503" });
    await sql.exec("UPDATE departures SET invoice_owner_user_id = 1 WHERE departure_id = 1");
    await assert.rejects(sql.exec("DELETE FROM users WHERE user_id = 1"), { code: "23001" });
    assert.equal((await sql.query("SELECT invoice_owner_user_id FROM departures")).rows[0].invoice_owner_user_id, 1);
    for (const role of ["anon", "authenticated"]) {
      const result = await sql.query("SELECT has_table_privilege($1, 'public.departures', 'SELECT') AS allowed", [role]);
      assert.equal(result.rows[0].allowed, false);
    }
  } finally { await sql.close(); }
});
