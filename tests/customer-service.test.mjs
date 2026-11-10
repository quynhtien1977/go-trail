import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { listCustomers, readCustomer, listOwnBookings } from "../src/server/services/customers.ts";

let database, db, actors, invoices, departures;
const summaryKeys = ["user_id", "full_name", "email", "phone", "status", "created_at", "invoice_count", "last_booking_at"].sort();
const bookingKeys = ["invoice_id", "departure_id", "status", "total_amount", "created_at", "expires_at",
  "responsible_name_snapshot", "responsible_role_snapshot", "trip_name", "departure_date", "tickets"].sort();
const ticketKeys = ["detail_id", "seat_name", "passenger_name", "status", "check_in_status"].sort();

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, system_settings RESTART IDENTITY CASCADE");
  actors = {};
  const people = { Alpha: "Customer", Beta: "Customer", Gamma: "Customer",
    Owner1: "RouteMgr", Owner2: "RouteMgr", HRMgr: "HRMgr", Leader: "Leader", Admin: "Admin" };
  for (const [label, role] of Object.entries(people)) {
    const user = await db.user.create({ data: { email: `${label.toLowerCase()}@customer.example.test`,
      password_hash: "private-fixture-hash", full_name: `${label} Nguyen`,
      phone: label === "Beta" ? "0912345678" : "0901234567", role,
      status: label === "Gamma" ? "Locked" : "Active" } });
    actors[label] = { user_id: user.user_id, role: user.role, auth_version: 0 };
  }
  const trip = await db.trip.create({ data: { name: "Customer trail", city: "Lâm Đồng", location_name: "Mountain",
    length_km: "5", base_price: "500000", description: "Fixture", schedule_content: "Fixture" } });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Pickup", address: "Pickup address" } });
  const vehicle = await db.vehicle.create({ data: { plate_number: "CUSTOMER-TEST", vehicle_type: "Test bus", seat_count: 6,
    seats: { create: [0, 1, 2, 3, 4, 5].map((x_position) => ({ seat_name: `A0${x_position + 1}`, floor_level: 1, x_position, y_position: 0 })) } },
    include: { seats: true } });
  departures = {};
  const seatPool = [];
  for (const [label, owner] of [["one", "Owner1"], ["two", "Owner2"]]) {
    const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
      invoice_owner_user_id: actors[owner].user_id, departure_date: new Date("2030-02-02T07:00:00Z"),
      booking_deadline: new Date("2030-02-01T07:00:00Z"),
      pickups: { create: { pickup_id: pickup.pickup_id, pickup_time: new Date("2030-02-02T06:00:00Z") } } },
      include: { pickups: true } });
    const assigned = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
    departures[label] = { departure, assigned, owner };
    for (const seat of vehicle.seats.slice(label === "one" ? 0 : 3, label === "one" ? 3 : 6)) {
      seatPool.push({ label, seat, dep_vehicle_id: assigned.dep_vehicle_id, dep_pickup_id: departure.pickups[0].dep_pickup_id });
    }
  }
  let code = 0;
  const makeInvoice = async (customer, label, status, createdAt, seatCount) => {
    const { owner, departure } = departures[label];
    const invoice = await db.invoice.create({ data: { customer_id: actors[customer].user_id,
      departure_id: departure.departure_id, payment_code: `GTCUST${String(++code).padStart(4, "0")}`,
      total_amount: String(500000 * seatCount), status, created_at: createdAt,
      expires_at: new Date(createdAt.getTime() + 900000), responsible_user_id: actors[owner].user_id,
      responsible_name_snapshot: `${owner} Nguyen`, responsible_role_snapshot: "RouteMgr",
      idempotency_key: `customer-test-key-${code}` } });
    for (let index = 0; index < seatCount; index++) {
      const slot = seatPool.filter((item) => item.label === label).shift();
      seatPool.splice(seatPool.indexOf(slot), 1);
      const depSeat = await db.departureSeat.create({ data: { dep_vehicle_id: slot.dep_vehicle_id, seat_id: slot.seat.seat_id,
        status: status === "Paid" ? "Sold" : "Locked", invoice_id: invoice.invoice_id,
        locked_until: status === "Paid" ? null : invoice.expires_at } });
      await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: depSeat.dep_seat_id,
        dep_pickup_id: slot.dep_pickup_id, passenger_name: `${slot.seat.seat_name} passenger`,
        passenger_phone: "0909999999", emergency_contact: "Private emergency contact", health_declaration: true,
        unit_price: "500000", status: status === "Paid" ? "Valid" : "Pending",
        ...(status === "Paid" ? { ticket_code: `TICKET-${code}-${index}` } : {}) } });
    }
    return invoice;
  };
  invoices = {
    alphaOne: await makeInvoice("Alpha", "one", "Paid", new Date("2030-01-01T00:00:00Z"), 2),
    alphaTwo: await makeInvoice("Alpha", "two", "Pending", new Date("2030-01-02T00:00:00Z"), 1),
    betaOne: await makeInvoice("Beta", "one", "Pending", new Date("2030-01-03T00:00:00Z"), 1),
  };
});
after(async () => { await database?.close(); });

