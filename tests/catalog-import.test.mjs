import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { assertCatalogTarget, readReviewedCatalog, validateReviewedCatalog } from "../prisma/catalog.ts";
import { importCatalogRows } from "../prisma/catalog-importer.ts";

let db;
let entries;
before(async () => {
  entries = await readReviewedCatalog();
  db = await PGlite.create();
  const names = await readdir(new URL("../prisma/migrations/", import.meta.url));
  for (const name of names.filter((value) => /^\d+_/.test(value)).sort()) {
    await db.exec(await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
  }
});
beforeEach(async () => { await db.exec("TRUNCATE trips, users, vehicles RESTART IDENTITY CASCADE"); });
after(async () => { await db?.close(); });

async function runImport(input = entries, dryRun = false) {
  await db.exec("BEGIN");
  try {
    const result = await importCatalogRows(async (sql, params) => (await db.query(sql, params)).rows, input);
    await db.exec(dryRun ? "ROLLBACK" : "COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function snapshot() {
  const result = [];
  for (const [table, key] of [["trips", "trip_id"], ["pickup_points", "pickup_id"], ["departures", "departure_id"], ["departure_pickups", "dep_pickup_id"]]) {
    result.push((await db.query(`SELECT * FROM ${table} ORDER BY ${key}`)).rows);
  }
  return result;
}

async function legacyFixtures() {
  for (const [index, name, city, district, location, difficulty, distance, height, price] of [
    [0, "[Demo] Trekking Núi Bà Đen", "Tây Ninh", "Khu vực Núi Bà Đen", "Núi Bà Đen", "Trung bình", "8.5", 986, "750000"],
    [1, "[Demo] Trekking Núi Chứa Chan", "Đồng Nai", "Khu vực Xuân Lộc", "Núi Chứa Chan", "Dễ", "6.0", 837, "650000"],
  ]) {
    const { rows: [trip] } = await db.query(`INSERT INTO trips(name, city, district, location_name, difficulty_level, length_km,
      peak_height_m, base_price, description, schedule_content) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING trip_id`,
    [name, city, district, location, difficulty, distance, height, price,
      "Dữ liệu demo phục vụ phát triển, không phải tour đang bán.", "Đón khách → di chuyển → trekking cùng Leader → trở về điểm đón."]);
    const pickups = [];
    for (const name of ["Điểm đón trung tâm", "Điểm đón phía Đông"]) {
      const { rows: [pickup] } = await db.query("INSERT INTO pickup_points(trip_id, name, address) VALUES($1,$2,$3) RETURNING pickup_id",
        [trip.trip_id, name, "Địa chỉ demo tại TP. Hồ Chí Minh"]);
      pickups.push(pickup.pickup_id);
    }
    const scenarios = index === 0 ? [["2030-01-05T22:00:00Z", "Draft"], ["2030-01-12T22:00:00Z", "Open"]] : [["2030-01-19T22:00:00Z", "Closed"]];
    for (const [date, status] of scenarios) {
      const { rows: [departure] } = await db.query(`INSERT INTO departures(trip_id, departure_date, min_passengers, booking_deadline, status)
        VALUES($1,$2,6,'2029-12-31T00:00:00Z',$3) RETURNING departure_id`, [trip.trip_id, date, status]);
      for (const pickup_id of pickups) await db.query("INSERT INTO departure_pickups(departure_id, pickup_id, pickup_time) VALUES($1,$2,$3)", [departure.departure_id, pickup_id, date]);
    }
  }
}

test("review keeps unknown trail values and only 13 bus pickups, including exact Lang Biang selector price", () => {
  assert.equal(entries.length, 8);
  assert.equal(entries.reduce((sum, row) => sum + row.pickups.length, 0), 13);
  assert.equal(entries.filter((row) => row.trip.peak_height_m === null).length, 2);
  assert.ok(entries.every((row) => row.trip.difficulty_level === null));
  assert.equal(entries.find((row) => row.source_url.includes("lang-biang")).trip.base_price, "1385999");
  assert.ok(entries.find((row) => row.source_url.includes("lao-than")).trip.schedule_content.includes("email"));
});

test("source edits invalidate the review; duplicate URLs and invalid money fail even with a new digest", async () => {
  const original = JSON.parse(await readFile(new URL("../data/reference/gotrail/catalog.json", import.meta.url), "utf8"));
  const approval = JSON.parse(await readFile(new URL("../data/reference/gotrail/import-review.json", import.meta.url), "utf8"));
  for (const mutation of [
    (catalog) => { catalog.items[0].trip.name = "Changed"; },
    (catalog) => { catalog.items[1].source_url = catalog.items[0].source_url; },
    (catalog) => { catalog.items[0].trip.base_price = "493000.5"; },
    (catalog) => { catalog.items[0].trip.length_km = "5.555"; },
  ]) {
    const changed = structuredClone(original);
    mutation(changed);
    assert.throws(() => validateReviewedCatalog(changed, approval));
    if (changed.items[0].trip.name === "Changed") continue;
    const rereview = { ...approval, catalog_sha256: createHash("sha256").update(JSON.stringify(changed)).digest("hex") };
    assert.throws(() => validateReviewedCatalog(changed, rereview));
  }
});

test("write target accepts local/go-trail and rejects another Supabase project or deceptive hostname", () => {
  for (const target of ["postgresql://postgres@localhost:5432/postgres", "postgresql://postgres@db.anqtlegcsrqzqenytrjo.supabase.co/postgres", "postgresql://postgres.anqtlegcsrqzqenytrjo@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"]) assert.doesNotThrow(() => assertCatalogTarget(target));
  for (const target of ["postgresql://postgres@db.otherproject.supabase.co/postgres", "postgresql://postgres.otherproject@aws-0-ap-southeast-1.pooler.supabase.com/postgres", "postgresql://postgres@db.anqtlegcsrqzqenytrjo.supabase.co.attacker.test/postgres", "https://localhost/postgres",
    "postgresql://postgres@db.anqtlegcsrqzqenytrjo.supabase.co/postgres?host=db.otherproject.supabase.co",
    "postgresql://postgres@localhost/postgres?user=postgres.otherproject&host=aws-0.pooler.supabase.com",
  ]) assert.throws(() => assertCatalogTarget(target));
});

test("fresh import creates eight trips without real departures; repeat leaves all rows identical", async () => {
  const first = await runImport();
  assert.equal(first.created_trips, 8);
  assert.equal(first.created_pickups, 13);
  const before = await snapshot();
  const second = await runImport();
  assert.equal(second.preserved_trips, 8);
  assert.equal(second.created_trips, 0);
  assert.deepEqual(await snapshot(), before);
  assert.equal(before[2].length, 0);
});

test("rerun preserves manual changes to source-derived prices and pickup addresses", async () => {
  await runImport();
  await db.query("UPDATE trips SET base_price=510000, description='Edited by admin' WHERE trip_id=1");
  await db.query("UPDATE pickup_points SET address='Edited by admin' WHERE pickup_id=1");
  const before = await snapshot();
  await runImport();
  assert.deepEqual(await snapshot(), before);
});

test("replaces only old demo identities, preserves FK IDs and times, marks all three fixtures and retires unused pickup", async () => {
  await legacyFixtures();
  const before = await snapshot();
  const result = await runImport();
  assert.equal(result.replaced_demo_trips, 2);
  assert.equal(result.created_trips, 6);
  assert.equal(result.retired_pickups, 1);
  const after = await snapshot();
  assert.equal(after[0][0].trip_id, before[0][0].trip_id);
  assert.equal(after[0][1].trip_id, before[0][1].trip_id);
  assert.equal(after[1].filter((row) => row.is_active).length, 13);
  assert.equal(after[1].find((row) => row.pickup_id === 2).is_active, false);
  assert.ok(after[2].every((row) => row.is_demo));
  const withoutDemoFlag = (row) => { const copy = { ...row }; delete copy.is_demo; return copy; };
  assert.deepEqual(after[2].map(withoutDemoFlag), before[2].map(withoutDemoFlag));
  assert.deepEqual(after[3], before[3]);
  await runImport();
  assert.deepEqual(await snapshot(), after);
});

test("dry-run rolls back replacements and all new catalog rows", async () => {
  await legacyFixtures();
  const before = await snapshot();
  await runImport(entries, true);
  assert.deepEqual(await snapshot(), before);
});

test("booking activity stops replacement and rolls back earlier inserts in the same transaction", async () => {
  await legacyFixtures();
  await db.exec(`INSERT INTO users(email,password_hash,full_name,phone) VALUES('catalog-test@example.test','hash','Test','000');
    INSERT INTO invoices(customer_id,departure_id,payment_code,total_amount,expires_at)
    VALUES(1,1,'IMPORT-TEST',750000,'2029-12-31T00:00:00Z');`);
  const before = await snapshot();
  await assert.rejects(runImport([entries[2], entries[0]]), /booking or financial activity/);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM invoices")).rows[0].count, 1);
});

test("edited demo content, actual departures or manual trip collisions are preserved and require reconciliation", async () => {
  await legacyFixtures();
  await db.query("UPDATE trips SET base_price=800000 WHERE trip_id=1");
  const before = await snapshot();
  await assert.rejects(runImport(), /edited/);
  assert.deepEqual(await snapshot(), before);
  await db.query("UPDATE trips SET base_price=750000 WHERE trip_id=1");
  await db.query("UPDATE departures SET departure_date='2031-01-01T00:00:00Z' WHERE departure_id=1");
  await assert.rejects(runImport(), /departures were edited/);
  await db.query("UPDATE trips SET name=$1 WHERE trip_id=1", [entries[0].trip.name]);
  await assert.rejects(runImport(), /manual trip/);
});

test("nullable summit still rejects negative known heights and canonical source URL remains unique", async () => {
  await runImport();
  await assert.rejects(db.query("UPDATE trips SET peak_height_m=-1 WHERE trip_id=1"), { code: "23514" });
  await assert.rejects(db.query("UPDATE trips SET source_url=$1 WHERE trip_id=2", [entries[0].source_url]), { code: "23505" });
});

test("disabled demo pickup and duplicate fixture departures require reconciliation, preserving admin changes", async () => {
  await legacyFixtures();
  await db.query("UPDATE pickup_points SET is_active=false WHERE pickup_id=1");
  const before = await snapshot();
  await assert.rejects(runImport(), /pickups were edited/);
  assert.deepEqual(await snapshot(), before);
  await db.query("UPDATE pickup_points SET is_active=true WHERE pickup_id=1");
  await db.query(`INSERT INTO departures(trip_id, departure_date, min_passengers, booking_deadline, status)
    SELECT trip_id, departure_date, min_passengers, booking_deadline, status FROM departures WHERE departure_id=1`);
  await assert.rejects(runImport(), /departures were edited/);
});
