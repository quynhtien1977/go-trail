import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;
before(async () => {
  db = await PGlite.create();
  // Reproduce Supabase's broad default grants so revocation is actually exercised.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    CREATE TABLE public._prisma_migrations (id text PRIMARY KEY, logs text);
  `);
  const migrations = await readdir(new URL("../prisma/migrations/", import.meta.url))
    .catch(() => []);
  for (const name of migrations.filter((name) => /^\d+_/.test(name)).sort()) {
    const sql = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
    await db.exec(sql);
  }
});
after(async () => { await db?.close(); });

test("creates 22 business tables including trip media with RLS; rate counters stay outside PostgreSQL", async () => {
  const { rows } = await db.query("SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid = relnamespace WHERE n.nspname = 'public' AND relkind = 'r' AND relname <> '_prisma_migrations'");
  assert.equal(rows.length, 22);
  assert.ok(rows.some(row => row.relname === "trip_media"));
  assert.ok(!rows.some((row) => row.relname === "auth_rate_limits"));
  assert.ok(rows.every((row) => row.relrowsecurity));
});

test("rejects invalid refund percentages and duplicate thresholds", async () => {
  await assert.rejects(db.query("INSERT INTO refund_policy_rules (hours_before_departure, refund_percentage) VALUES (0, 101)"), { code: "23514" });
  await db.query("INSERT INTO refund_policy_rules (hours_before_departure, refund_percentage) VALUES (0, 0)");
  await assert.rejects(db.query("INSERT INTO refund_policy_rules (hours_before_departure, refund_percentage) VALUES (0, 30)"), { code: "23505" });
});

test("keeps money as scale-zero numeric and timestamps timezone-aware", async () => {
  const { rows: money } = await db.query("SELECT numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'total_amount'");
  assert.equal(money[0]?.numeric_precision, 14);
  assert.equal(money[0]?.numeric_scale, 0);
  const { rows: timestamps } = await db.query("SELECT data_type FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'expires_at'");
  assert.equal(timestamps[0]?.data_type, "timestamp with time zone");
});

test("Supabase API roles cannot read user accounts or insert invoices", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const { rows } = await db.query("SELECT has_table_privilege($1, 'public.users', 'SELECT') AS read, has_table_privilege($1, 'public.invoices', 'INSERT') AS write", [role]);
    assert.equal(rows[0].read, false);
    assert.equal(rows[0].write, false);
  }
});

test("auth versions default to zero and cannot become negative", async () => {
  const { rows } = await db.query("INSERT INTO users (email, password_hash, full_name, phone) VALUES ('version@example.test', 'hash', 'Test', '000') RETURNING auth_version");
  assert.equal(rows[0].auth_version, 0);
  await assert.rejects(db.query("INSERT INTO users (email, password_hash, full_name, phone, auth_version) VALUES ('bad-version@example.test', 'hash', 'Test', '000', -1)"), { code: "23514" });
});

test("API roles cannot access sequences or Prisma migration logs", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const { rows } = await db.query("SELECT has_table_privilege($1, 'public._prisma_migrations', 'SELECT') AS logs, has_sequence_privilege($1, 'public.users_user_id_seq', 'USAGE') AS sequence", [role]);
    assert.equal(rows[0].logs, false);
    assert.equal(rows[0].sequence, false);
  }
  const { rows } = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public._prisma_migrations'::regclass");
  assert.equal(rows[0].relrowsecurity, true);
});

test("rejects unsupported enum values", async () => {
  await assert.rejects(db.query("INSERT INTO users (email, password_hash, full_name, phone, role) VALUES ('invalid@example.test', 'hash', 'Invalid', '000', 'SuperAdmin')"), { code: "22P02" });
});

test("a cancelled ticket releases uniqueness while another active ticket cannot reuse the seat", async () => {
  await db.exec(`
    INSERT INTO users (user_id, email, password_hash, full_name, phone) VALUES (100, 'customer@example.test', 'hash', 'Customer', '000');
    INSERT INTO trips (trip_id, name, city, location_name, difficulty_level, length_km, peak_height_m, base_price, description, schedule_content) VALUES (100, 'Trail', 'Tay Ninh', 'Nui Ba Den', 'Easy', 4.5, 986, 500000, 'Demo', 'Demo');
    INSERT INTO vehicles (vehicle_id, plate_number, vehicle_type, seat_count) VALUES (100, 'TEST-100', 'Bus', 1);
    INSERT INTO vehicle_seats (seat_id, vehicle_id, seat_name, floor_level, x_position, y_position) VALUES (100, 100, 'A1', 1, 0, 0);
    INSERT INTO departures (departure_id, trip_id, departure_date, min_passengers, booking_deadline) VALUES (100, 100, '2030-01-01T01:00:00Z', 1, '2029-12-31T01:00:00Z');
    INSERT INTO departure_vehicles (dep_vehicle_id, departure_id, vehicle_id) VALUES (100, 100, 100);
    INSERT INTO departure_seats (dep_seat_id, dep_vehicle_id, seat_id) VALUES (100, 100, 100);
    INSERT INTO pickup_points (pickup_id, trip_id, name, address) VALUES (100, 100, 'Pickup', 'Demo');
    INSERT INTO departure_pickups (dep_pickup_id, departure_id, pickup_id, pickup_time) VALUES (100, 100, 100, '2030-01-01T01:00:00Z');
    INSERT INTO invoices (invoice_id, customer_id, departure_id, payment_code, total_amount, expires_at) VALUES (100, 100, 100, 'TEST100', 500000, '2029-12-31T01:00:00Z');
  `);
  const insert = "INSERT INTO invoice_details (invoice_id, dep_seat_id, dep_pickup_id, passenger_name, passenger_phone, emergency_contact, health_declaration, unit_price, status) VALUES (100, 100, 100, 'Passenger', '000', 'Contact', true, 500000, $1)";
  await db.query(insert, ["Cancelled"]);
  await db.query(insert, ["Pending"]);
  await assert.rejects(db.query(insert, ["Valid"]), { code: "23505" });
  await db.query("UPDATE invoice_details SET status = 'Cancelled' WHERE dep_seat_id = 100 AND status = 'Pending'");
  await db.query(insert, ["Valid"]);
  const { rows } = await db.query("SELECT count(*)::int AS count FROM invoice_details WHERE dep_seat_id = 100");
  assert.equal(rows[0].count, 3);
});

test("rejects duplicate webhook transaction IDs even when no invoice matches", async () => {
  const query = "INSERT INTO payments (amount, transaction_id, reference_code, status, raw_payload) VALUES (100, 'sepay-100', 'REF', 'NeedsReview', '{}')";
  await db.query(query);
  await assert.rejects(db.query(query), { code: "23505" });
});

test("seat hold shape cannot leave a sold seat with an expiry or an available seat with an invoice", async () => {
  await assert.rejects(db.query("UPDATE departure_seats SET status = 'Sold', invoice_id = 100, locked_until = now() WHERE dep_seat_id = 100"), { code: "23514" });
  await assert.rejects(db.query("UPDATE departure_seats SET invoice_id = 100 WHERE dep_seat_id = 100"), { code: "23514" });
  await db.query("UPDATE departure_seats SET status = 'Locked', invoice_id = 100, locked_until = now() + interval '15 minutes' WHERE dep_seat_id = 100");
  await db.query("UPDATE departure_seats SET status = 'Sold', locked_until = NULL WHERE dep_seat_id = 100");
});

test("prevents deleting financial parent records while tickets reference them", async () => {
  await assert.rejects(db.query("DELETE FROM invoices WHERE invoice_id = 100"), { code: "23001" });
  const { rows } = await db.query("SELECT count(*)::int AS count FROM invoices WHERE invoice_id = 100");
  assert.equal(rows[0].count, 1);
});
