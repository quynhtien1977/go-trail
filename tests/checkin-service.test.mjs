// L01 (SCRUM-37): Leader manifest and QR check-in. Hooks live inside describe because `npm test` runs with
// --test-isolation=none, where a top-level beforeEach would rebuild this fixture before every test of every file.
import assert from "node:assert/strict";
import { describe, before, beforeEach, after, test } from "node:test";
import { createHash } from "node:crypto";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { readManifest, checkIn } from "../src/server/services/checkin.ts";

const NOW = new Date("2035-01-01T22:40:00Z");
const LATER = new Date("2035-01-01T23:55:00Z");
const PASSENGER_KEYS = ["detail_id", "seat_name", "passenger_name", "passenger_phone", "emergency_contact", "pickup", "vehicle",
  "check_in_status", "check_in_time"].sort();
const code = n => `TK${String(n).padStart(20, "0")}`;
let database, db, actors, depA, depB, tickets, nextCode;

before(async () => { database = await createTestDatabase(); db = database.client; });
after(async () => { await database?.close(); });

const as = label => actors[label];
const manifest = (label, departureId = depA.departure_id, now = NOW) => readManifest(db, as(label), departureId, now);
const scan = (label, ticketCode, departureId = depA.departure_id, now = NOW) =>
  checkIn(db, as(label), { action: "CheckIn", departure_id: departureId, ticket_code: ticketCode }, now);
const absent = (label, detailId, departureId = depA.departure_id) =>
  checkIn(db, as(label), { action: "MarkAbsent", departure_id: departureId, detail_id: detailId }, NOW);
const row = detailId => db.invoiceDetail.findUniqueOrThrow({ where: { detail_id: detailId },
  select: { check_in_status: true, check_in_time: true } });
async function digest() {
  const rows = await Promise.all([db.invoice.findMany({ orderBy: { invoice_id: "asc" } }),
    db.invoiceDetail.findMany({ orderBy: { detail_id: "asc" } }), db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }),
    db.departure.findMany({ orderBy: { departure_id: "asc" } }), db.auditLog.findMany({ orderBy: { log_id: "asc" } })]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function departure(trip, plate, pickups) {
  const dep = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Confirmed", min_passengers: 1,
    departure_date: new Date("2035-01-02T02:00:00Z"), booking_deadline: new Date("2035-01-01T02:00:00Z"),
    invoice_owner_user_id: actors.RouteMgr.user_id } });
  const vehicle = await db.vehicle.create({ data: { plate_number: plate, vehicle_type: "29", seat_count: 6 } });
  const depVehicle = await db.departureVehicle.create({ data: { departure_id: dep.departure_id, vehicle_id: vehicle.vehicle_id } });
  const seats = [];
  for (let index = 0; index < 6; index++) {
    const seat = await db.vehicleSeat.create({ data: { vehicle_id: vehicle.vehicle_id, seat_name: `B0${index + 1}`,
      floor_level: 1, x_position: index, y_position: 0 } });
    seats.push(await db.departureSeat.create({ data: { dep_vehicle_id: depVehicle.dep_vehicle_id, seat_id: seat.seat_id } }));
  }
  const stops = [];
  for (const [name, time] of pickups) {
    const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name, address: `${name} address` } });
    stops.push(await db.departurePickup.create({ data: { departure_id: dep.departure_id, pickup_id: pickup.pickup_id,
      pickup_time: new Date(time) } }));
  }
  return { ...dep, depVehicle, seats, stops };
}
async function invoice(dep, status, list) {
  const inv = await db.invoice.create({ data: { customer_id: actors.Buyer.user_id, departure_id: dep.departure_id,
    payment_code: `GTCI${String(++nextCode).padStart(8, "0")}`, total_amount: String(500000 * list.length), status,
    expires_at: new Date("2035-01-01T00:00:00Z"), responsible_user_id: actors.RouteMgr.user_id,
    responsible_name_snapshot: "Nhân viên phụ trách", responsible_role_snapshot: "RouteMgr" } });
  const created = [];
  for (const t of list) {
    const seat = dep.seats[t.seat];
    if (status === "Paid") await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id },
      data: { status: "Sold", invoice_id: inv.invoice_id, locked_until: null } });
    created.push(await db.invoiceDetail.create({ data: { invoice_id: inv.invoice_id, dep_seat_id: seat.dep_seat_id,
      dep_pickup_id: dep.stops[t.stop].dep_pickup_id, passenger_name: t.name, passenger_phone: "0901234567",
      emergency_contact: "Người thân 0907654321", health_declaration: true, unit_price: "500000", status: t.status,
      ticket_code: t.code ?? null } }));
  }
  return created;
}

