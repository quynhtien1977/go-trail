// P02 (SCRUM-32): confirming Paid/Sold/Valid from the SePay webhook, B04 overpayment and the PRD 5.2.1
// late-payment contract. P01 authentication and recording stay in payment-webhook.test.mjs.
import assert from "node:assert/strict";
import { describe, before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { recordSepayPayment } from "../src/server/services/payments.ts";
import { holdSeats } from "../src/server/services/bookings.ts";
import { SEPAY_TEST_KEY as KEY, sepayAuth as auth } from "./helpers/sepay.mjs";

const FUTURE = new Date("2035-01-01T00:00:00Z");
const PAST = new Date("2020-01-01T00:00:00Z");
const tripInput = { name: "Confirmation fixture", city: "Test", location_name: "Test", length_km: "5",
  base_price: "500000", description: "Fixture", schedule_content: "Fixture" };
let database, db, owner, buyer, rival, departure, seats, depPickup, txn;

const transfer = (code, amount, overrides = {}) => JSON.stringify({ id: ++txn, gateway: "Vietcombank",
  transactionDate: "2026-11-16 10:00:00", accountNumber: "0123499999", code, content: `${code} thanh toan`,
  transferType: "in", transferAmount: amount, accumulated: 0, subAccount: "", referenceCode: `REF${txn}`, description: "", ...overrides });
const pay = (code, amount, now) => recordSepayPayment(db, auth, transfer(code, amount), now);

// Mirrors a hold made by holdSeats: invoice Pending, seats Locked by it, one Pending ticket per seat.
async function hold(customer, seatIndexes, code, expires = FUTURE) {
  const invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: departure.departure_id,
    payment_code: code, total_amount: String(500000 * seatIndexes.length), status: "Pending", expires_at: expires,
    responsible_user_id: owner.user_id, responsible_name_snapshot: "Private owner", responsible_role_snapshot: "RouteMgr" } });
  for (const index of seatIndexes) {
    const seat = seats[index];
    await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id },
      data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until: expires } });
    await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: seat.dep_seat_id,
      dep_pickup_id: depPickup.dep_pickup_id, passenger_name: "Hành khách", passenger_phone: "0901234567",
      emergency_contact: "Người thân 0901234568", health_declaration: true, unit_price: "500000", status: "Pending" } });
  }
  return invoice;
}
// Mirrors expireHolds: the invoice expires, its tickets are cancelled and its seats released.
async function expire(invoice) {
  await db.invoice.update({ where: { invoice_id: invoice.invoice_id }, data: { status: "Expired" } });
  await db.invoiceDetail.updateMany({ where: { invoice_id: invoice.invoice_id }, data: { status: "Cancelled" } });
  await db.departureSeat.updateMany({ where: { invoice_id: invoice.invoice_id },
    data: { status: "Available", invoice_id: null, locked_until: null } });
}
async function state() {
  const [invoices, tickets, departureSeats, refunds, audits] = await Promise.all([
    db.invoice.findMany({ orderBy: { invoice_id: "asc" }, select: { invoice_id: true, status: true } }),
    db.invoiceDetail.findMany({ orderBy: { detail_id: "asc" },
      select: { detail_id: true, invoice_id: true, dep_seat_id: true, status: true, ticket_code: true } }),
    db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" }, select: { dep_seat_id: true, status: true, invoice_id: true, locked_until: true } }),
    db.refund.count(), db.auditLog.count(),
  ]);
  return { invoices, tickets, seats: departureSeats, refunds, audits };
}
const payment = id => db.payment.findUniqueOrThrow({ where: { transaction_id: String(id) } });
function assertConfirmed(after, invoiceId) {
  assert.equal(after.invoices.find(i => i.invoice_id === invoiceId).status, "Paid");
  const tickets = after.tickets.filter(t => t.invoice_id === invoiceId);
  assert.ok(tickets.length > 0);
  for (const ticket of tickets) {
    assert.equal(ticket.status, "Valid");
    assert.match(ticket.ticket_code, /^TK[0-9A-F]{20}$/);
    const seat = after.seats.find(s => s.dep_seat_id === ticket.dep_seat_id);
    assert.equal(seat.status, "Sold", "every ticket's seat is Sold");
    assert.equal(seat.invoice_id, invoiceId, "to this invoice");
    assert.equal(seat.locked_until, null, "and carries no hold deadline");
  }
  const codes = after.tickets.map(t => t.ticket_code).filter(Boolean);
  assert.equal(new Set(codes).size, codes.length, "ticket codes are unique");
  assert.equal(after.refunds, 0, "MVP never creates refunds");
}

