import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("catalog migration preserves existing catalog/departures and revokes even Supabase default routine grants", async () => {
  const db = await PGlite.create();
  const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
  const catalogMigration = "20261014000000_catalog_management";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;`);
    const migrations = (await readdir(migrationRoot)).filter((value) => /^\d+_/.test(value)).sort();
    for (const name of migrations.filter((value) => value < catalogMigration)) {
      await db.exec(await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8"));
    }
    await db.exec(`INSERT INTO trips(name,city,location_name,length_km,base_price,description,schedule_content,
      source_url,source_fetched_at) VALUES('Existing catalog','Tây Ninh','Núi',8.5,500000,'Fixture','Fixture',
      'https://gotrail.vn/bus/trail-bus-ba-den/','2026-10-11T00:00:00Z');
      INSERT INTO departures(trip_id,departure_date,booking_deadline,min_passengers,status)
      VALUES(1,'2030-01-01','2029-12-31',6,'Open');`);
    const beforeTrip = (await db.query("SELECT * FROM trips")).rows[0];
    const beforeDeparture = (await db.query("SELECT * FROM departures")).rows[0];
    await db.exec(await readFile(new URL(`${catalogMigration}/migration.sql`, migrationRoot), "utf8"));
    const { is_active, ...afterTrip } = (await db.query("SELECT * FROM trips")).rows[0];
    assert.equal(is_active, true);
    assert.deepEqual(afterTrip, beforeTrip);
    assert.deepEqual((await db.query("SELECT * FROM departures")).rows[0], beforeDeparture);
    assert.equal((await db.query(`SELECT prosecdef FROM pg_proc
      WHERE oid='public.enforce_active_trip_departure()'::regprocedure`)).rows[0].prosecdef, false);
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await db.query("SELECT has_function_privilege($1,'public.enforce_active_trip_departure()','EXECUTE') AS allowed", [role])).rows[0].allowed, false);
    }
    await db.exec("UPDATE trips SET is_active=false WHERE trip_id=1");
    await assert.rejects(db.exec(`INSERT INTO departures(trip_id,departure_date,booking_deadline,min_passengers)
      VALUES(1,'2030-01-02','2030-01-01',6)`), { code: "23514" });
  } finally { await db.close(); }
});
