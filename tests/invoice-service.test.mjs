import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { readCustomerInvoice } from "../src/server/services/account-data.ts";

let database, db, actors, invoice;
const now = new Date("2030-01-01T00:00:00.000Z");
const bankKeys = ["BANK_ID", "BANK_ACCOUNT_NUMBER", "BANK_ACCOUNT_NAME"];
const originalEnv = Object.fromEntries(bankKeys.map(key => [key, process.env[key]]));
const demoBank = { BANK_ID: "970436", BANK_ACCOUNT_NUMBER: "0000000000", BANK_ACCOUNT_NAME: "GO TRAIL TEST" };
const paymentCode = "GT1234567890";
const expectedInvoiceKeys = ["invoice_id", "departure_id", "payment_code", "status", "total_amount", "expires_at", "created_at",
  "responsible_name_snapshot", "responsible_role_snapshot", "customer_name", "departure", "tickets", "server_time", "payment"].sort();

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  Object.assign(process.env, demoBank);
  await database.sql.exec("TRUNCATE users, trips, vehicles, system_settings RESTART IDENTITY CASCADE");
  actors = {};
  for (const role of ["Customer", "OtherCustomer", "RouteMgr", "OtherRouteMgr", "HRMgr", "Leader", "Admin"]) {
    const user = await db.user.create({ data: { email: `${role}@invoice.example.test`, password_hash: "private-fixture-hash",
      full_name: `${role} Name`, phone: "0901234567", role: role.replace("Other", "") } });
    actors[role] = { user_id: user.user_id, role: user.role, auth_version: 0 };
  }
  const trip = await db.trip.create({ data: { name: "Invoice trail", city: "Tây Ninh", location_name: "Mountain",
    length_km: "5", base_price: "500000", description: "Fixture", schedule_content: "Fixture" } });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Pickup", address: "Pickup address" } });
  const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
    invoice_owner_user_id: actors.RouteMgr.user_id, departure_date: new Date("2030-01-02T07:00:00+07:00"), booking_deadline: new Date("2030-01-01T16:00:00Z"),
    pickups: { create: { pickup_id: pickup.pickup_id, pickup_time: new Date("2030-01-02T06:30:00+07:00") } } }, include: { pickups: true } });
  const vehicle = await db.vehicle.create({ data: { plate_number: "INVOICE-TEST", vehicle_type: "Test bus", seat_count: 2,
    seats: { create: [0, 1].map(x_position => ({ seat_name: `A0${x_position + 1}`, floor_level: 1, x_position, y_position: 0 })) } }, include: { seats: true } });
  const assigned = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  invoice = await db.invoice.create({ data: { customer_id: actors.Customer.user_id, departure_id: departure.departure_id,
    payment_code: paymentCode, total_amount: "1000000", created_at: now, expires_at: new Date("2030-01-01T00:15:00Z"),
    responsible_user_id: actors.RouteMgr.user_id, responsible_name_snapshot: "Original employee", responsible_role_snapshot: "RouteMgr",
    idempotency_key: "invoice-test-key-0001" } });
  // Reverse insertion order: the DTO must provide deterministic seat order.
  for (const seat of [...vehicle.seats].reverse()) {
    const depSeat = await db.departureSeat.create({ data: { dep_vehicle_id: assigned.dep_vehicle_id, seat_id: seat.seat_id,
      status: "Locked", invoice_id: invoice.invoice_id, locked_until: invoice.expires_at } });
    await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: depSeat.dep_seat_id,
      dep_pickup_id: departure.pickups[0].dep_pickup_id, passenger_name: `${seat.seat_name} passenger`, passenger_phone: "0909999999",
      emergency_contact: "Private emergency contact", health_declaration: true, unit_price: "500000" } });
  }
});
after(async () => {
  for (const key of bankKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
  await database?.close();
});

const read = (actor = actors.Customer, date = now) => readCustomerInvoice(db, actor, invoice.invoice_id, date);
test("K03 returns an allowlisted invoice DTO and exact server-derived VietQR instructions", async () => {
  const result = await read();
  assert.deepEqual(Object.keys(result).sort(), expectedInvoiceKeys);
  assert.equal(result.total_amount, "1000000");
  assert.equal(result.customer_name, "Customer Name");
  assert.equal(result.responsible_name_snapshot, "Original employee");
  assert.equal(result.responsible_role_snapshot, "RouteMgr");
  assert.equal(result.created_at, now.toISOString());
  assert.equal(result.expires_at, "2030-01-01T00:15:00.000Z");
  assert.equal(result.server_time, now.toISOString());
  assert.equal(result.departure.trip_name, "Invoice trail");
  assert.equal(result.departure.departure_date, "2030-01-02T00:00:00.000Z");
  assert.deepEqual(result.tickets.map(t => t.dep_seat_id), [...result.tickets.map(t => t.dep_seat_id)].sort((a, b) => a - b));
  for (const ticket of result.tickets) {
    assert.equal(ticket.unit_price, "500000"); assert.equal(ticket.pickup_name, "Pickup");
    assert.equal(ticket.pickup_time, "2030-01-01T23:30:00.000Z"); assert.equal(ticket.status, "Pending");
    assert.deepEqual(Object.keys(ticket).sort(), ["detail_id", "dep_seat_id", "dep_pickup_id", "seat_name", "passenger_name", "unit_price", "status", "pickup_name", "pickup_address", "pickup_time"].sort());
  }
  assert.equal(result.payment.status, "Ready");
  assert.deepEqual(Object.keys(result.payment).sort(), ["status", "bank_id", "account_number", "account_name", "amount", "transfer_content", "qr_url"].sort());
  assert.equal(result.payment.amount, result.total_amount); assert.equal(result.payment.transfer_content, paymentCode);
  assert.equal(result.payment.bank_id, demoBank.BANK_ID); assert.equal(result.payment.account_number, demoBank.BANK_ACCOUNT_NUMBER);
  assert.equal(result.payment.account_name, demoBank.BANK_ACCOUNT_NAME);
  const url = new URL(result.payment.qr_url);
  assert.equal(url.origin, "https://vietqr.app"); assert.equal(url.pathname, "/img");
  assert.equal(url.searchParams.get("amount"), result.total_amount); assert.equal(url.searchParams.get("des"), paymentCode);
  assert.equal(url.searchParams.get("acc"), demoBank.BANK_ACCOUNT_NUMBER); assert.equal(url.searchParams.get("bank"), demoBank.BANK_ID);
  assert.equal(url.searchParams.get("holder"), demoBank.BANK_ACCOUNT_NAME);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["acc", "bank", "amount", "des", "holder", "template"].sort());
  const serialized = JSON.stringify(result);
  for (const privateValue of ["private-fixture-hash", "Private emergency contact", "0909999999", "invoice.example.test", invoice.idempotency_key]) assert.ok(!serialized.includes(privateValue));
  assert.doesNotMatch(serialized, /password_hash|auth_version|responsible_user_id|customer_id|passenger_phone|emergency_contact|health_declaration|raw_payload|payments|refunds|ticket_code|SEPAY_API_KEY|AUTH_SECRET/);
});