before(async () => { database = await createTestDatabase(); db = database.client; });
// Hooks live inside describe: under --test-isolation=none a top-level beforeEach runs before every test
// of every file, which made this fixture rebuild for the whole suite.
describe("P02 confirmation (SCRUM-32)", () => {
beforeEach(async () => {
  process.env.SEPAY_API_KEY = KEY;
  txn = 5000;
  await database.sql.exec("TRUNCATE users,trips,vehicles RESTART IDENTITY CASCADE");
  owner = await db.user.create({ data: { email: "owner@confirm.example.test", password_hash: "unused",
    full_name: "Private owner", phone: "0901234567", role: "RouteMgr" } });
  buyer = await db.user.create({ data: { email: "buyer@confirm.example.test", password_hash: "unused",
    full_name: "Private buyer", phone: "0901234567", role: "Customer" } });
  rival = await db.user.create({ data: { email: "rival@confirm.example.test", password_hash: "unused",
    full_name: "Private rival", phone: "0901234567", role: "Customer" } });
  const trip = await db.trip.create({ data: tripInput });
  const vehicle = await db.vehicle.create({ data: { plate_number: "CONF-001", vehicle_type: "29", seat_count: 3 } });
  departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
    departure_date: new Date("2035-01-02T02:00:00Z"), booking_deadline: new Date("2035-01-01T02:00:00Z"),
    invoice_owner_user_id: owner.user_id } });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Điểm đón", address: "Địa chỉ" } });
  depPickup = await db.departurePickup.create({ data: { departure_id: departure.departure_id,
    pickup_id: pickup.pickup_id, pickup_time: new Date("2035-01-02T01:00:00Z") } });
  const depVehicle = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  seats = [];
  for (const [index, name] of ["A01", "A02", "A03"].entries()) {
    const seat = await db.vehicleSeat.create({ data: { vehicle_id: vehicle.vehicle_id, seat_name: name, floor_level: 1, x_position: index, y_position: 0 } });
    seats.push(await db.departureSeat.create({ data: { dep_vehicle_id: depVehicle.dep_vehicle_id, seat_id: seat.seat_id } }));
  }
});
after(async () => { await database?.close(); });

test("B04: an exact payment confirms the invoice, sells every seat and issues a unique code per ticket", async () => {
  const invoice = await hold(buyer, [0, 1], "GTEXACT0001");
  await pay("GTEXACT0001", 1_000_000);
  assert.equal((await payment(txn)).status, "Success");
  assertConfirmed(await state(), invoice.invoice_id);
});

test("B04: an overpayment confirms too, stores what actually arrived and creates no refund", async () => {
  const invoice = await hold(buyer, [0], "GTOVER00001");
  await pay("GTOVER00001", 750_000);
  const row = await payment(txn);
  assert.equal(row.status, "Success");
  assert.equal(row.amount.toFixed(0), "750000", "never rounded down to the invoice total");
  assertConfirmed(await state(), invoice.invoice_id);
});

test("B04: an underpayment is held for review and changes nothing", async () => {
  await hold(buyer, [0], "GTUNDER0001");
  const before = await state();
  await pay("GTUNDER0001", 499_999);
  assert.equal((await payment(txn)).status, "NeedsReview");
  assert.deepEqual(await state(), before);
});

