import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { holdSeats } from "../../src/server/services/bookings.ts";
import { updateDeparture } from "../../src/server/services/departures.ts";
import { updateAccountAccess } from "../../src/server/services/accounts.ts";

// Disposable local PostgreSQL, multiple independent connections. Never read .env.
const name = `gotrail-bookings-test-${randomUUID()}`;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const now = new Date("2034-01-01T00:00:00Z");
let started = false, db, pool, groups = 0;
try {
  docker("run", "--rm", "--detach", "--name", name, "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
    "--publish", "127.0.0.1::5432", "postgres:18");
  started = true;
  const mapping = docker("port", name, "5432/tcp");
  assert.match(mapping, /^127\.0\.0\.1:\d+$/);
  const config = { host: "127.0.0.1", port: Number(mapping.split(":")[1]), user: "postgres", database: "postgres", connectionTimeoutMillis: 1000 };
  pool = new pg.Pool({ ...config, max: 3 });
  let ready = false;
  for (let i = 0; i < 60; i++) { try { await pool.query("SELECT 1"); ready = true; break; } catch { await delay(250); } }
  assert.ok(ready, "Disposable PostgreSQL must start");
  const migrations = new URL("../../prisma/migrations/", import.meta.url);
  for (const migration of (await readdir(migrations)).filter(n => /^\d+_/.test(n)).sort()) {
    await pool.query(await readFile(new URL(`${migration}/migration.sql`, migrations), "utf8"));
  }
  db = new PrismaClient({ adapter: new PrismaPg({ ...config, max: 12, application_name: name }) });
  async function fixture() {
    await pool.query("TRUNCATE users,trips,vehicles,system_settings RESTART IDENTITY CASCADE");
    const actors = {};
    for (const label of ["Owner", "NewOwner", "Admin", ...Array.from({ length: 8 }, (_, i) => `Buyer${i}`)]) {
      const role = label.endsWith("Owner") ? "RouteMgr" : label === "Admin" ? "Admin" : "Customer";
      const user = await db.user.create({ data: { email: `${label}@concurrency.example.test`, password_hash: "unused",
        full_name: label, phone: "0901234567", role } });
      actors[label] = { user_id: user.user_id, role, auth_version: 0 };
    }
    const trip = await db.trip.create({ data: { name: "Concurrency fixture", city: "Test", location_name: "Test", length_km: "5",
      base_price: "500000", description: "Isolated", schedule_content: "Isolated" } });
    const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Test", address: "Test" } });
    const departure = await db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2035-01-02"),
      booking_deadline: new Date("2035-01-01"), min_passengers: 1, status: "Open", invoice_owner_user_id: actors.Owner.user_id,
      pickups: { create: { pickup_id: pickup.pickup_id, pickup_time: new Date("2035-01-02") } } }, include: { pickups: true } });
    const vehicle = await db.vehicle.create({ data: { plate_number: "TEST-BOOKING", vehicle_type: "Fixture", seat_count: 4,
      seats: { create: Array.from({ length: 4 }, (_, i) => ({ seat_name: `A0${i + 1}`, floor_level: 1, x_position: i, y_position: 0 })) } }, include: { seats: true } });
    const assignment = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
    await db.departureSeat.createMany({ data: vehicle.seats.map(seat => ({ seat_id: seat.seat_id, dep_vehicle_id: assignment.dep_vehicle_id })) });
    const seats = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
    const input = (ids, key) => ({ idempotency_key: key, seats: ids.map(index => ({ dep_seat_id: seats[index].dep_seat_id,
      dep_pickup_id: departure.pickups[0].dep_pickup_id, passenger_name: "Fixture passenger", passenger_phone: "0901234567",
      emergency_contact: "Fixture contact", health_declaration: true })) });
    const hold = (buyer, ids, key, at = now) => holdSeats(db, actors[buyer], departure.departure_id, input(ids, key), at);
    return { actors, departure, trip, seats, input, hold };
  }
  async function waitForLocks(count) {
    for (let i = 0; i < 100; i++) {
      const result = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [name]);
      if (result.rows[0].n >= count) return;
      await delay(25);
    }
    assert.fail(`Expected ${count} independently blocked transactions`);
  }
  async function blocked(sql, params, run, mutate, count = 1) {
    const blocker = await pool.connect();
    let pending;
    try {
      await blocker.query("BEGIN");
      await blocker.query(sql, params);
      pending = Promise.allSettled(run());
      await waitForLocks(count);
      await mutate?.(blocker);
      await blocker.query("COMMIT");
      return await pending;
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await pending; }
  }
  const pass = message => { groups++; console.log(`PASS: ${message}`); };
  const oneWinner = results => {
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.ok(results.filter(r => r.status === "rejected").every(r => r.reason.code === "RESOURCE_CONFLICT"));
  };

  let f = await fixture();
  const race = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id],
    () => Array.from({ length: 8 }, (_, i) => f.hold(`Buyer${i}`, [0], `seat-race-key-000${i}`)), undefined, 8);
  oneWinner(race);
  assert.equal(await db.invoice.count(), 1); assert.equal(await db.invoiceDetail.count(), 1);
  pass("8 concurrent customers contest one seat; exactly one invoice/ticket/hold commits.");

  f = await fixture();
  const duplicates = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id],
    () => Array.from({ length: 8 }, () => f.hold("Buyer0", [0], "same-request-key-0001")), undefined, 8);
  assert.ok(duplicates.every(r => r.status === "fulfilled"));
  assert.equal(new Set(duplicates.map(r => r.value.invoice_id)).size, 1);
  assert.equal(await db.invoice.count(), 1);
  pass("8 duplicate requests serialize on their key and replay one invoice without changing its snapshot.");

  f = await fixture();
  const altered = f.input([0], "changed-request-0001"); altered.seats[0].passenger_phone = "0999999999";
  const mismatched = await Promise.allSettled([f.hold("Buyer0", [0], "changed-request-0001"),
    holdSeats(db, f.actors.Buyer0, f.departure.departure_id, altered, now)]);
  oneWinner(mismatched); assert.equal(await db.invoice.count(), 1);
  pass("same key with a different passenger payload conflicts under true concurrency.");

  f = await fixture();
  const reversed = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id],
    () => [f.hold("Buyer0", [1, 0], "multi-seat-left-0001"), f.hold("Buyer1", [0, 1], "multi-seat-right-0001")], undefined, 2);
  oneWinner(reversed); assert.equal(await db.invoice.count(), 1); assert.equal(await db.invoiceDetail.count(), 2);
  pass("opposite multi-seat input orders acquire seats consistently; the loser rolls back completely.");

  f = await fixture();
  const old = await f.hold("Buyer0", [0, 1, 2], "old-expired-key-0001");
  const reclaim = await blocked("SELECT invoice_id FROM invoices WHERE invoice_id=$1 FOR UPDATE", [old.invoice_id],
    () => [f.hold("Buyer1", [0], "reclaim-left-key-0001", new Date(now.getTime() + 960000)),
      f.hold("Buyer2", [1], "reclaim-right-key-0001", new Date(now.getTime() + 960000))], undefined, 2);
  assert.ok(reclaim.every(r => r.status === "fulfilled"));
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: old.invoice_id } })).status, "Expired");
  assert.equal(await db.invoiceDetail.count({ where: { invoice_id: old.invoice_id, status: "Cancelled" } }), 3);
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[2].dep_seat_id } })).status, "Available");
  pass("concurrent reclamation expires one old invoice, cancels only Pending tickets and releases all its old holds.");

  for (const [label, mutation, expected] of [
    ["owner lock", "UPDATE users SET status='Locked',auth_version=auth_version+1 WHERE user_id=$1", "RESOURCE_CONFLICT"],
    ["owner role change", "UPDATE users SET role='HRMgr',auth_version=auth_version+1 WHERE user_id=$1", "RESOURCE_CONFLICT"],
    ["buyer revocation", "UPDATE users SET status='Locked',auth_version=auth_version+1 WHERE user_id=$1", "UNAUTHENTICATED"],
  ]) {
    f = await fixture();
    const id = label === "buyer revocation" ? f.actors.Buyer0.user_id : f.actors.Owner.user_id;
    const result = await blocked("SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE", [id],
      () => [f.hold("Buyer0", [0], "account-change-key-01")], connection => connection.query(mutation, [id]));
    assert.equal(result[0].status, "rejected"); assert.equal(result[0].reason.code, expected);
    assert.equal(await db.invoice.count(), 0);
    pass(`${label} is re-read after waiting; no invoice or snapshot commits.`);
  }

  f = await fixture();
  const reassigned = await blocked("SELECT departure_id FROM departures WHERE departure_id=$1 FOR UPDATE", [f.departure.departure_id],
    () => [f.hold("Buyer0", [0], "assignment-before-01")],
    connection => connection.query("UPDATE departures SET invoice_owner_user_id=$1 WHERE departure_id=$2", [f.actors.NewOwner.user_id, f.departure.departure_id]));
  assert.equal(reassigned[0].status, "fulfilled"); assert.equal(reassigned[0].value.responsible_name_snapshot, "NewOwner");
  pass("an owner reassignment that wins the departure lock is used by the new invoice.");

  f = await fixture();
  let accountChange;
  const createdBeforeLock = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id],
    () => [f.hold("Buyer0", [0], "booking-before-lock1")], async () => {
      accountChange = Promise.allSettled([updateAccountAccess(db, f.actors.Admin, f.actors.Owner.user_id, { status: "Locked" })]);
      await waitForLocks(2);
    });
  assert.equal(createdBeforeLock[0].status, "fulfilled"); assert.equal((await accountChange)[0].status, "fulfilled");
  const replayed = await f.hold("Buyer0", [0], "booking-before-lock1");
  assert.equal(replayed.responsible_name_snapshot, "Owner");
  await assert.rejects(f.hold("Buyer1", [1], "booking-after-lock01"), { code: "RESOURCE_CONFLICT" });
  pass("actual Admin account locking waits for booking; the committed snapshot survives and new bookings stop.");

  f = await fixture();
  let assignmentChange;
  const createdBeforeAssignment = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id],
    () => [f.hold("Buyer0", [0], "booking-before-asg01")], async () => {
      assignmentChange = Promise.allSettled([updateDeparture(db, f.actors.Admin, f.departure.departure_id,
        { invoice_owner_user_id: f.actors.NewOwner.user_id }, now)]);
      await waitForLocks(2);
    });
  assert.equal(createdBeforeAssignment[0].status, "fulfilled"); assert.equal((await assignmentChange)[0].status, "fulfilled");
  assert.equal(createdBeforeAssignment[0].value.responsible_name_snapshot, "Owner");
  assert.equal((await f.hold("Buyer1", [1], "booking-after-asg-01")).responsible_name_snapshot, "NewOwner");
  pass("actual Admin reassignment waits for booking and changes only subsequent invoice snapshots.");

  f = await fixture();
  const pending = await f.hold("Buyer0", [0], "paid-race-old-key-01");
  const paid = await blocked("SELECT invoice_id FROM invoices WHERE invoice_id=$1 FOR UPDATE", [pending.invoice_id],
    () => [f.hold("Buyer1", [0], "paid-race-new-key-01", new Date(now.getTime() + 960000))], async connection => {
      await connection.query("UPDATE invoices SET status='Paid' WHERE invoice_id=$1", [pending.invoice_id]);
      await connection.query("UPDATE invoice_details SET status='Valid',ticket_code='VALID-RACE' WHERE invoice_id=$1", [pending.invoice_id]);
      await connection.query("UPDATE departure_seats SET status='Sold',locked_until=NULL WHERE invoice_id=$1", [pending.invoice_id]);
    });
  assert.equal(paid[0].status, "rejected"); assert.equal(paid[0].reason.code, "RESOURCE_CONFLICT");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: pending.invoice_id } })).status, "Paid");
  assert.equal((await db.invoiceDetail.findFirstOrThrow()).status, "Valid");
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[0].dep_seat_id } })).status, "Sold");
  pass("a concurrent durable Paid/Valid/Sold update wins over reclamation; none of it is released.");

  f = await fixture();
  await db.departure.update({ where: { departure_id: f.departure.departure_id }, data: { booking_deadline: new Date(Date.now() + 1500) } });
  const late = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id],
    () => [holdSeats(db, f.actors.Buyer0, f.departure.departure_id, f.input([0], "deadline-wait-key-01"))], () => delay(1800));
  assert.equal(late[0].status, "rejected"); assert.equal(late[0].reason.code, "RESOURCE_CONFLICT");
  assert.equal(await db.invoice.count(), 0);
  pass("a deadline crossed while waiting on a seat is rechecked and rolls back the whole new invoice.");
  console.log(`PASS: ${groups} PostgreSQL booking concurrency groups; independent connections, no remote database.`);
} finally {
  await db?.$disconnect(); await pool?.end();
  if (started) docker("rm", "--force", name);
}