describe("L01 manifest and check-in (SCRUM-37)", () => {
  beforeEach(async () => {
    nextCode = 0;
    await database.sql.exec("TRUNCATE users,trips,vehicles RESTART IDENTITY CASCADE");
    actors = {};
    for (const [label, role] of [["Buyer", "Customer"], ["Leader", "Leader"], ["OtherLeader", "Leader"], ["RouteMgr", "RouteMgr"],
      ["HRMgr", "HRMgr"], ["Admin", "Admin"]]) {
      const user = await db.user.create({ data: { email: `${label.toLowerCase()}@checkin.example.test`, password_hash: "unused",
        full_name: `Private ${label}`, phone: "0901234567", role } });
      actors[label] = { user_id: user.user_id, role, auth_version: 0 };
    }
    const trip = await db.trip.create({ data: { name: "Check-in fixture trail", city: "Test", location_name: "Test", length_km: "5",
      base_price: "500000", description: "Fixture", schedule_content: "Fixture" } });
    // Stop 0 is picked up later than stop 1, so the manifest order cannot be insertion order.
    depA = await departure(trip, "CHECKIN-A", [["Late stop", "2035-01-01T23:30:00Z"], ["Early stop", "2035-01-01T22:30:00Z"]]);
    depB = await departure(trip, "CHECKIN-B", [["Other stop", "2035-01-01T22:30:00Z"]]);
    for (const [label, dep] of [["Leader", depA], ["OtherLeader", depB]]) {
      const staff = await db.staff.create({ data: { user_id: actors[label].user_id, full_name: label, phone: "0901234567", staff_type: "Leader" } });
      await db.departureStaff.create({ data: { departure_id: dep.departure_id, staff_id: staff.staff_id, role_in_trip: "Leader",
        dep_vehicle_id: dep.depVehicle.dep_vehicle_id } });
    }
    for (const [dep, role, name, phone] of [[depA, "Assistant", "Assistant A", "0912000002"], [depA, "Driver", "Driver A", "0912000001"],
      [depB, "Driver", "Driver B", "0912000009"]]) {
      const staff = await db.staff.create({ data: { full_name: name, phone, staff_type: role,
        ...(role === "Driver" ? { license_number: `L-${name}`, license_class: "D", license_expiry: new Date("2036-01-01") } : {}) } });
      await db.departureStaff.create({ data: { departure_id: dep.departure_id, staff_id: staff.staff_id, role_in_trip: role,
        dep_vehicle_id: dep.depVehicle.dep_vehicle_id } });
    }
    const [lateStop, early1] = await invoice(depA, "Paid", [
      { seat: 0, stop: 0, name: "Late stop passenger", status: "Valid", code: code(1) },
      { seat: 2, stop: 1, name: "Early stop B03", status: "Valid", code: code(2) }]);
    const [early2] = await invoice(depA, "Paid", [{ seat: 1, stop: 1, name: "Early stop B02", status: "Valid", code: code(3) }]);
    const [unpaid] = await invoice(depA, "Pending", [{ seat: 3, stop: 1, name: "Unpaid hold", status: "Pending" }]);
    const [cancelled] = await invoice(depA, "Expired", [{ seat: 4, stop: 1, name: "Cancelled legacy", status: "Cancelled", code: "LEGACY-CANCELLED" }]);
    const [otherDeparture] = await invoice(depB, "Paid", [{ seat: 0, stop: 0, name: "Other departure", status: "Valid", code: code(6) }]);
    tickets = { lateStop, early1, early2, unpaid, cancelled, otherDeparture };
  });

  test("the assigned Leader reads only boarding passengers, with the minimum fields, ordered by pickup time then seat", async () => {
    const result = await manifest("Leader");
    assert.deepEqual(result.departure, { departure_id: depA.departure_id, trip_name: "Check-in fixture trail",
      departure_date: "2035-01-02T02:00:00.000Z", status: "Confirmed", check_in_open: true });
    assert.deepEqual(result.passengers.map(p => p.passenger_name), ["Early stop B02", "Early stop B03", "Late stop passenger"],
      "Pending holds and Cancelled tickets never board; the earlier stop comes first, then seat order");
    assert.deepEqual(result.summary, { total: 3, checked_in: 0, absent: 0, pending: 3 });
    assert.equal(result.server_time, NOW.toISOString());
    for (const p of result.passengers) assert.deepEqual(Object.keys(p).sort(), PASSENGER_KEYS);
    assert.deepEqual(result.passengers[0], { detail_id: tickets.early2.detail_id, seat_name: "B02", passenger_name: "Early stop B02",
      passenger_phone: "0901234567", emergency_contact: "Người thân 0907654321",
      pickup: { dep_pickup_id: depA.stops[1].dep_pickup_id, name: "Early stop", address: "Early stop address",
        pickup_time: "2035-01-01T22:30:00.000Z" }, vehicle: { dep_vehicle_id: depA.depVehicle.dep_vehicle_id, plate_number: "CHECKIN-A" },
      check_in_status: "Pending", check_in_time: null });
    const bus = { dep_vehicle_id: depA.depVehicle.dep_vehicle_id, plate_number: "CHECKIN-A" };
    assert.deepEqual(result.crew, [
      { role_in_trip: "Driver", full_name: "Driver A", phone: "0912000001", vehicle: bus },
      { role_in_trip: "Assistant", full_name: "Assistant A", phone: "0912000002", vehicle: bus }],
    "this departure's drivers and assistants with phones (PRD 3.3); no Leader, no other departure's crew");
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /TK0|LEGACY|ticket_code|payment|GTCI|total_amount|unit_price|health|email|@checkin|customer|invoice/,
      "no QR code, money, payment, health or account data in the manifest");
  });

  test("manifest visibility follows the Leader assignment and the departure status; out of scope is a plain 404", async () => {
    await assert.rejects(manifest("OtherLeader"), { code: "NOT_FOUND" }, "a Leader of another departure");
    await assert.rejects(manifest("Leader", 999999), { code: "NOT_FOUND" });
    await assert.rejects(manifest("Leader", 0), { code: "INVALID_INPUT" });
    for (const label of ["Buyer", "RouteMgr", "HRMgr"]) await assert.rejects(manifest(label), { code: "FORBIDDEN" }, label);
    await assert.rejects(readManifest(db, { ...as("Leader"), auth_version: 1 }, depA.departure_id, NOW), { code: "UNAUTHENTICATED" });
    assert.equal((await manifest("Admin")).summary.total, 3, "Admin inherits the Leader right without an assignment");

    for (const status of ["Draft", "Open", "Closed", "Cancelled", "Rescheduled"]) {
      await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status } });
      await assert.rejects(manifest("Leader"), { code: "NOT_FOUND" }, status);
      await assert.rejects(manifest("Admin"), { code: "NOT_FOUND" }, `Admin, ${status}`);
    }
    await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status: "Running" } });
    assert.equal((await manifest("Leader")).departure.check_in_open, true);
    await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status: "Ended" } });
    const ended = await manifest("Leader");
    assert.equal(ended.departure.check_in_open, false, "an Ended manifest stays readable but closed");
    assert.equal(ended.summary.total, 3);

    await db.staff.updateMany({ where: { user_id: as("Leader").user_id }, data: { status: "Inactive" } });
    await assert.rejects(manifest("Leader"), { code: "NOT_FOUND" }, "an inactive Leader profile loses the manifest");
  });

  test("a QR scan checks a passenger in once; repeated scans return the same result and write nothing", async () => {
    const first = await scan("Leader", ` ${code(1).toLowerCase()}\n`);
    assert.equal(first.result, "CheckedIn"); assert.equal(first.changed, true);
    assert.equal(first.passenger.detail_id, tickets.lateStop.detail_id);
    assert.equal(first.passenger.check_in_time, NOW.toISOString());
    assert.deepEqual(await row(tickets.lateStop.detail_id), { check_in_status: "CheckedIn", check_in_time: NOW });

    const before = await digest();
    for (const at of [NOW, LATER]) {
      const again = await scan("Leader", code(1), depA.departure_id, at);
      assert.equal(again.result, "AlreadyCheckedIn"); assert.equal(again.changed, false);
      assert.equal(again.passenger.check_in_time, NOW.toISOString(), "the first scan time is kept");
    }
    assert.equal(await digest(), before, "a repeated scan changes nothing");
    assert.deepEqual((await manifest("Leader")).summary, { total: 3, checked_in: 1, absent: 0, pending: 2 });
  });

  test("unknown, wrong-departure, unpaid or cancelled tickets get distinct errors and change nothing", async () => {
    const before = await digest();
    await assert.rejects(scan("Leader", code(999)), { code: "TICKET_NOT_FOUND", status: 404 });
    await assert.rejects(scan("Leader", code(6)), { code: "TICKET_WRONG_DEPARTURE", status: 409 }, "a ticket of another departure");
    await assert.rejects(scan("Leader", "LEGACY-CANCELLED"), { code: "TICKET_NOT_VALID", status: 409 });
    await assert.rejects(absent("Leader", tickets.unpaid.detail_id), { code: "TICKET_NOT_VALID", status: 409 }, "an unpaid hold");
    await db.invoiceDetail.update({ where: { detail_id: tickets.unpaid.detail_id }, data: { status: "Valid", ticket_code: code(4) } });
    await assert.rejects(scan("Leader", code(4)), { code: "TICKET_NOT_VALID" }, "a Valid ticket on an unpaid invoice is not boarding proof");
    await db.invoiceDetail.update({ where: { detail_id: tickets.unpaid.detail_id }, data: { status: "Pending", ticket_code: null } });
    await assert.rejects(absent("Leader", tickets.otherDeparture.detail_id), { code: "NOT_FOUND" }, "a row of another manifest");
    await assert.rejects(absent("Leader", 999999), { code: "NOT_FOUND" });
    await assert.rejects(scan("OtherLeader", code(1)), { code: "NOT_FOUND" }, "a Leader not assigned to this departure");
    await assert.rejects(scan("Leader", code(6), depB.departure_id), { code: "NOT_FOUND" }, "naming another departure does not help");
    for (const label of ["Buyer", "RouteMgr", "HRMgr"]) await assert.rejects(scan(label, code(1)), { code: "FORBIDDEN" }, label);
    for (const input of [{}, { action: "CheckIn", departure_id: depA.departure_id }, { action: "Undo", departure_id: depA.departure_id, detail_id: 1 },
      { action: "CheckIn", departure_id: String(depA.departure_id), ticket_code: code(1) },
      { action: "CheckIn", departure_id: depA.departure_id, ticket_code: code(1), check_in_time: "2030-01-01T00:00:00Z" },
      { action: "MarkAbsent", departure_id: depA.departure_id, detail_id: tickets.lateStop.detail_id, ticket_code: code(1) },
      { action: "CheckIn", departure_id: depA.departure_id, ticket_code: "TK 0001" },
      { action: "CheckIn", departure_id: depA.departure_id, ticket_code: "T".repeat(65) },
      { action: "CheckIn", departure_id: depA.departure_id, ticket_code: "   " }]) {
      await assert.rejects(checkIn(db, as("Leader"), input, NOW), { code: "INVALID_INPUT" }, JSON.stringify(input));
    }
    await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status: "Ended" } });
    const ended = await digest();
    await assert.rejects(scan("Leader", code(1)), { code: "CHECKIN_CLOSED", status: 409 });
    await assert.rejects(absent("Leader", tickets.lateStop.detail_id), { code: "CHECKIN_CLOSED", status: 409 });
    await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status: "Closed" } });
    await assert.rejects(scan("Leader", code(1)), { code: "NOT_FOUND" }, "before Confirmed the departure is not the Leader's yet");
    await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status: "Ended" } });
    assert.equal(await digest(), ended);
    await db.departure.update({ where: { departure_id: depA.departure_id }, data: { status: "Confirmed" } });
    assert.equal(await digest(), before, "every rejected request left the data unchanged");
  });

  test("Absent is idempotent, a late scan still boards the passenger, and Absent never overwrites a scan", async () => {
    const marked = await absent("Leader", tickets.lateStop.detail_id);
    assert.equal(marked.result, "MarkedAbsent"); assert.equal(marked.changed, true);
    assert.equal(marked.passenger.check_in_status, "Absent"); assert.equal(marked.passenger.check_in_time, null);
    const before = await digest();
    const again = await absent("Leader", tickets.lateStop.detail_id);
    assert.equal(again.result, "AlreadyAbsent"); assert.equal(again.changed, false);
    assert.equal(await digest(), before);
    assert.deepEqual((await manifest("Leader")).summary, { total: 3, checked_in: 0, absent: 1, pending: 2 });

    const late = await scan("Leader", code(1), depA.departure_id, LATER);
    assert.equal(late.result, "CheckedIn");
    assert.deepEqual(await row(tickets.lateStop.detail_id), { check_in_status: "CheckedIn", check_in_time: LATER });
    await assert.rejects(absent("Leader", tickets.lateStop.detail_id), { code: "ALREADY_CHECKED_IN", status: 409 });
    assert.deepEqual(await row(tickets.lateStop.detail_id), { check_in_status: "CheckedIn", check_in_time: LATER });
  });

  test("a departure with two buses tells passengers on the same seat name apart by plate", async () => {
    const second = await db.vehicle.create({ data: { plate_number: "CHECKIN-A2", vehicle_type: "29", seat_count: 1 } });
    const physical = await db.vehicleSeat.create({ data: { vehicle_id: second.vehicle_id, seat_name: "B02", floor_level: 1, x_position: 0, y_position: 0 } });
    const assigned = await db.departureVehicle.create({ data: { departure_id: depA.departure_id, vehicle_id: second.vehicle_id } });
    const seat = await db.departureSeat.create({ data: { dep_vehicle_id: assigned.dep_vehicle_id, seat_id: physical.seat_id } });
    await invoice({ ...depA, seats: [seat] }, "Paid", [{ seat: 0, stop: 1, name: "Second bus B02", status: "Valid", code: code(7) }]);
    const twins = (await manifest("Leader")).passengers.filter(p => p.seat_name === "B02");
    assert.deepEqual(twins.map(p => [p.passenger_name, p.vehicle.plate_number]).sort(),
      [["Early stop B02", "CHECKIN-A"], ["Second bus B02", "CHECKIN-A2"]]);
    assert.equal((await scan("Leader", code(7))).passenger.vehicle.plate_number, "CHECKIN-A2");
  });

  test("Admin checks in on any visible departure; the Running status accepts check-in like Confirmed", async () => {
    await db.departure.update({ where: { departure_id: depB.departure_id }, data: { status: "Running" } });
    const result = await scan("Admin", code(6), depB.departure_id);
    assert.equal(result.result, "CheckedIn");
    assert.equal((await scan("OtherLeader", code(6), depB.departure_id)).result, "AlreadyCheckedIn",
      "a second device sees the first scan");
    assert.equal(await db.auditLog.count(), 0, "check-in is not an audited event (PRD audit allowlist)");
  });
});