test("B04: retries and concurrent deliveries of one transfer record it once and issue tickets once", async () => {
  const invoice = await hold(buyer, [0, 1], "GTRETRY0001");
  const raw = transfer("GTRETRY0001", 1_200_000);
  await recordSepayPayment(db, auth, raw);
  const issued = (await state()).tickets;
  const replays = await Promise.allSettled(Array.from({ length: 5 }, () => recordSepayPayment(db, auth, raw)));
  for (let attempt = 0; attempt < 7; attempt++) await recordSepayPayment(db, auth, raw);
  assert.ok(replays.every(r => r.status === "fulfilled"));
  assert.equal(await db.payment.count(), 1);
  assert.deepEqual((await state()).tickets, issued, "replays never re-issue or change ticket codes");
  assertConfirmed(await state(), invoice.invoice_id);
});

test("B04: an overpayment whose seat someone else now holds is held for review, without tickets", async () => {
  const lost = await hold(buyer, [0], "GTLOST00001", PAST);
  await expire(lost);
  await hold(rival, [0], "GTRIVAL0001");
  const before = await state();
  await pay("GTLOST00001", 9_000_000);
  assert.equal((await payment(txn)).status, "NeedsReview", "paying more never overrides the seat rule");
  assert.deepEqual(await state(), before, "the rival's hold, seats and tickets are untouched");
});

test("5.2.1: a late payment confirms an Expired invoice whose seats nobody took, reviving its tickets", async () => {
  const late = await hold(buyer, [0, 1], "GTLATE00001", PAST);
  await expire(late);
  await pay("GTLATE00001", 1_000_000);
  assert.equal((await payment(txn)).status, "Success");
  assertConfirmed(await state(), late.invoice_id);
});

test("5.2.1: a Pending hold past its deadline but still holding its seats is confirmed", async () => {
  const stale = await hold(buyer, [0], "GTSTALE0001", PAST);
  await pay("GTSTALE0001", 500_000);
  assert.equal((await payment(txn)).status, "Success");
  assertConfirmed(await state(), stale.invoice_id);
});

test("5.2.1: if even one seat was sold to someone else, nothing is confirmed — no partial sale", async () => {
  const late = await hold(buyer, [0, 1], "GTPART00001", PAST);
  await expire(late);
  const sold = await hold(rival, [1], "GTSOLD00001");
  await pay("GTSOLD00001", 500_000);
  const before = await state();
  await pay("GTPART00001", 1_000_000);
  assert.equal((await payment(txn)).status, "NeedsReview");
  assert.deepEqual(await state(), before, "seat A01 stays Available: confirmation is all-or-nothing");
  assert.equal((await state()).invoices.find(i => i.invoice_id === sold.invoice_id).status, "Paid");
});

test("a second transfer for an invoice already Paid is held for review and never re-issues tickets", async () => {
  await hold(buyer, [0], "GTTWICE0001");
  await pay("GTTWICE0001", 500_000);
  const before = await state();
  await pay("GTTWICE0001", 500_000);
  assert.equal((await payment(txn)).status, "NeedsReview");
  assert.deepEqual(await state(), before);
});

test("a departure outside its selling phase, or already departed, never gains a confirmed ticket", async () => {
  for (const status of ["Draft", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) {
    await db.payment.deleteMany({});
    await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status } });
    const code = `GTDEP${status.slice(0, 6).toUpperCase().padEnd(6, "X")}`;
    // Seats reference invoices, so release them before removing the previous iteration's fixture.
    await db.departureSeat.updateMany({ data: { status: "Available", invoice_id: null, locked_until: null } });
    await db.invoiceDetail.deleteMany({}); await db.invoice.deleteMany({});
    await hold(buyer, [0], code);
    const before = await state();
    await pay(code, 500_000);
    assert.equal((await payment(txn)).status, "NeedsReview", `departure ${status} must not confirm`);
    assert.deepEqual(await state(), before);
  }
  await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status: "Open" } });
  await hold(buyer, [1], "GTGONE00001");
  await pay("GTGONE00001", 500_000, new Date("2036-01-01T00:00:00Z"));
  assert.equal((await payment(txn)).status, "NeedsReview", "a departure date already passed must not confirm");

  await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status: "Closed" } });
  const closed = await hold(buyer, [2], "GTCLOSE0001");
  await pay("GTCLOSE0001", 500_000);
  assert.equal((await payment(txn)).status, "Success", "Closed is still the selling phase for a hold made before the deadline");
  assertConfirmed(await state(), closed.invoice_id);
});

