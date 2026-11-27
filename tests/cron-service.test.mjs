import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { holdSeats } from "../src/server/services/bookings.ts";
import { closeDepartures, expireInvoices } from "../src/server/services/cron.ts";

const secret = "fixture-cron-secret-0123456789abcdef";
const authorization = `Bearer ${secret}`;
const now = new Date("2034-01-01T00:00:00Z");
const at = minutes => new Date(now.getTime() + minutes * 60_000);
let database, db, buyer, owner, trip, pickup, vehicle;
let savedSecret;

async function departure(deadline = new Date("2035-01-01T00:00:00Z"), withSeats = true) {
  const result = await db.departure.create({ data: { trip_id: trip.trip_id,
    departure_date: new Date("2035-01-02T00:00:00Z"), booking_deadline: deadline,
    min_passengers: 1, status: "Open", invoice_owner_user_id: owner.user_id,
    pickups: { create: { pickup_id: pickup.pickup_id, pickup_time: new Date("2035-01-02T00:00:00Z") } } },
    include: { pickups: true } });
  let seats = [];
  if (withSeats) {
    const assignment = await db.departureVehicle.create({ data: { departure_id: result.departure_id, vehicle_id: vehicle.vehicle_id } });
    await db.departureSeat.createMany({ data: vehicle.seats.map(seat => ({ dep_vehicle_id: assignment.dep_vehicle_id, seat_id: seat.seat_id })) });
    seats = await db.departureSeat.findMany({ where: { dep_vehicle_id: assignment.dep_vehicle_id }, orderBy: { dep_seat_id: "asc" } });
  }
  const hold = (indexes, key, time) => holdSeats(db, buyer, result.departure_id, { idempotency_key: key,
    seats: indexes.map(index => ({ dep_seat_id: seats[index].dep_seat_id, dep_pickup_id: result.pickups[0].dep_pickup_id,
      passenger_name: "Fixture", passenger_phone: "0901234567", emergency_contact: "Fixture", health_declaration: true })) }, time);
  return { ...result, seats, hold };
}

before(async () => {
  savedSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = secret;
  database = await createTestDatabase();
  // Fixtures use Prisma Date values; keep the isolated database in the project's UTC storage convention.
  await database.sql.exec("SET TIME ZONE 'UTC'");
  db = database.client;
});
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, system_settings RESTART IDENTITY CASCADE");
  const makeUser = (email, role) => db.user.create({ data: { email, role, full_name: role, password_hash: "unused", phone: "0901234567" } });
  const customer = await makeUser("customer@cron.example.test", "Customer");
  const manager = await makeUser("manager@cron.example.test", "RouteMgr");
  buyer = { user_id: customer.user_id, role: "Customer", auth_version: 0 };
  owner = { user_id: manager.user_id, role: "RouteMgr", auth_version: 0 };
  trip = await db.trip.create({ data: { name: "Fixture", city: "Test", location_name: "Test", length_km: "5",
    base_price: "500000", description: "Fixture", schedule_content: "Fixture" } });
  pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Test", address: "Test" } });
  vehicle = await db.vehicle.create({ data: { plate_number: "CRON-FIXTURE", vehicle_type: "Fixture", seat_count: 4,
    seats: { create: Array.from({ length: 4 }, (_, i) => ({ seat_name: `A0${i + 1}`, floor_level: 1, x_position: i, y_position: 0 })) } },
    include: { seats: { orderBy: { seat_id: "asc" } } } });
});
after(async () => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret;
  await database?.close();
});

test("cron requires its own secret before either job writes anything", async () => {
  const dep = await departure(at(-1));
  for (const value of [null, "Bearer invalid", ""]) {
    await assert.rejects(expireInvoices(db, value, now), { code: "UNAUTHENTICATED" });
    await assert.rejects(closeDepartures(db, value, now), { code: "UNAUTHENTICATED" });
  }
  assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: dep.departure_id } })).status, "Open");
  assert.equal(await db.auditLog.count(), 0);
});

test("expiration releases only the expired invoice's own hold, and retries are idempotent", async () => {
  const dep = await departure();
  const expired = await dep.hold([0, 1], "cron-expired-key-0001", at(-15));
  const foreign = await db.invoice.create({ data: { customer_id: buyer.user_id, departure_id: dep.departure_id,
    payment_code: "GTFOREIGN", total_amount: "500000", expires_at: at(15) } });
  // Reassignment simulates a stale ticket; the original invoice no longer owns seat 0.
  await db.departureSeat.update({ where: { dep_seat_id: dep.seats[0].dep_seat_id }, data: { invoice_id: foreign.invoice_id, locked_until: at(15) } });
  assert.deepEqual(await expireInvoices(db, authorization, now), { processed: 1, batch_full: false });
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: expired.invoice_id } })).status, "Expired");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: foreign.invoice_id } })).status, "Pending");
  assert.ok((await db.invoiceDetail.findMany({ where: { invoice_id: expired.invoice_id } })).every(row => row.status === "Cancelled"));
  const seats = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
  assert.deepEqual([seats[0].status, seats[0].invoice_id], ["Locked", foreign.invoice_id]);
  assert.deepEqual([seats[1].status, seats[1].invoice_id, seats[1].locked_until], ["Available", null, null]);
  assert.deepEqual(await expireInvoices(db, authorization, now), { processed: 0, batch_full: false });
});