test("C03 Admin reads every Customer with allowlisted summary fields and scoped booking counts", async () => {
  const page = await listCustomers(db, actors.Admin);
  assert.deepEqual(Object.keys(page).sort(), ["items", "pagination"]);
  assert.deepEqual(page.pagination, { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
  assert.deepEqual(page.items.map((item) => item.full_name), ["Alpha Nguyen", "Beta Nguyen", "Gamma Nguyen"]);
  for (const item of page.items) assert.deepEqual(Object.keys(item).sort(), summaryKeys);
  const [alpha, beta, gamma] = page.items;
  assert.equal(alpha.invoice_count, 2);
  assert.equal(alpha.last_booking_at, invoices.alphaTwo.created_at.toISOString());
  assert.equal(beta.invoice_count, 1);
  assert.equal(gamma.invoice_count, 0);
  assert.equal(gamma.last_booking_at, null);
  assert.equal(gamma.status, "Locked");
});

test("C03 never exposes credentials, auth version or ticket codes", async () => {
  const detail = await readCustomer(db, actors.Admin, actors.Alpha.user_id);
  const serialized = JSON.stringify(detail);
  for (const leak of ["password", "auth_version", "ticket_code", "TICKET-", "passenger_phone", "emergency_contact", "bank"]) {
    assert.ok(!serialized.includes(leak), `must not expose ${leak}`);
  }
  assert.deepEqual(Object.keys(detail).sort(), ["bookings", "customer"]);
  for (const booking of detail.bookings) {
    assert.deepEqual(Object.keys(booking).sort(), bookingKeys);
    for (const ticket of booking.tickets) assert.deepEqual(Object.keys(ticket).sort(), ticketKeys);
  }
});

test("C03 history is newest first with exact VND strings, UTC and the invoice employee snapshot", async () => {
  const detail = await readCustomer(db, actors.Admin, actors.Alpha.user_id);
  assert.deepEqual(detail.bookings.map((booking) => booking.invoice_id),
    [invoices.alphaTwo.invoice_id, invoices.alphaOne.invoice_id]);
  const [latest, first] = detail.bookings;
  assert.equal(latest.total_amount, "500000");
  assert.equal(first.total_amount, "1000000");
  assert.equal(first.status, "Paid");
  assert.equal(first.created_at, "2030-01-01T00:00:00.000Z");
  assert.equal(first.departure_date, "2030-02-02T07:00:00.000Z");
  assert.equal(first.trip_name, "Customer trail");
  assert.equal(first.responsible_name_snapshot, "Owner1 Nguyen");
  assert.equal(first.responsible_role_snapshot, "RouteMgr");
  assert.deepEqual(first.tickets.map((ticket) => ticket.seat_name), ["A01", "A02"]);
  assert.deepEqual(first.tickets.map((ticket) => ticket.status), ["Valid", "Valid"]);
  assert.deepEqual(first.tickets.map((ticket) => ticket.check_in_status), ["Pending", "Pending"]);
});

test("C03 search matches name, email and phone, and an empty result keeps a valid page", async () => {
  assert.deepEqual((await listCustomers(db, actors.Admin, { q: "beta" })).items.map((item) => item.user_id),
    [actors.Beta.user_id]);
  assert.deepEqual((await listCustomers(db, actors.Admin, { q: "ALPHA@CUSTOMER.EXAMPLE.TEST" })).items.map((item) => item.user_id),
    [actors.Alpha.user_id]);
  assert.deepEqual((await listCustomers(db, actors.Admin, { q: "0912345678" })).items.map((item) => item.user_id),
    [actors.Beta.user_id]);
  const empty = await listCustomers(db, actors.Admin, { q: "no-such-customer" });
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.pagination, { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
});

test("C03 filters by account status and paginates deterministically", async () => {
  const locked = await listCustomers(db, actors.Admin, { status: "Locked" });
  assert.deepEqual(locked.items.map((item) => item.user_id), [actors.Gamma.user_id]);
  assert.equal(locked.pagination.totalItems, 1);
  const first = await listCustomers(db, actors.Admin, { page: "1", pageSize: "2" });
  assert.deepEqual(first.items.map((item) => item.user_id), [actors.Alpha.user_id, actors.Beta.user_id]);
  assert.deepEqual(first.pagination, { page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
  const second = await listCustomers(db, actors.Admin, { page: "2", pageSize: "2" });
  assert.deepEqual(second.items.map((item) => item.user_id), [actors.Gamma.user_id]);
  const beyond = await listCustomers(db, actors.Admin, { page: "3", pageSize: "2" });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.pagination.totalItems, 3);
});

test("C03 RouteMgr reads only the customers and invoices they are responsible for", async () => {
  const owner1 = await listCustomers(db, actors.Owner1);
  assert.deepEqual(owner1.items.map((item) => item.user_id), [actors.Alpha.user_id, actors.Beta.user_id]);
  assert.equal(owner1.pagination.totalItems, 2);
  // Alpha has two invoices overall; only the one owned by Owner1 may be counted or listed.
  assert.equal(owner1.items[0].invoice_count, 1);
  assert.equal(owner1.items[0].last_booking_at, invoices.alphaOne.created_at.toISOString());
  const scoped = await readCustomer(db, actors.Owner1, actors.Alpha.user_id);
  assert.deepEqual(scoped.bookings.map((booking) => booking.invoice_id), [invoices.alphaOne.invoice_id]);

  const owner2 = await listCustomers(db, actors.Owner2);
  assert.deepEqual(owner2.items.map((item) => item.user_id), [actors.Alpha.user_id]);
  assert.deepEqual((await readCustomer(db, actors.Owner2, actors.Alpha.user_id)).bookings.map((booking) => booking.invoice_id),
    [invoices.alphaTwo.invoice_id]);
  // A customer outside the scope must be indistinguishable from a missing one.
  await assert.rejects(readCustomer(db, actors.Owner2, actors.Beta.user_id), { code: "NOT_FOUND", status: 404 });
  await assert.rejects(readCustomer(db, actors.Owner1, actors.Gamma.user_id), { code: "NOT_FOUND", status: 404 });
});

test("C03 refuses Customer, Leader and HRMgr on the staff directory, and staff on the customer history", async () => {
  for (const label of ["Alpha", "Leader", "HRMgr"]) {
    await assert.rejects(listCustomers(db, actors[label]), { code: "FORBIDDEN", status: 403 });
    await assert.rejects(readCustomer(db, actors[label], actors.Alpha.user_id), { code: "FORBIDDEN", status: 403 });
  }
  for (const label of ["Owner1", "Leader", "HRMgr"]) {
    await assert.rejects(listOwnBookings(db, actors[label]), { code: "FORBIDDEN", status: 403 });
  }
  await assert.rejects(listCustomers(db, null), { code: "UNAUTHENTICATED", status: 401 });
  await assert.rejects(readCustomer(db, { ...actors.Admin, auth_version: 7 }, actors.Alpha.user_id),
    { code: "UNAUTHENTICATED", status: 401 });
});

test("C03 a Customer reads only their own history, never another customer's", async () => {
  const own = await listOwnBookings(db, actors.Alpha);
  assert.deepEqual(Object.keys(own).sort(), ["bookings", "customer_id"]);
  assert.equal(own.customer_id, actors.Alpha.user_id);
  assert.deepEqual(own.bookings.map((booking) => booking.invoice_id),
    [invoices.alphaTwo.invoice_id, invoices.alphaOne.invoice_id]);
  assert.ok(!own.bookings.some((booking) => booking.invoice_id === invoices.betaOne.invoice_id));
  assert.deepEqual((await listOwnBookings(db, actors.Beta)).bookings.map((booking) => booking.invoice_id),
    [invoices.betaOne.invoice_id]);
  assert.ok(!JSON.stringify(own).includes("ticket_code"));
});

test("C03 rejects malformed ids and query parameters", async () => {
  for (const id of [0, -1, 1.5, 2147483648, Number.NaN]) {
    await assert.rejects(readCustomer(db, actors.Admin, id), { code: "INVALID_INPUT", status: 422 });
  }
  for (const query of [{ page: "0" }, { pageSize: "51" }, { pageSize: "0" }, { status: "Deleted" },
    { q: "" }, { unknown: "x" }, { page: "-1" }]) {
    await assert.rejects(listCustomers(db, actors.Admin, query), { code: "INVALID_INPUT", status: 422 });
  }
  await assert.rejects(readCustomer(db, actors.Admin, 2147483647), { code: "NOT_FOUND", status: 404 });
});

test("C03 reads never mutate accounts, invoices, tickets, seats or audit history", async () => {
  const snapshot = async () => JSON.stringify(await Promise.all([
    db.user.findMany({ orderBy: { user_id: "asc" }, select: { user_id: true, role: true, status: true, auth_version: true } }),
    db.invoice.findMany({ orderBy: { invoice_id: "asc" } }),
    db.invoiceDetail.findMany({ orderBy: { detail_id: "asc" } }),
    db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }),
    db.auditLog.findMany({ orderBy: { log_id: "asc" } }),
  ]));
  const before = await snapshot();
  await listCustomers(db, actors.Admin);
  await listCustomers(db, actors.Owner1, { q: "alpha", status: "Active" });
  await readCustomer(db, actors.Admin, actors.Alpha.user_id);
  await listOwnBookings(db, actors.Alpha);
  assert.equal(await snapshot(), before);
  assert.equal(await db.auditLog.count(), 0);
});
