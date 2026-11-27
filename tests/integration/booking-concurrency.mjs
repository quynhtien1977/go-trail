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
import { recordSepayPayment } from "../../src/server/services/payments.ts";
import { checkIn } from "../../src/server/services/checkin.ts";
import { endLeaderDeparture } from "../../src/server/services/departures.ts";
import { createSupplyItem, readSupplyItem, receiveSupply } from "../../src/server/services/inventory.ts";
import { closeDepartures, expireInvoices } from "../../src/server/services/cron.ts";

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
  const sold = await f.hold("Buyer1", [1], "sold-second-seat-001");
  await pool.query("UPDATE invoices SET status='Paid' WHERE invoice_id=$1", [sold.invoice_id]);
  await pool.query("UPDATE invoice_details SET status='Valid',ticket_code='K06-SOLD' WHERE invoice_id=$1", [sold.invoice_id]);
  await pool.query("UPDATE departure_seats SET status='Sold',locked_until=NULL WHERE invoice_id=$1", [sold.invoice_id]);
  const beforeSoldConflict = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
  const soldConflict = await blocked("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[1].dep_seat_id],
    () => [f.hold("Buyer0", [0, 1], "sold-second-loser-01")], async () => {
      // The request must hold the first row while waiting for the second, rather than failing before contention.
      await assert.rejects(pool.query("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE NOWAIT", [f.seats[0].dep_seat_id]),
        { code: "55P03" });
    });
  assert.equal(soldConflict[0].status, "rejected"); assert.equal(soldConflict[0].reason.code, "RESOURCE_CONFLICT");
  assert.deepEqual(await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }), beforeSoldConflict);
  assert.equal(await db.invoice.count(), 1); assert.equal(await db.invoiceDetail.count(), 1);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: sold.invoice_id } })).status, "Paid");
  assert.equal((await db.invoiceDetail.findFirstOrThrow()).status, "Valid");
  pass("a later Sold seat rejects a waiting multi-seat request; no partial invoice or change to either seat survives.");

  f = await fixture();
  const beforeFailure = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
  // Inject a database failure only after the first seat was actually acquired in this transaction.
  await pool.query(`CREATE FUNCTION k06_fail_later_seat() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.dep_seat_id = ${f.seats[1].dep_seat_id} AND NEW.status = 'Locked' THEN
        IF NOT EXISTS (SELECT 1 FROM departure_seats WHERE dep_seat_id = ${f.seats[0].dep_seat_id}
          AND status = 'Locked' AND invoice_id = NEW.invoice_id) THEN
          RAISE EXCEPTION 'K06_FIRST_SEAT_NOT_ACQUIRED';
        END IF;
        RAISE EXCEPTION 'K06_LATER_SEAT_FAILURE';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER k06_fail_later_seat BEFORE UPDATE ON departure_seats
      FOR EACH ROW EXECUTE FUNCTION k06_fail_later_seat()`);
  try {
    await assert.rejects(f.hold("Buyer0", [1, 0], "later-seat-fails-001"), error => {
      assert.match(error.message, /K06_LATER_SEAT_FAILURE/);
      return true;
    });
    assert.equal(await db.invoice.count(), 0); assert.equal(await db.invoiceDetail.count(), 0);
    assert.deepEqual(await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }), beforeFailure);
  } finally {
    await pool.query("DROP TRIGGER k06_fail_later_seat ON departure_seats; DROP FUNCTION k06_fail_later_seat()");
  }
  pass("a database failure after acquiring the first seat rolls back all seats, invoice, tickets and owner snapshot.");

  f = await fixture();
  const old = await f.hold("Buyer0", [0, 1, 2], "old-expired-key-0001");
  const reclaim = await blocked("SELECT invoice_id FROM invoices WHERE invoice_id=$1 FOR UPDATE", [old.invoice_id],
    () => [f.hold("Buyer1", [0], "reclaim-left-key-0001", new Date(now.getTime() + 960000)),
      f.hold("Buyer2", [1], "reclaim-right-key-0001", new Date(now.getTime() + 960000))], undefined, 2);
  assert.ok(reclaim.every(r => r.status === "fulfilled"));
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: old.invoice_id } })).status, "Expired");
  assert.equal(await db.invoiceDetail.count({ where: { invoice_id: old.invoice_id, status: "Cancelled" } }), 3);
  for (const [index, result] of reclaim.entries()) {
    const seat = await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[index].dep_seat_id } });
    assert.equal(seat.status, "Locked"); assert.equal(seat.invoice_id, result.value.invoice_id);
    assert.equal(seat.locked_until.toISOString(), result.value.expires_at);
  }
  const released = await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[2].dep_seat_id } });
  assert.equal(released.status, "Available"); assert.equal(released.invoice_id, null); assert.equal(released.locked_until, null);
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
  const createdAfterAssignment = await f.hold("Buyer1", [1], "booking-after-asg-01");
  assert.equal(createdAfterAssignment.responsible_name_snapshot, "NewOwner");
  // Re-read committed rows after reassignment; an old response object cannot prove historical durability.
  const snapshot = invoiceId => db.invoice.findUniqueOrThrow({ where: { invoice_id: invoiceId },
    select: { responsible_user_id: true, responsible_name_snapshot: true, responsible_role_snapshot: true } });
  assert.deepEqual(await snapshot(createdBeforeAssignment[0].value.invoice_id), {
    responsible_user_id: f.actors.Owner.user_id, responsible_name_snapshot: "Owner", responsible_role_snapshot: "RouteMgr" });
  assert.deepEqual(await snapshot(createdAfterAssignment.invoice_id), {
    responsible_user_id: f.actors.NewOwner.user_id, responsible_name_snapshot: "NewOwner", responsible_role_snapshot: "RouteMgr" });
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

  // P02: real SePay confirmations racing real holds. A fixture key only; never a real SEPAY_API_KEY.
  process.env.SEPAY_API_KEY = "concurrency-fixture-key-0123456789";
  const sepay = (code, id, amount, at) => recordSepayPayment(db, "Apikey concurrency-fixture-key-0123456789",
    JSON.stringify({ id, gateway: "Fixture", transactionDate: "2034-01-01 00:00:00", accountNumber: "0000000000", code,
      content: `${code} fixture`, transferType: "in", transferAmount: amount, accumulated: 0, subAccount: "",
      referenceCode: `FIX${id}`, description: "" }), at);
  const activeTickets = seatId => db.invoiceDetail.count({ where: { dep_seat_id: seatId, status: { not: "Cancelled" } } });

  // Q03: real scheduler transactions against a real SePay webhook, with deterministic lock ordering.
  process.env.CRON_SECRET = "concurrency-fixture-cron-secret-0123456789";
  const cronAuth = "Bearer concurrency-fixture-cron-secret-0123456789";
  const cronTime = new Date(now.getTime() + 16 * 60_000);
  f = await fixture();
  const paymentFirst = await f.hold("Buyer0", [0], "cron-payment-first-01");
  await db.departure.update({ where: { departure_id: f.departure.departure_id }, data: { booking_deadline: new Date(now.getTime() + 10 * 60_000) } });
  let blocker = await pool.connect();
  let webhook;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id]);
    webhook = sepay(paymentFirst.payment_code, 915001, 500000, cronTime);
    await waitForLocks(1); // webhook holds departure SHARE and invoice UPDATE, waiting on seat
    assert.equal((await expireInvoices(db, cronAuth, cronTime)).processed, 0);
    assert.equal((await closeDepartures(db, cronAuth, cronTime)).processed, 0);
    await blocker.query("COMMIT");
    await webhook;
  } finally { await blocker.query("ROLLBACK"); blocker.release(); await webhook; }
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: paymentFirst.invoice_id } })).status, "Paid");
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[0].dep_seat_id } })).status, "Sold");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { transaction_id: "915001" } })).status, "Success");
  assert.equal((await closeDepartures(db, cronAuth, cronTime)).processed, 1);
  assert.equal(await db.auditLog.count({ where: { user_id: null, action: "DepartureStatusChanged" } }), 1);
  pass("Q03 skips an invoice and departure being settled, preserving Paid/Valid/Sold, then closes after the webhook commits.");

  f = await fixture();
  const cronFirst = await f.hold("Buyer0", [0], "cron-before-payment-01");
  blocker = await pool.connect();
  let expiration;
  webhook = undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT dep_seat_id FROM departure_seats WHERE dep_seat_id=$1 FOR UPDATE", [f.seats[0].dep_seat_id]);
    expiration = expireInvoices(db, cronAuth, cronTime);
    await waitForLocks(1); // cron holds the invoice and waits for the seat
    webhook = sepay(cronFirst.payment_code, 915002, 500000, cronTime);
    await waitForLocks(2); // webhook waits for that invoice
    await blocker.query("COMMIT");
    assert.equal((await expiration).processed, 1);
    await webhook;
  } finally { await blocker.query("ROLLBACK"); blocker.release(); await expiration; await webhook; }
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: cronFirst.invoice_id } })).status, "Paid");
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[0].dep_seat_id } })).status, "Sold");
  assert.equal((await db.invoiceDetail.findFirstOrThrow({ where: { invoice_id: cronFirst.invoice_id } })).status, "Valid");
  assert.equal((await db.payment.findUniqueOrThrow({ where: { transaction_id: "915002" } })).status, "Success");
  assert.equal(await activeTickets(f.seats[0].dep_seat_id), 1);
  pass("Q03 expiration winning the invoice lock still permits the late webhook to restore an available seat exactly once.");

  f = await fixture();
  const duplicated = await f.hold("Buyer0", [0], "cron-duplicate-key-01");
  const expiredRuns = await Promise.all(Array.from({ length: 6 }, () => expireInvoices(db, cronAuth, cronTime)));
  assert.equal(expiredRuns.reduce((sum, result) => sum + result.processed, 0), 1);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: duplicated.invoice_id } })).status, "Expired");
  await db.departure.update({ where: { departure_id: f.departure.departure_id }, data: { booking_deadline: now } });
  const closedRuns = await Promise.all(Array.from({ length: 6 }, () => closeDepartures(db, cronAuth, cronTime)));
  assert.equal(closedRuns.reduce((sum, result) => sum + result.processed, 0), 1);
  assert.equal(await db.auditLog.count({ where: { user_id: null, action: "DepartureStatusChanged" } }), 1);
  pass("6 overlapping invocations expire once and close once, with a single system audit.");

  f = await fixture();
  const stale = await f.hold("Buyer0", [0], "late-pay-old-hold-01");
  const later = new Date(now.getTime() + 16 * 60_000);
  // Both sides lock the stale invoice first: the payment to confirm it, the new hold to reclaim its seat.
  const contest = await blocked("SELECT invoice_id FROM invoices WHERE invoice_id=$1 FOR UPDATE", [stale.invoice_id],
    () => [sepay(stale.payment_code, 910001, 500000, later), f.hold("Buyer1", [0], "late-pay-new-hold-01", later)], undefined, 2);
  assert.equal(contest[0].status, "fulfilled", "SePay is acknowledged whoever wins");
  const latePayment = await db.payment.findUniqueOrThrow({ where: { transaction_id: "910001" } });
  const seatAfter = await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: f.seats[0].dep_seat_id } });
  if (latePayment.status === "Success") {
    assert.equal(contest[1].status, "rejected"); assert.equal(contest[1].reason.code, "RESOURCE_CONFLICT");
    assert.equal(seatAfter.status, "Sold"); assert.equal(seatAfter.invoice_id, stale.invoice_id);
  } else {
    assert.equal(contest[1].status, "fulfilled", "the payment only steps aside when the new hold really won");
    assert.equal(seatAfter.invoice_id, contest[1].value.invoice_id);
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: stale.invoice_id } })).status, "Expired");
  }
  assert.equal(await activeTickets(f.seats[0].dep_seat_id), 1, "the seat ends with exactly one active ticket");
  pass("a late SePay payment and a new hold racing for one stale seat: exactly one wins, the money is always recorded.");

  f = await fixture();
  const invoice = await f.hold("Buyer0", [0, 1], "paid-by-many-hold-01");
  const deliveries = await blocked("SELECT invoice_id FROM invoices WHERE invoice_id=$1 FOR UPDATE", [invoice.invoice_id],
    () => [...Array.from({ length: 6 }, () => sepay(invoice.payment_code, 920001, 1000000, now)),
      sepay(invoice.payment_code, 920002, 1000000, now), sepay(invoice.payment_code, 920003, 1500000, now)], undefined, 8);
  assert.ok(deliveries.every(r => r.status === "fulfilled"), "every delivery is acknowledged");
  const recorded = await db.payment.findMany({ orderBy: { transaction_id: "asc" } });
  assert.deepEqual(recorded.map(r => r.transaction_id), ["920001", "920002", "920003"], "one row per transfer, retries absorbed");
  assert.equal(recorded.filter(r => r.status === "Success").length, 1, "the invoice is confirmed by exactly one transfer");
  const issued = await db.invoiceDetail.findMany({ where: { invoice_id: invoice.invoice_id } });
  assert.ok(issued.every(t => t.status === "Valid" && /^TK[0-9A-F]{20}$/.test(t.ticket_code)));
  assert.equal(new Set(issued.map(t => t.ticket_code)).size, 2, "each ticket issued once with its own code");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } })).status, "Paid");
  pass("6 retries and 2 other transfers racing for one invoice: one confirmation, one row per transfer, tickets issued once.");

  // L01: QR check-in. Paid/Valid tickets come from the real hold + SePay path, then operations confirm the departure.
  async function checkInFixture() {
    const base = await fixture();
    const paid = await base.hold("Buyer0", [0, 1], "checkin-fixture-hold-1");
    await sepay(paid.payment_code, 930001, 1000000, now);
    await db.departure.update({ where: { departure_id: base.departure.departure_id }, data: { status: "Confirmed" } });
    const user = await db.user.create({ data: { email: "leader@concurrency.example.test", password_hash: "unused",
      full_name: "Leader", phone: "0901234567", role: "Leader" } });
    const staff = await db.staff.create({ data: { user_id: user.user_id, full_name: "Leader", phone: "0901234567", staff_type: "Leader" } });
    const vehicle = await db.departureVehicle.findFirstOrThrow({ where: { departure_id: base.departure.departure_id } });
    const crew = await db.departureStaff.create({ data: { departure_id: base.departure.departure_id, staff_id: staff.staff_id,
      role_in_trip: "Leader", dep_vehicle_id: vehicle.dep_vehicle_id } });
    const tickets = await db.invoiceDetail.findMany({ where: { invoice_id: paid.invoice_id }, orderBy: { dep_seat_id: "asc" } });
    assert.ok(tickets.every(t => t.status === "Valid" && t.ticket_code));
    return { ...base, leader: { user_id: user.user_id, role: "Leader", auth_version: 0 }, tickets, crew };
  }
  const scan = (fx, actor, ticketCode, at = now) =>
    checkIn(db, actor, { action: "CheckIn", departure_id: fx.departure.departure_id, ticket_code: ticketCode }, at);
  const checkInState = detailId => db.invoiceDetail.findUniqueOrThrow({ where: { detail_id: detailId },
    select: { check_in_status: true, check_in_time: true } });

  let c = await checkInFixture();
  const scanned = c.tickets[0];
  const scans = await blocked("SELECT detail_id FROM invoice_details WHERE detail_id=$1 FOR UPDATE", [scanned.detail_id],
    () => Array.from({ length: 8 }, (_, i) => scan(c, i % 2 ? c.actors.Admin : c.leader, scanned.ticket_code,
      new Date(now.getTime() + i * 1000))), undefined, 8);
  assert.ok(scans.every(r => r.status === "fulfilled"), "every scan succeeds");
  assert.equal(scans.filter(r => r.value.changed).length, 1, "exactly one scan writes");
  const stamped = scans.find(r => r.value.changed).value.passenger.check_in_time;
  assert.ok(scans.every(r => r.value.passenger.check_in_status === "CheckedIn" && r.value.passenger.check_in_time === stamped),
    "every scan reports the first scan's time");
  assert.equal((await checkInState(scanned.detail_id)).check_in_time.toISOString(), stamped);
  pass("8 concurrent scans of one QR from two devices: one check-in, every scan reports the same first time.");

  c = await checkInFixture();
  const contested = c.tickets[1];
  const mixed = await blocked("SELECT detail_id FROM invoice_details WHERE detail_id=$1 FOR UPDATE", [contested.detail_id],
    () => [scan(c, c.leader, contested.ticket_code), checkIn(db, c.actors.Admin,
      { action: "MarkAbsent", departure_id: c.departure.departure_id, detail_id: contested.detail_id }, now)], undefined, 2);
  assert.equal(mixed[0].status, "fulfilled"); assert.equal(mixed[0].value.result, "CheckedIn");
  if (mixed[1].status === "fulfilled") assert.equal(mixed[1].value.result, "MarkedAbsent", "Absent first, then the scan boards");
  else assert.equal(mixed[1].reason.code, "ALREADY_CHECKED_IN", "scan first, then Absent is refused");
  assert.equal((await checkInState(contested.detail_id)).check_in_status, "CheckedIn");
  pass("a QR scan racing a manual Absent always ends CheckedIn: Absent never overwrites a scan.");

  c = await checkInFixture();
  const ending = await blocked("SELECT departure_id FROM departures WHERE departure_id=$1 FOR UPDATE", [c.departure.departure_id],
    () => [scan(c, c.leader, c.tickets[0].ticket_code)],
    blocker => blocker.query("UPDATE departures SET status='Ended' WHERE departure_id=$1", [c.departure.departure_id]));
  assert.equal(ending[0].status, "rejected"); assert.equal(ending[0].reason.code, "CHECKIN_CLOSED");
  assert.equal((await checkInState(c.tickets[0].detail_id)).check_in_status, "Pending");
  c = await checkInFixture();
  const unassigned = await blocked("SELECT departure_id FROM departures WHERE departure_id=$1 FOR UPDATE", [c.departure.departure_id],
    () => [scan(c, c.leader, c.tickets[0].ticket_code)],
    blocker => blocker.query("DELETE FROM departure_staff WHERE dep_staff_id=$1", [c.crew.dep_staff_id]));
  assert.equal(unassigned[0].status, "rejected"); assert.equal(unassigned[0].reason.code, "NOT_FOUND");
  assert.equal((await checkInState(c.tickets[0].detail_id)).check_in_status, "Pending");
  pass("a departure Ended or a Leader unassigned while a scan waits is re-read under the lock; nothing is checked in.");

  // L02: a Leader double-tapping "end" and Admin ending the same Running departure at once.
  c = await checkInFixture();
  await db.departure.update({ where: { departure_id: c.departure.departure_id }, data: { status: "Running" } });
  const endings = await blocked("SELECT departure_id FROM departures WHERE departure_id=$1 FOR UPDATE", [c.departure.departure_id],
    () => [...Array.from({ length: 5 }, () => endLeaderDeparture(db, c.leader, c.departure.departure_id)),
      endLeaderDeparture(db, c.actors.Admin, c.departure.departure_id), scan(c, c.leader, c.tickets[0].ticket_code)], undefined, 7);
  assert.ok(endings.slice(0, 6).every(r => r.status === "fulfilled" && r.value.status === "Ended"), "every end request succeeds");
  assert.equal(endings.slice(0, 6).filter(r => r.value.changed).length, 1, "exactly one request ends the departure");
  assert.equal(await db.auditLog.count({ where: { action: "DepartureStatusChanged", record_id: String(c.departure.departure_id) } }), 1);
  const lateScan = endings[6];
  if (lateScan.status === "rejected") assert.equal(lateScan.reason.code, "CHECKIN_CLOSED");
  else assert.equal(lateScan.value.result, "CheckedIn", "a scan that won the lock before the end committed first");
  assert.equal((await db.invoiceDetail.findFirstOrThrow({ where: { detail_id: c.tickets[1].detail_id } })).status, "Valid");
  pass("6 concurrent end requests and a scan on one Running departure: one transition, one audit row, tickets untouched.");

  // I02: a retried stock receipt racing itself on one item. Retries return the first receipt, never add stock twice.
  await fixture();
  await pool.query("TRUNCATE supply_items RESTART IDENTITY CASCADE");
  const storeUser = await db.user.create({ data: { email: "hr@concurrency.example.test", password_hash: "unused",
    full_name: "HR", phone: "0901234567", role: "HRMgr" } });
  const storekeeper = { user_id: storeUser.user_id, role: "HRMgr", auth_version: 0 };
  const supply = await createSupplyItem(db, storekeeper, { name: "Concurrency water", category: "Drink", unit: "chai" });
  const receipt = { item_id: supply.item_id, quantity: 24, idempotency_key: "supply-race-key-000001" };
  const receipts = await blocked("SELECT item_id FROM supply_items WHERE item_id=$1 FOR UPDATE", [supply.item_id],
    () => Array.from({ length: 6 }, () => receiveSupply(db, storekeeper, receipt)), undefined, 6);
  assert.ok(receipts.every(r => r.status === "fulfilled"), "every retry is answered, none fails with a server error");
  assert.equal(new Set(receipts.map(r => r.value.txn_id)).size, 1, "all retries return the same receipt");
  assert.equal(await db.supplyTransaction.count(), 1);
  assert.equal((await readSupplyItem(db, storekeeper, supply.item_id)).on_hand, 24, "stock is added once");
  assert.equal(await db.auditLog.count({ where: { action: "SupplyReceived" } }), 1);
  pass("6 concurrent retries of one stock receipt: one ledger row, one audit row, stock added once.");
  console.log(`PASS: ${groups} PostgreSQL booking concurrency groups; independent connections, no remote database.`);
} finally {
  await db?.$disconnect(); await pool?.end();
  if (started) docker("rm", "--force", name);
}
