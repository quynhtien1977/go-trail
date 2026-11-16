// P04 (SCRUM-34): "my tickets". Hooks live inside describe because `npm test` runs with --test-isolation=none,
// where a top-level beforeEach would rebuild this fixture before every test of every file.
import assert from "node:assert/strict";
import { describe, before, beforeEach, after, test } from "node:test";
import { createHash } from "node:crypto";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { SEPAY_TEST_KEY, sepayAuth } from "./helpers/sepay.mjs";
import { listOwnTickets } from "../src/server/services/tickets.ts";
import { recordSepayPayment } from "../src/server/services/payments.ts";

const NOW = new Date("2034-06-01T00:00:00Z");
const FUTURE = new Date("2035-01-01T00:00:00Z");
const PAST = new Date("2034-01-01T00:00:00Z");
const tripInput = { name: "Ticket fixture trail", city: "Test", location_name: "Test", length_km: "5",
  base_price: "500000", description: "Fixture", schedule_content: "Fixture" };
const KEYS = ["detail_id", "invoice_id", "invoice_status", "invoice_expires_at", "status", "check_in_status", "ticket_code",
  "trip_name", "departure_id", "departure_date", "passenger_name", "seat_name", "pickup", "unit_price", "responsible_name_snapshot"].sort();
let database, db, actors, departure, depPickup, seats, invoices, nextCode;

before(async () => { database = await createTestDatabase(); db = database.client; });
after(async () => { await database?.close(); });

const as = label => actors[label];
const list = (label, input = {}, now = NOW) => listOwnTickets(db, as(label), input, now);
async function invoice(customer, { status, expires = FUTURE, tickets }) {
  const row = await db.invoice.create({ data: { customer_id: actors[customer].user_id, departure_id: departure.departure_id,
    payment_code: `GTTK${String(++nextCode).padStart(8, "0")}`, total_amount: String(500000 * tickets.length), status, expires_at: expires,
    responsible_user_id: actors.RouteMgr.user_id, responsible_name_snapshot: "Nhân viên phụ trách", responsible_role_snapshot: "RouteMgr" } });
  for (const t of tickets) {
    const seat = seats[t.seat];
    if (t.seatStatus === "Sold") await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id },
      data: { status: "Sold", invoice_id: row.invoice_id, locked_until: null } });
    if (t.seatStatus === "Locked") await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id },
      data: { status: "Locked", invoice_id: row.invoice_id, locked_until: expires } });
    await db.invoiceDetail.create({ data: { invoice_id: row.invoice_id, dep_seat_id: seat.dep_seat_id, dep_pickup_id: depPickup.dep_pickup_id,
      passenger_name: t.name ?? "Hành khách", passenger_phone: "0901234567", emergency_contact: "Người thân 0907654321",
      health_declaration: true, unit_price: "500000", status: t.status, ticket_code: t.code ?? null } });
  }
  return row;
}
async function digest() {
  const rows = await Promise.all([db.invoice.findMany({ orderBy: { invoice_id: "asc" } }),
    db.invoiceDetail.findMany({ orderBy: { detail_id: "asc" } }), db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }),
    db.payment.findMany({ orderBy: { payment_id: "asc" } }), db.auditLog.findMany({ orderBy: { log_id: "asc" } })]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