test("K03 permits owner/Admin only and revalidates DB identity rather than the supplied role", async () => {
  await read(actors.Admin);
  await assert.rejects(read(actors.OtherCustomer), { code: "NOT_FOUND", status: 404 });
  await assert.rejects(read({ ...actors.OtherCustomer, role: "Admin" }), { code: "NOT_FOUND" });
  for (const role of ["RouteMgr", "OtherRouteMgr", "HRMgr", "Leader"]) await assert.rejects(read(actors[role]), { code: "FORBIDDEN", status: 403 });
  await assert.rejects(read(null), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: actors.Customer.user_id }, data: { status: "Locked" } });
  await assert.rejects(read(), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: actors.Customer.user_id }, data: { status: "Active", auth_version: 1 } });
  await assert.rejects(read(), { code: "UNAUTHENTICATED" });
});

test("K03 snapshots survive employee rename, role/status change and departure reassignment", async () => {
  const original = await read();
  assert.equal(original.responsible_name_snapshot, "Original employee");
  assert.equal(original.responsible_role_snapshot, "RouteMgr");
  await db.user.update({ where: { user_id: actors.RouteMgr.user_id }, data: { full_name: "Changed employee", role: "HRMgr", status: "Locked", auth_version: 1 } });
  await db.departure.update({ where: { departure_id: invoice.departure_id }, data: { invoice_owner_user_id: actors.OtherRouteMgr.user_id } });
  assert.deepEqual(await read(), original);
});

test("K03 keeps legacy NULL snapshots visible without inventing an employee", async () => {
  await db.invoice.update({ where: { invoice_id: invoice.invoice_id }, data: { idempotency_key: null,
    responsible_user_id: null, responsible_name_snapshot: null, responsible_role_snapshot: null } });
  const result = await read();
  assert.equal(result.responsible_name_snapshot, null); assert.equal(result.responsible_role_snapshot, null);
});

