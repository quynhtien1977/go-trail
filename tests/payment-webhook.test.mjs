import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { recordSepayPayment } from "../src/server/services/payments.ts";

let database, db, invoice, customer, owner, departure;
const KEY = "sepay-test-key-0123456789";
const auth = `Apikey ${KEY}`;
const tripInput = { name: "Webhook fixture", city: "Test", location_name: "Test", length_km: "5",
  base_price: "500000", description: "Fixture", schedule_content: "Fixture" };

function body(overrides = {}) {
  return JSON.stringify({
    id: 92704, gateway: "Vietcombank", transactionDate: "2026-11-11 14:02:37",
    accountNumber: "0123499999", code: "GOTRAIL001", content: "GOTRAIL001 thanh toan",
    transferType: "in", transferAmount: 500000, accumulated: 19077000,
    subAccount: null, referenceCode: "MBVCB.3278907687", description: "",
    ...overrides,
  });
}
async function snapshot() {
  const [invoices, details, seats, audits] = await Promise.all([
    db.invoice.findMany({ orderBy: { invoice_id: "asc" }, select: { invoice_id: true, status: true, expires_at: true } }),
    db.invoiceDetail.findMany({ orderBy: { detail_id: "asc" }, select: { detail_id: true, status: true, ticket_code: true } }),
    db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" }, select: { dep_seat_id: true, status: true, locked_until: true, invoice_id: true } }),
    db.auditLog.count(),
  ]);
  return JSON.stringify({ invoices, details, seats, audits });
}

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  process.env.SEPAY_API_KEY = KEY;
  await database.sql.exec("TRUNCATE users,trips,vehicles RESTART IDENTITY CASCADE");
  owner = await db.user.create({ data: { email: "owner@pay.example.test", password_hash: "unused",
    full_name: "Private owner", phone: "0901234567", role: "RouteMgr" } });
  customer = await db.user.create({ data: { email: "buyer@pay.example.test", password_hash: "unused",
    full_name: "Private buyer", phone: "0901234567", role: "Customer" } });
  const trip = await db.trip.create({ data: tripInput });
  const vehicle = await db.vehicle.create({ data: { plate_number: "PAY-001", vehicle_type: "29", seat_count: 1 } });
  const seat = await db.vehicleSeat.create({ data: { vehicle_id: vehicle.vehicle_id, seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 } });
  departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
    departure_date: new Date("2035-01-02T02:00:00Z"), booking_deadline: new Date("2035-01-01T02:00:00Z"),
    invoice_owner_user_id: owner.user_id } });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Điểm đón", address: "Địa chỉ" } });
  const depPickup = await db.departurePickup.create({ data: { departure_id: departure.departure_id,
    pickup_id: pickup.pickup_id, pickup_time: new Date("2035-01-02T01:00:00Z") } });
  const depVehicle = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  const depSeat = await db.departureSeat.create({ data: { dep_vehicle_id: depVehicle.dep_vehicle_id, seat_id: seat.seat_id } });
  invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: departure.departure_id,
    payment_code: "GOTRAIL001", total_amount: "500000", status: "Pending",
    expires_at: new Date("2035-01-01T00:00:00Z"), responsible_user_id: owner.user_id,
    responsible_name_snapshot: "Private owner", responsible_role_snapshot: "RouteMgr" } });
  await db.departureSeat.update({ where: { dep_seat_id: depSeat.dep_seat_id },
    data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until: new Date("2035-01-01T00:00:00Z") } });
  await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: depSeat.dep_seat_id,
    dep_pickup_id: depPickup.dep_pickup_id,
    passenger_name: "Hành khách", passenger_phone: "0901234567", emergency_contact: "Người thân 0901234568",
    health_declaration: true, unit_price: "500000", status: "Pending" } });
});
after(async () => { await database?.close(); });

test("a wrong, missing or malformed API key is rejected before anything is recorded", async () => {
  const before = await snapshot();
  for (const header of [null, "", "Apikey", "Apikey ", "Bearer " + KEY, "Apikey wrong-key-0123456789", `apikey ${KEY}`,
    `Apikey ${KEY}x`, `Apikey x${KEY}`, KEY]) {
    await assert.rejects(recordSepayPayment(db, header, body()), e => e.status === 401 && e.code === "UNAUTHENTICATED",
      `header must be rejected: ${JSON.stringify(header)}`);
  }
  // A key of the same length but different bytes must not pass the constant-time comparison.
  await assert.rejects(recordSepayPayment(db, `Apikey ${"x".repeat(KEY.length)}`, body()), e => e.status === 401);
  assert.equal(await db.payment.count(), 0, "no payment row may exist after an unauthenticated call");
  assert.equal(await snapshot(), before);
});

test("surrounding whitespace in the header value is tolerated, the key bytes are not", async () => {
  // Deliberate: transports may pad the header. Whitespace carries no entropy, the key must still match exactly.
  assert.deepEqual(await recordSepayPayment(db, `Apikey ${KEY}  `, body()), { success: true });
  assert.equal(await db.payment.count(), 1);
  await assert.rejects(recordSepayPayment(db, `Apikey ${KEY.toUpperCase()}`, body({ id: 2 })), e => e.status === 401);
  assert.equal(await db.payment.count(), 1);
});