describe("P04 my tickets (SCRUM-34)", () => {
  beforeEach(async () => {
    process.env.SEPAY_API_KEY = SEPAY_TEST_KEY;
    nextCode = 0;
    await database.sql.exec("TRUNCATE users,trips,vehicles RESTART IDENTITY CASCADE");
    actors = {};
    for (const [label, role] of [["Buyer", "Customer"], ["Rival", "Customer"], ["RouteMgr", "RouteMgr"], ["Leader", "Leader"],
      ["HRMgr", "HRMgr"], ["Admin", "Admin"]]) {
      const user = await db.user.create({ data: { email: `${label.toLowerCase()}@tickets.example.test`, password_hash: "unused",
        full_name: `Private ${label}`, phone: "0901234567", role } });
      actors[label] = { user_id: user.user_id, role, auth_version: 0 };
    }
    const trip = await db.trip.create({ data: tripInput });
    const vehicle = await db.vehicle.create({ data: { plate_number: "TICKET-001", vehicle_type: "29", seat_count: 6 } });
    departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
      departure_date: new Date("2035-01-02T02:00:00Z"), booking_deadline: new Date("2035-01-01T02:00:00Z"),
      invoice_owner_user_id: actors.RouteMgr.user_id } });
    const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Bến xe Miền Đông", address: "292 Đinh Bộ Lĩnh" } });
    depPickup = await db.departurePickup.create({ data: { departure_id: departure.departure_id, pickup_id: pickup.pickup_id,
      pickup_time: new Date("2035-01-01T22:30:00Z") } });
    const depVehicle = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
    seats = [];
    for (let index = 0; index < 6; index++) {
      const seat = await db.vehicleSeat.create({ data: { vehicle_id: vehicle.vehicle_id, seat_name: `B0${index + 1}`,
        floor_level: 1, x_position: index, y_position: 0 } });
      seats.push(await db.departureSeat.create({ data: { dep_vehicle_id: depVehicle.dep_vehicle_id, seat_id: seat.seat_id } }));
    }
    invoices = {
      paid: await invoice("Buyer", { status: "Paid", tickets: [
        { seat: 0, status: "Valid", code: "TKPAID0000000000000001", seatStatus: "Sold", name: "Khách A" },
        { seat: 1, status: "Valid", code: "TKPAID0000000000000002", seatStatus: "Sold", name: "Khách B" }] }),
      pending: await invoice("Buyer", { status: "Pending", tickets: [{ seat: 2, status: "Pending", seatStatus: "Locked" }] }),
      stale: await invoice("Buyer", { status: "Pending", expires: PAST, tickets: [{ seat: 3, status: "Pending", seatStatus: "Locked" }] }),
      // Expiry cleanup releases the seat and cancels the ticket; a leftover code on it must never be shown.
      expired: await invoice("Buyer", { status: "Expired", expires: PAST, tickets: [{ seat: 2, status: "Cancelled", code: "TKLEAKED00000000000000" }] }),
      rival: await invoice("Rival", { status: "Paid", tickets: [{ seat: 4, status: "Valid", code: "TKRIVAL0000000000000001", seatStatus: "Sold" }] }),
    };
  });

  test("a customer reads only their own tickets, newest invoice first, with an allowlisted contract", async () => {
    const page = await list("Buyer");
    assert.equal(page.pagination.totalItems, 5);
    assert.deepEqual(page.items.map(t => t.invoice_id), [invoices.expired.invoice_id, invoices.stale.invoice_id,
      invoices.pending.invoice_id, invoices.paid.invoice_id, invoices.paid.invoice_id]);
    for (const item of page.items) {
      assert.deepEqual(Object.keys(item).sort(), KEYS);
      assert.deepEqual(Object.keys(item.pickup).sort(), ["address", "name", "pickup_time"]);
    }
    const serialized = JSON.stringify(page);
    for (const leak of ["passenger_phone", "0901234567", "emergency_contact", "Người thân", "health_declaration",
      "customer_id", "responsible_user_id", "raw_payload", "Private Rival", "TKRIVAL", "payment_code"]) {
      assert.ok(!serialized.includes(leak), `must not expose ${leak}`);
    }
    assert.equal((await list("Rival")).pagination.totalItems, 1, "the rival sees only their own ticket");
  });

  test("values keep exact VND, UTC instants, the seat, the pickup and the responsible employee snapshot", async () => {
    const valid = (await list("Buyer", { status: "valid" })).items.find(t => t.passenger_name === "Khách A");
    assert.equal(valid.unit_price, "500000");
    assert.equal(valid.departure_date, "2035-01-02T02:00:00.000Z");
    assert.equal(valid.invoice_expires_at, "2035-01-01T00:00:00.000Z");
    assert.equal(valid.seat_name, "B01");
    assert.deepEqual(valid.pickup, { name: "Bến xe Miền Đông", address: "292 Đinh Bộ Lĩnh", pickup_time: "2035-01-01T22:30:00.000Z" });
    assert.equal(valid.trip_name, "Ticket fixture trail");
    assert.equal(valid.departure_id, departure.departure_id);
    assert.equal(valid.responsible_name_snapshot, "Nhân viên phụ trách");
    assert.equal(valid.check_in_status, "Pending");
  });

  test("a ticket code is exposed only for a Valid ticket of a Paid invoice", async () => {
    const page = await list("Buyer");
    for (const item of page.items) {
      const issued = item.invoice_status === "Paid" && item.status === "Valid";
      assert.equal(item.ticket_code !== null, issued, `ticket ${item.detail_id} (${item.invoice_status}/${item.status})`);
    }
    assert.ok(!JSON.stringify(page).includes("TKLEAKED"), "a leftover code on a cancelled ticket stays hidden");
    // Legacy data: a Valid ticket under an invoice that is not Paid still shows no code.
    await db.invoice.update({ where: { invoice_id: invoices.paid.invoice_id }, data: { status: "Cancelled" } });
    assert.ok((await list("Buyer")).items.every(t => t.ticket_code === null));
  });

  test("filters match the ticket UI: valid, pending (still payable), expired (incl. a Pending hold past its deadline)", async () => {
    const ids = async status => (await list("Buyer", status ? { status } : {})).items.map(t => t.invoice_id).sort((a, b) => a - b);
    assert.deepEqual(await ids("valid"), [invoices.paid.invoice_id, invoices.paid.invoice_id]);
    assert.deepEqual(await ids("pending"), [invoices.pending.invoice_id]);
    assert.deepEqual(await ids("expired"), [invoices.stale.invoice_id, invoices.expired.invoice_id].sort((a, b) => a - b));
    assert.equal((await ids()).length, 5);
    // The same Pending hold moves from "pending" to "expired" once its deadline passes; nothing is written to get there.
    const later = new Date("2035-06-01T00:00:00Z");
    assert.deepEqual((await list("Buyer", { status: "pending" }, later)).items, []);
    assert.equal((await list("Buyer", { status: "expired" }, later)).pagination.totalItems, 3);
  });

  test("pagination is stable and an empty or out-of-range page keeps valid metadata", async () => {
    const first = await list("Buyer", { page: "1", pageSize: "2" });
    const second = await list("Buyer", { page: "2", pageSize: "2" });
    const third = await list("Buyer", { page: "3", pageSize: "2" });
    assert.deepEqual(first.pagination, { page: 1, pageSize: 2, totalItems: 5, totalPages: 3 });
    assert.equal(new Set([...first.items, ...second.items, ...third.items].map(t => t.detail_id)).size, 5);
    assert.deepEqual((await list("Buyer", { page: "9" })).items, []);
    const none = await listOwnTickets(db, as("Admin"), {}, NOW);
    assert.deepEqual(none, { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } },
      "Admin passes like every Customer route and reads its own, empty, list");
  });

  test("malformed queries are refused with 422", async () => {
    for (const input of [{ status: "Valid" }, { status: "all" }, { status: "" }, { page: "0" }, { pageSize: "51" },
      { page: "abc" }, { customer_id: "2" }, { q: "x" }]) {
      await assert.rejects(list("Buyer", input), e => e.status === 422 && e.code === "INVALID_INPUT", JSON.stringify(input));
    }
  });

  test("only customers read tickets: staff get 403, a missing or stale session 401", async () => {
    for (const label of ["Leader", "RouteMgr", "HRMgr"]) {
      await assert.rejects(list(label), e => e.status === 403 && e.code === "FORBIDDEN", label);
    }
    await assert.rejects(listOwnTickets(db, null, {}, NOW), e => e.status === 401);
    await assert.rejects(listOwnTickets(db, { ...as("Buyer"), auth_version: 5 }, {}, NOW), e => e.status === 401);
    // requireActor ignores the session role and reloads it from the database, so a forged role never escalates.
    assert.deepEqual(await listOwnTickets(db, { ...as("Buyer"), role: "Admin" }, {}, NOW), await list("Buyer"),
      "a Customer claiming Admin still reads only their own tickets");
    await assert.rejects(listOwnTickets(db, { ...as("Leader"), role: "Customer" }, {}, NOW), e => e.status === 403,
      "a Leader claiming Customer is still a Leader");
  });

  test("reading tickets never writes: invoices, tickets, seats, payments and audits are unchanged", async () => {
    const before = await digest();
    for (const status of [undefined, "valid", "pending", "expired"]) await list("Buyer", status ? { status } : {});
    await list("Rival");
    assert.equal(await digest(), before);
  });

  test("end to end with P02: a webhook-confirmed hold shows up as valid with one code per ticket, retries change nothing", async () => {
    const held = await invoice("Buyer", { status: "Pending", tickets: [{ seat: 5, status: "Pending", seatStatus: "Locked", name: "Khách mới" }] });
    const before = (await list("Buyer", { status: "pending" })).items.map(t => t.invoice_id);
    assert.ok(before.includes(held.invoice_id), "unpaid, the ticket is pending and has no code");
    assert.ok((await list("Buyer")).items.find(t => t.invoice_id === held.invoice_id).ticket_code === null);

    const transfer = JSON.stringify({ id: 880001, gateway: "Fixture", transactionDate: "2034-06-01 07:00:00", accountNumber: "0",
      code: held.payment_code.toLowerCase(), content: "fixture", transferType: "in", transferAmount: 500000, accumulated: 0,
      subAccount: "", referenceCode: "FIX880001", description: "" });
    await recordSepayPayment(db, sepayAuth, transfer, NOW);
    const issued = (await list("Buyer", { status: "valid" })).items.find(t => t.invoice_id === held.invoice_id);
    assert.ok(issued, "after confirmation the ticket is listed as valid");
    assert.match(issued.ticket_code, /^TK[0-9A-F]{20}$/);

    for (let attempt = 0; attempt < 3; attempt++) await recordSepayPayment(db, sepayAuth, transfer, NOW);
    const again = (await list("Buyer", { status: "valid" })).items.find(t => t.invoice_id === held.invoice_id);
    assert.equal(again.ticket_code, issued.ticket_code, "a retried webhook never re-issues the ticket");
    const codes = (await list("Buyer", { status: "valid" })).items.map(t => t.ticket_code);
    assert.equal(new Set(codes).size, codes.length, "every issued code is unique");
  });
});