test("a legacy Cancelled invoice and an invoice without tickets are held for review", async () => {
  const legacy = await hold(buyer, [0], "GTLEGACY001");
  await db.invoice.update({ where: { invoice_id: legacy.invoice_id }, data: { status: "Cancelled" } });
  await db.invoice.create({ data: { customer_id: buyer.user_id, departure_id: departure.departure_id, payment_code: "GTEMPTY0001",
    total_amount: "500000", status: "Pending", expires_at: FUTURE } });
  const before = await state();
  await pay("GTLEGACY001", 500_000);
  assert.equal((await payment(txn)).status, "NeedsReview");
  await pay("GTEMPTY0001", 500_000);
  assert.equal((await payment(txn)).status, "NeedsReview");
  assert.deepEqual(await state(), before);
});

test("money is never dropped: when a database guard refuses the sale, the transfer is still recorded for review", async () => {
  // Inconsistent data that the active-ticket unique index exists to stop: a stray active ticket on a free seat.
  const late = await hold(buyer, [0], "GTGUARD0001", PAST);
  await expire(late);
  const stray = await db.invoice.create({ data: { customer_id: rival.user_id, departure_id: departure.departure_id,
    payment_code: "GTSTRAY0001", total_amount: "500000", status: "Pending", expires_at: FUTURE } });
  await db.invoiceDetail.create({ data: { invoice_id: stray.invoice_id, dep_seat_id: seats[0].dep_seat_id,
    dep_pickup_id: depPickup.dep_pickup_id, passenger_name: "Stray", passenger_phone: "0901234567",
    emergency_contact: "Stray 0901234568", health_declaration: true, unit_price: "500000", status: "Pending" } });
  const before = await state();
  assert.deepEqual(await pay("GTGUARD0001", 500_000), { success: true }, "SePay is still acknowledged");
  const row = await payment(txn);
  assert.equal(row.status, "NeedsReview");
  assert.equal(row.invoice_id, late.invoice_id);
  assert.deepEqual(await state(), before, "the refused confirmation rolled back completely");
});

test("two different transfers racing for one invoice confirm it exactly once", async () => {
  const invoice = await hold(buyer, [0, 1], "GTRACE00001");
  const results = await Promise.allSettled([pay("GTRACE00001", 1_000_000), pay("GTRACE00001", 1_000_000)]);
  assert.ok(results.every(r => r.status === "fulfilled"));
  const statuses = (await db.payment.findMany({ orderBy: { payment_id: "asc" } })).map(r => r.status).sort();
  assert.deepEqual(statuses, ["NeedsReview", "Success"]);
  assertConfirmed(await state(), invoice.invoice_id);
});

test("a late payment and a new hold racing for the same free seat never both win", async () => {
  const late = await hold(buyer, [0], "GTRACEH0001", PAST);
  await expire(late);
  const rivalActor = { user_id: rival.user_id, role: "Customer", auth_version: 0 };
  const holdInput = { idempotency_key: "race_hold_key_0001", seats: [{ dep_seat_id: seats[0].dep_seat_id,
    dep_pickup_id: depPickup.dep_pickup_id, passenger_name: "Rival", passenger_phone: "0901234567",
    emergency_contact: "Rival 0901234568", health_declaration: true }] };
  const [paid, held] = await Promise.allSettled([pay("GTRACEH0001", 500_000),
    holdSeats(db, rivalActor, departure.departure_id, holdInput)]);
  assert.equal(paid.status, "fulfilled", "SePay is always acknowledged");
  const after = await state();
  const seat = after.seats.find(s => s.dep_seat_id === seats[0].dep_seat_id);
  const lateWon = (await payment(txn)).status === "Success";
  if (lateWon) {
    assert.equal(held.status, "rejected", "the rival cannot hold a seat that was just sold");
    assert.equal(seat.invoice_id, late.invoice_id);
  } else {
    assert.equal(held.status, "fulfilled");
    assert.notEqual(seat.invoice_id, late.invoice_id);
  }
  const active = after.tickets.filter(t => t.status !== "Cancelled" && t.invoice_id !== null);
  assert.ok(active.length <= 1, "one seat never carries two active tickets");
});
});