test("expiry leaves live Pending and Paid/Valid/Sold data intact, including inconsistent Pending records", async () => {
  const dep = await departure();
  const paid = await dep.hold([0], "cron-paid-key-000001", at(-30));
  const valid = await dep.hold([1], "cron-valid-key-00001", at(-30));
  const sold = await dep.hold([2], "cron-sold-key-000001", at(-30));
  const live = await dep.hold([3], "cron-live-key-000001", now);
  await db.invoice.update({ where: { invoice_id: paid.invoice_id }, data: { status: "Paid" } });
  await db.invoiceDetail.updateMany({ where: { invoice_id: { in: [paid.invoice_id, valid.invoice_id] } }, data: { status: "Valid" } });
  await db.departureSeat.updateMany({ where: { invoice_id: { in: [paid.invoice_id, sold.invoice_id] } }, data: { status: "Sold", locked_until: null } });
  assert.deepEqual(await expireInvoices(db, authorization, now), { processed: 0, batch_full: false });
  assert.deepEqual((await db.invoice.findMany({ orderBy: { invoice_id: "asc" } })).map(row => row.status), ["Paid", "Pending", "Pending", "Pending"]);
  assert.deepEqual((await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } })).map(row => row.status), ["Sold", "Locked", "Sold", "Locked"]);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: live.invoice_id } })).status, "Pending");
});

test("expiry uses bounded batches and later runs finish remaining invoices", async () => {
  const dep = await departure();
  await db.invoice.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ customer_id: buyer.user_id,
    departure_id: dep.departure_id, payment_code: `GTBATCH${i}`, total_amount: "0", expires_at: at(-1) })) });
  assert.deepEqual(await expireInvoices(db, authorization, now), { processed: 50, batch_full: true });
  assert.deepEqual(await expireInvoices(db, authorization, now), { processed: 1, batch_full: false });
  assert.equal(await db.invoice.count({ where: { status: "Pending" } }), 0);
});

test("cron compares UTC instants correctly even when the database session timezone differs", async () => {
  const dep = await departure(at(1));
  const expired = await dep.hold([0], "cron-utc-expired-001", at(-15));
  const live = await dep.hold([1], "cron-utc-pending-001", now);
  const laterDeparture = await departure(at(2));
  await db.departure.update({ where: { departure_id: dep.departure_id }, data: { booking_deadline: now } });
  await database.sql.exec("SET TIME ZONE 'Asia/Ho_Chi_Minh'");
  try {
    assert.equal((await expireInvoices(db, authorization, now)).processed, 1);
    assert.equal((await closeDepartures(db, authorization, now)).processed, 1);
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: expired.invoice_id } })).status, "Expired");
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: live.invoice_id } })).status, "Pending");
    assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: dep.departure_id } })).status, "Closed");
    assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: laterDeparture.departure_id } })).status, "Open");
  } finally { await database.sql.exec("SET TIME ZONE 'UTC'"); }
});

test("close only deadline-passed or entirely Sold departures, records system audit and is idempotent", async () => {
  const deadline = await departure(at(1));
  const full = await departure();
  const pending = await departure();
  const empty = await departure(undefined, false);
  const dueHold = await deadline.hold([0], "cron-due-hold-key-01", now);
  await db.departure.update({ where: { departure_id: deadline.departure_id }, data: { booking_deadline: now } });
  const paid = await full.hold([0, 1, 2, 3], "cron-full-key-000001", at(-30));
  await db.invoice.update({ where: { invoice_id: paid.invoice_id }, data: { status: "Paid" } });
  await db.departureSeat.updateMany({ where: { invoice_id: paid.invoice_id }, data: { status: "Sold", locked_until: null } });
  await pending.hold([0, 1, 2, 3], "cron-pending-key-001", now);
  assert.deepEqual(await closeDepartures(db, authorization, now), { processed: 2, batch_full: false });
  const statuses = (await db.departure.findMany({ orderBy: { departure_id: "asc" } })).map(row => row.status);
  assert.deepEqual(statuses, ["Closed", "Closed", "Open", "Open"]);
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: dueHold.invoice_id } })).status, "Pending");
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: deadline.seats[0].dep_seat_id } })).status, "Locked");
  const audits = await db.auditLog.findMany({ orderBy: { record_id: "asc" } });
  assert.equal(audits.length, 2);
  assert.deepEqual(audits.map(row => [row.user_id, row.action, row.table_name, JSON.parse(row.description).reason]),
    [[null, "DepartureStatusChanged", "departures", "deadline"], [null, "DepartureStatusChanged", "departures", "sold_out"]]);
  assert.deepEqual(await closeDepartures(db, authorization, now), { processed: 0, batch_full: false });
  assert.equal(await db.auditLog.count(), 2);
  assert.ok(deadline.departure_id && empty.departure_id);
});

test("closing departures rolls back when the system audit cannot be written", async () => {
  const dep = await departure(at(-1));
  await database.sql.exec(`CREATE FUNCTION reject_cron_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$;
    CREATE TRIGGER reject_cron_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_cron_audit();`);
  try {
    await assert.rejects(closeDepartures(db, authorization, now));
    assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: dep.departure_id } })).status, "Open");
    assert.equal(await db.auditLog.count(), 0);
  } finally {
    await database.sql.exec("DROP TRIGGER reject_cron_audit ON audit_logs; DROP FUNCTION reject_cron_audit();");
  }
});