test("an unset SEPAY_API_KEY fails closed instead of accepting every caller", async () => {
  delete process.env.SEPAY_API_KEY;
  await assert.rejects(recordSepayPayment(db, auth, body()), e => e.status === 401);
  process.env.SEPAY_API_KEY = "";
  await assert.rejects(recordSepayPayment(db, auth, body()), e => e.status === 401);
  assert.equal(await db.payment.count(), 0);
});

test("only incoming transfers are recorded; outgoing ones are acknowledged and ignored", async () => {
  const before = await snapshot();
  assert.deepEqual(await recordSepayPayment(db, auth, body({ transferType: "out" })), { success: true });
  assert.equal(await db.payment.count(), 0, "an outgoing transfer must not create a payment row");
  assert.equal(await snapshot(), before);

  assert.deepEqual(await recordSepayPayment(db, auth, body()), { success: true });
  assert.equal(await db.payment.count(), 1);
});

test("a recorded payment keeps the received amount, the raw payload and the matched invoice", async () => {
  const raw = body({ transferAmount: 750000 });
  await recordSepayPayment(db, auth, raw);
  const row = await db.payment.findUniqueOrThrow({ where: { transaction_id: "92704" } });
  assert.equal(row.invoice_id, invoice.invoice_id);
  assert.equal(row.amount.toFixed(0), "750000", "stores what actually arrived, never the invoice total (B04)");
  assert.equal(row.payment_method, "BankTransfer");
  assert.equal(row.reference_code, "MBVCB.3278907687");
  assert.equal(row.raw_payload, raw, "the body is kept verbatim for reconciliation");
  assert.equal(row.status, "NeedsReview", "P01 records only; confirming Paid/Sold/Valid is P02");
});

test("a transfer whose code matches no invoice is still recorded, with no invoice attached", async () => {
  for (const code of [null, "", "   ", "NOPE999"]) {
    await db.payment.deleteMany({});
    await recordSepayPayment(db, auth, body({ code }));
    const row = await db.payment.findUniqueOrThrow({ where: { transaction_id: "92704" } });
    assert.equal(row.invoice_id, null, `code ${JSON.stringify(code)} must not attach an invoice`);
    assert.equal(row.status, "NeedsReview");
  }
});

test("retries of the same transaction_id acknowledge without writing a second row", async () => {
  for (let attempt = 0; attempt < 7; attempt++) {
    assert.deepEqual(await recordSepayPayment(db, auth, body()), { success: true });
  }
  assert.equal(await db.payment.count(), 1, "SePay retries up to 7 times; exactly one row may exist");

  // A retry whose body differs must not overwrite or duplicate the first durable record.
  await recordSepayPayment(db, auth, body({ transferAmount: 999000, referenceCode: "CHANGED" }));
  const rows = await db.payment.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount.toFixed(0), "500000");
  assert.equal(rows[0].reference_code, "MBVCB.3278907687");
});

test("concurrent deliveries of one transaction_id still produce exactly one row", async () => {
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => recordSepayPayment(db, auth, body())));
  assert.deepEqual(results.map(r => r.status), Array(5).fill("fulfilled"), "every concurrent delivery is acknowledged");
  assert.equal(await db.payment.count(), 1);
});

test("different transactions for the same invoice are recorded separately", async () => {
  await recordSepayPayment(db, auth, body({ id: 1 }));
  await recordSepayPayment(db, auth, body({ id: "2" }));
  const rows = await db.payment.findMany({ orderBy: { payment_id: "asc" } });
  assert.deepEqual(rows.map(r => r.transaction_id), ["1", "2"]);
  assert.deepEqual([...new Set(rows.map(r => r.invoice_id))], [invoice.invoice_id]);
});

test("a malformed or out-of-contract payload is refused and records nothing", async () => {
  const before = await snapshot();
  const bad = [
    "", "not json", "[]", "null", "123",
    body({ id: 0 }), body({ id: -1 }), body({ id: 1.5 }), body({ id: "" }), body({ id: "abc" }),
    JSON.stringify({ transferType: "in", transferAmount: 1 }),
    body({ transferType: "IN" }), body({ transferType: "deposit" }), body({ transferType: null }),
    body({ transferAmount: -1 }), body({ transferAmount: 1.5 }), body({ transferAmount: "500000" }),
    body({ transferAmount: 100_000_000_000_000 }),
    body({ code: "x".repeat(101) }), body({ referenceCode: "y".repeat(101) }),
  ];
  for (const raw of bad) {
    await assert.rejects(recordSepayPayment(db, auth, raw), e => e.status === 422 && e.code === "INVALID_INPUT",
      `payload must be refused: ${raw.slice(0, 60)}`);
  }
  assert.equal(await db.payment.count(), 0);
  assert.equal(await snapshot(), before);
});

test("recording never changes the invoice, its seats, its tickets or the audit log", async () => {
  const before = await snapshot();
  await recordSepayPayment(db, auth, body());
  await recordSepayPayment(db, auth, body({ id: 92705, transferAmount: 10_000_000 }));
  await recordSepayPayment(db, auth, body({ id: 92706, code: "NOPE999" }));
  assert.equal(await snapshot(), before, "P01 must leave invoice, seat, ticket and audit rows untouched");
  assert.equal(await db.payment.count(), 3);
});