test("K03 expiry boundary disables transfers without cleaning holds or changing stored state", async () => {
  const fingerprint = async () => JSON.stringify(await Promise.all([db.invoice.findMany(), db.invoiceDetail.findMany(), db.departureSeat.findMany(), db.auditLog.findMany()]));
  const before = await fingerprint();
  assert.equal((await read(actors.Customer, new Date(invoice.expires_at.getTime() - 1))).payment.status, "Ready");
  for (const date of [invoice.expires_at, new Date(invoice.expires_at.getTime() + 1)]) {
    const result = await read(actors.Customer, date);
    assert.equal(result.status, "Pending"); assert.deepEqual(result.payment, { status: "Expired" });
    assert.equal(result.expires_at, invoice.expires_at.toISOString());
  }
  assert.equal(await fingerprint(), before);
});

test("K03 never offers payment for Paid/Expired/legacy Cancelled even with a future expiry", async () => {
  for (const status of ["Paid", "Expired", "Cancelled"]) {
    await db.invoice.update({ where: { invoice_id: invoice.invoice_id }, data: { status } });
    assert.deepEqual((await read()).payment, { status: status === "Expired" ? "Expired" : "NotPayable" });
  }
});

test("K03 missing or malformed bank config keeps invoice readable without partial instructions or secret leaks", async () => {
  for (const key of bankKeys) {
    delete process.env[key];
    assert.deepEqual((await read()).payment, { status: "Unavailable" });
    Object.assign(process.env, demoBank);
  }
  for (const change of [{ BANK_ID: "https://evil.example.test" }, { BANK_ID: "VCB&acc=1" }, { BANK_ACCOUNT_NUMBER: "0".repeat(20) },
    { BANK_ACCOUNT_NUMBER: "123&amount=1" }, { BANK_ACCOUNT_NAME: "NAME\nAUTH_SECRET=private" }, { BANK_ACCOUNT_NAME: "N".repeat(81) }]) {
    Object.assign(process.env, change);
    const result = await read();
    assert.equal(result.invoice_id, invoice.invoice_id); assert.deepEqual(result.payment, { status: "Unavailable" });
    assert.ok(!JSON.stringify(result).includes("evil.example.test"));
    Object.assign(process.env, demoBank);
  }
});

test("K03 bank aliases, zero-prefixed accounts and encoding cannot change the amount/content/QR origin", async () => {
  Object.assign(process.env, { BANK_ID: "VCB", BANK_ACCOUNT_NUMBER: "0000TEST001", BANK_ACCOUNT_NAME: "GO TRAIL & CO" });
  const result = await read();
  assert.equal(result.payment.status, "Ready");
  const url = new URL(result.payment.qr_url);
  assert.equal(url.origin, "https://vietqr.app"); assert.equal(url.searchParams.get("holder"), "GO TRAIL & CO");
  assert.equal(url.searchParams.get("acc"), "0000TEST001"); assert.equal(url.searchParams.get("amount"), "1000000");
  assert.equal([...url.searchParams.keys()].filter(key => key === "amount").length, 1);
});

test("K03 preserves exact VND strings and suppresses QR for zero/unsupported amounts or invalid transfer content", async () => {
  for (const amount of ["1", "9999999999999"]) {
    await db.invoice.update({ where: { invoice_id: invoice.invoice_id }, data: { total_amount: amount } });
    const result = await read(); assert.equal(result.total_amount, amount); assert.equal(result.payment.amount, amount);
    assert.equal(new URL(result.payment.qr_url).searchParams.get("amount"), amount);
  }
  for (const change of [{ total_amount: "0" }, { total_amount: "99999999999999" }, { total_amount: "500000", payment_code: "GT1&amount=1" }, { payment_code: "GT".repeat(26) }]) {
    await db.invoice.update({ where: { invoice_id: invoice.invoice_id }, data: change });
    assert.deepEqual((await read()).payment, { status: "Unavailable" });
  }
});

test("K03 validates identifiers in the service and uses the same not-found response for missing/cross-owner invoices", async () => {
  for (const id of [0, -1, 1.5, 2147483648, Number.NaN]) await assert.rejects(readCustomerInvoice(db, actors.Customer, id, now), { code: "INVALID_INPUT" });
  await assert.rejects(readCustomerInvoice(db, actors.Customer, 2147483647, now), { code: "NOT_FOUND" });
});
