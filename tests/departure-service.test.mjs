import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { listPublicDepartures } from "../src/server/services/catalog.ts";
import { createDeparture, listManagedDepartures, readManagedDeparture, updateDeparture } from "../src/server/services/departures.ts";

let database, db, manager, admin, otherManager, others, trip, pickup, pickup2;
const now = new Date("2026-10-18T00:00:00Z");
const tripInput = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
  base_price: "500000", description: "Tuyến tham khảo.", schedule_content: "Lịch trình." };
const base = { departure_date: "2026-11-20T01:00:00Z", booking_deadline: "2026-11-19T10:00:00Z", min_passengers: 6 };
const schedule = () => [{ pickup_id: pickup.pickup_id, pickup_time: "2026-11-20T00:30:00+07:00" }];
let plate = 0;
// Stand-in for O04 assignment: one vehicle with one generated departure seat.
async function withSeats(departureId) {
  const vehicle = await db.vehicle.create({ data: { plate_number: `51B-000.${String(++plate).padStart(2, "0")}`, vehicle_type: "Xe 29 chỗ",
    seat_count: 1, seats: { create: [{ seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 }] } }, include: { seats: true } });
  const assigned = await db.departureVehicle.create({ data: { departure_id: departureId, vehicle_id: vehicle.vehicle_id } });
  await db.departureSeat.create({ data: { dep_vehicle_id: assigned.dep_vehicle_id, seat_id: vehicle.seats[0].seat_id } });
  return { vehicle, assigned };
}

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff RESTART IDENTITY CASCADE");
  const actors = [];
  for (const [index, role] of ["RouteMgr", "Admin", "RouteMgr", "Customer", "Leader", "HRMgr"].entries()) {
    const user = await db.user.create({ data: { email: `${role}${index}@departure.example.test`, password_hash: "unused-test-hash",
      full_name: `${role} ${index}`, phone: "0901234567", role } });
    actors.push({ user_id: user.user_id, role, auth_version: 0 });
  }
  [manager, admin, otherManager, ...others] = actors;
  trip = await db.trip.create({ data: tripInput });
  pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Điểm A", address: "Địa chỉ A" } });
  pickup2 = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Điểm B", address: "Địa chỉ B" } });
});
after(async () => { await database?.close(); });

test("RouteMgr creates a Draft owned by themself; Admin must name an Active RouteMgr", async () => {
  const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
  assert.equal(draft.status, "Draft");
  assert.equal(draft.is_demo, false);
  assert.equal(draft.price, "500000");
  assert.deepEqual(draft.invoice_owner, { user_id: manager.user_id, full_name: "RouteMgr 0" });
  assert.equal(draft.pickups[0].pickup_time, "2026-11-19T17:30:00.000Z");
  assert.equal(draft.pickups[0].name, "Điểm A");
  assert.deepEqual(await readManagedDeparture(db, admin, draft.departure_id), draft);

  await assert.rejects(createDeparture(db, manager, trip.trip_id, { ...base, invoice_owner_user_id: otherManager.user_id }, now), { code: "FORBIDDEN" });
  await assert.rejects(createDeparture(db, admin, trip.trip_id, base, now), { code: "INVALID_INPUT" });
  await assert.rejects(createDeparture(db, admin, trip.trip_id, { ...base, invoice_owner_user_id: admin.user_id }, now), { code: "INVALID_INPUT" });
  await db.user.update({ where: { user_id: otherManager.user_id }, data: { status: "Locked" } });
  await assert.rejects(createDeparture(db, admin, trip.trip_id, { ...base, invoice_owner_user_id: otherManager.user_id }, now), { code: "INVALID_INPUT" });
  const byAdmin = await createDeparture(db, admin, trip.trip_id, { ...base, price_override: "450000", invoice_owner_user_id: manager.user_id }, now);
  assert.equal(byAdmin.price, "450000");
  assert.equal(byAdmin.invoice_owner.user_id, manager.user_id);

  for (const actor of others) {
    await assert.rejects(createDeparture(db, { ...actor, role: "Admin" }, trip.trip_id, base, now), { code: "FORBIDDEN" });
    await assert.rejects(listManagedDepartures(db, actor, trip.trip_id), { code: "FORBIDDEN" });
  }
  await assert.rejects(createDeparture(db, null, trip.trip_id, base, now), { code: "UNAUTHENTICATED" });
  assert.equal((await listManagedDepartures(db, manager, trip.trip_id, { status: "Draft" })).pagination.totalItems, 2);
});

test("pickups must belong to the same active trip and deadlines/pickup times must be consistent", async () => {
  const otherTrip = await db.trip.create({ data: { ...tripInput, name: "Tuyến khác" } });
  const foreign = await db.pickupPoint.create({ data: { trip_id: otherTrip.trip_id, name: "Điểm khác", address: "Khác" } });
  const retired = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Ngừng", address: "Ngừng", is_active: false } });
  const reject = (input) => assert.rejects(createDeparture(db, manager, trip.trip_id, input, now), { code: "INVALID_INPUT" });
  await reject({ ...base, pickups: [{ pickup_id: foreign.pickup_id, pickup_time: "2026-11-20T00:00:00Z" }] });
  await reject({ ...base, pickups: [{ pickup_id: retired.pickup_id, pickup_time: "2026-11-20T00:00:00Z" }] });
  await reject({ ...base, pickups: [...schedule(), ...schedule()] });
  await reject({ ...base, booking_deadline: "2026-10-17T00:00:00Z" });
  await reject({ ...base, booking_deadline: "2026-11-20T02:00:00Z" });
  await reject({ ...base, pickups: [{ pickup_id: pickup.pickup_id, pickup_time: "2026-11-19T09:00:00Z" }] });
  await reject({ ...base, pickups: [{ pickup_id: pickup.pickup_id, pickup_time: "2026-11-21T02:00:00Z" }] });
  await reject({ ...base, departure_date: "2026-11-20 01:00" });
  await reject({ ...base, status: "Open" });
  assert.equal(await db.departure.count(), 0);
});

test("Draft opens only with pickups and seats on an active trip; Open departures are no longer editable", async () => {
  const empty = await createDeparture(db, manager, trip.trip_id, base, now);
  await withSeats(empty.departure_id);
  await assert.rejects(updateDeparture(db, manager, empty.departure_id, { status: "Open" }, now), { code: "RESOURCE_CONFLICT" });
  const updated = await updateDeparture(db, manager, empty.departure_id,
    { min_passengers: 8, pickups: [{ pickup_id: pickup2.pickup_id, pickup_time: "2026-11-20T00:00:00Z" }] }, now);
  assert.equal(updated.min_passengers, 8);
  assert.deepEqual(updated.pickups.map((item) => item.pickup_id), [pickup2.pickup_id]);
  const seatless = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
  await assert.rejects(updateDeparture(db, manager, seatless.departure_id, { status: "Open" }, now), { code: "RESOURCE_CONFLICT" });
  const opened = await updateDeparture(db, manager, empty.departure_id, { status: "Open" }, now);
  assert.equal(opened.status, "Open");
  const log = await db.auditLog.findFirst({ where: { action: "DepartureStatusChanged" } });
  assert.deepEqual(JSON.parse(log.description), { action: "DepartureStatusChanged", record_id: empty.departure_id, from: "Draft", to: "Open" });
  await assert.rejects(updateDeparture(db, manager, empty.departure_id, { min_passengers: 2 }, now), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(updateDeparture(db, manager, empty.departure_id, { status: "Open" }, now), { code: "RESOURCE_CONFLICT" });

  const late = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
  await withSeats(late.departure_id);
  await assert.rejects(updateDeparture(db, manager, late.departure_id, { status: "Open" }, new Date("2026-11-19T11:00:00Z")), { code: "INVALID_INPUT" });
  await db.trip.update({ where: { trip_id: trip.trip_id }, data: { is_active: false } });
  await assert.rejects(updateDeparture(db, manager, late.departure_id, { status: "Open" }, now), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(createDeparture(db, manager, trip.trip_id, base, now), { code: "RESOURCE_CONFLICT" });
  assert.equal((await readManagedDeparture(db, manager, late.departure_id)).status, "Draft");
});

test("demo departures can open but are never listed for public sale", async () => {
  const real = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
  const demo = await createDeparture(db, manager, trip.trip_id, { ...base, is_demo: true, pickups: schedule() }, now);
  await withSeats(real.departure_id);
  await withSeats(demo.departure_id);
  await updateDeparture(db, manager, real.departure_id, { status: "Open" }, now);
  await updateDeparture(db, manager, demo.departure_id, { status: "Open" }, now);
  const listed = await listPublicDepartures(db, trip.trip_id, {}, now);
  assert.deepEqual(listed.items.map((item) => item.departure_id), [real.departure_id]);
  await assert.rejects(updateDeparture(db, manager, demo.departure_id, { is_demo: false }, now), { code: "INVALID_INPUT" });
});

test("only Admin reassigns the invoice owner, to an Active RouteMgr, with old/new IDs audited", async () => {
  const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
  await withSeats(draft.departure_id);
  await updateDeparture(db, manager, draft.departure_id, { status: "Open" }, now);
  await assert.rejects(updateDeparture(db, manager, draft.departure_id, { invoice_owner_user_id: otherManager.user_id }, now), { code: "FORBIDDEN" });
  await assert.rejects(updateDeparture(db, admin, draft.departure_id, { invoice_owner_user_id: others[0].user_id }, now), { code: "INVALID_INPUT" });
  const moved = await updateDeparture(db, admin, draft.departure_id, { invoice_owner_user_id: otherManager.user_id }, now);
  assert.equal(moved.invoice_owner.user_id, otherManager.user_id);
  assert.equal(moved.status, "Open");
  const log = await db.auditLog.findFirst({ where: { action: "DepartureOwnerChanged" } });
  assert.equal(log.table_name, "departures");
  assert.deepEqual(JSON.parse(log.description),
    { action: "DepartureOwnerChanged", record_id: draft.departure_id, from: manager.user_id, to: otherManager.user_id });
  await db.departure.update({ where: { departure_id: draft.departure_id }, data: { status: "Ended" } });
  await assert.rejects(updateDeparture(db, admin, draft.departure_id, { invoice_owner_user_id: manager.user_id }, now), { code: "RESOURCE_CONFLICT" });
});

for (const invalidOwner of ["missing", "locked", "wrong role"]) {
  test(`opening rejects a ${invalidOwner} invoice owner and rolls back schedule changes`, async () => {
    const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
    await withSeats(draft.departure_id);
    if (invalidOwner === "missing") {
      await db.departure.update({ where: { departure_id: draft.departure_id }, data: { invoice_owner_user_id: null } });
    } else {
      await db.user.update({ where: { user_id: manager.user_id },
        data: invalidOwner === "locked" ? { status: "Locked" } : { role: "Customer" } });
    }
    const before = await readManagedDeparture(db, admin, draft.departure_id);
    const seats = await db.departureSeat.findMany();
    await assert.rejects(updateDeparture(db, admin, draft.departure_id, { status: "Open", min_passengers: 9,
      pickups: [{ pickup_id: pickup2.pickup_id, pickup_time: "2026-11-20T00:00:00Z" }] }, now), { code: "RESOURCE_CONFLICT" });
    assert.deepEqual(await readManagedDeparture(db, admin, draft.departure_id), before);
    assert.deepEqual(await db.departureSeat.findMany(), seats);
    assert.equal(await db.auditLog.count({ where: { action: "DepartureStatusChanged" } }), 0);
  });
}

for (const resource of ["vehicle", "staff"]) {
  test(`Draft date change rejects existing ${resource} assignments and preserves their records`, async () => {
    const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
    const { assigned } = await withSeats(draft.departure_id);
    if (resource === "staff") {
      const staff = await db.staff.create({ data: { full_name: "Assigned assistant", phone: "0900000000", staff_type: "Assistant" } });
      await db.departureStaff.create({ data: { departure_id: draft.departure_id, dep_vehicle_id: assigned.dep_vehicle_id,
        staff_id: staff.staff_id, role_in_trip: "Assistant" } });
    }
    const seats = await db.departureSeat.findMany();
    const staff = await db.departureStaff.findMany();
    await assert.rejects(updateDeparture(db, admin, draft.departure_id, { departure_date: "2026-11-21T01:00:00Z",
      booking_deadline: "2026-11-20T10:00:00Z", pickups: [{ pickup_id: pickup2.pickup_id, pickup_time: "2026-11-21T00:00:00Z" }] }, now),
    { code: "RESOURCE_CONFLICT" });
    assert.deepEqual(await readManagedDeparture(db, admin, draft.departure_id), draft);
    assert.deepEqual(await db.departureSeat.findMany(), seats);
    assert.deepEqual(await db.departureStaff.findMany(), staff);
    assert.equal(await db.departureVehicle.count(), 1);
    // Sending an unchanged date does not move the resource reservation.
    assert.equal((await updateDeparture(db, manager, draft.departure_id, { departure_date: base.departure_date }, now)).departure_date,
      draft.departure_date);
  });
}

for (const invalidVehicle of ["not Ready", "maintenance", "inactive seat", "missing generated seat"]) {
  test(`opening rechecks an assigned vehicle with ${invalidVehicle}`, async () => {
    const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
    const { vehicle, assigned } = await withSeats(draft.departure_id);
    // Simulate stale imported assignments to exercise the opening boundary independently of O04 validation.
    if (invalidVehicle === "not Ready") {
      await db.vehicle.update({ where: { vehicle_id: vehicle.vehicle_id }, data: { status: "Maintenance" } });
    } else if (invalidVehicle === "maintenance") {
      await db.vehicleMaintenance.create({ data: { vehicle_id: vehicle.vehicle_id, start_date: new Date("2026-11-20"),
        end_date: new Date("2026-11-20"), description: "Scheduled maintenance", cost: "1" } });
    } else if (invalidVehicle === "inactive seat") {
      await db.vehicleSeat.update({ where: { seat_id: vehicle.seats[0].seat_id }, data: { is_active: false } });
    } else {
      await db.departureSeat.deleteMany({ where: { dep_vehicle_id: assigned.dep_vehicle_id } });
      // Another valid vehicle must not hide the broken assignment.
      await withSeats(draft.departure_id);
    }
    const seats = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
    await assert.rejects(updateDeparture(db, admin, draft.departure_id, { status: "Open" }, now),
      { code: ["not Ready", "maintenance"].includes(invalidVehicle) ? "VEHICLE_UNAVAILABLE" : "RESOURCE_CONFLICT" });
    assert.equal((await readManagedDeparture(db, admin, draft.departure_id)).status, "Draft");
    assert.deepEqual(await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }), seats);
    assert.equal(await db.auditLog.count({ where: { action: "DepartureStatusChanged" } }), 0);
  });
}

for (const invalidStaff of ["wrong type", "inactive", "missing license", "expired license", "missing Leader account", "locked Leader account", "wrong Leader account role"]) {
  test(`opening rechecks assigned staff with ${invalidStaff}`, async () => {
    const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
    const { assigned } = await withSeats(draft.departure_id);
    const isLeader = invalidStaff.includes("Leader");
    const leader = others.find((actor) => actor.role === "Leader");
    const role = isLeader ? "Leader" : "Driver";
    const staff = await db.staff.create({ data: { full_name: "Assigned staff", phone: "0900000000", staff_type: role,
      ...(isLeader ? { user_id: leader.user_id } : { license_number: "D-1", license_class: "D", license_expiry: new Date("2027-01-01") }) } });
    await db.departureStaff.create({ data: { departure_id: draft.departure_id, dep_vehicle_id: assigned.dep_vehicle_id,
      staff_id: staff.staff_id, role_in_trip: role } });
    const changes = {
      "wrong type": { staff_type: "Assistant" }, "inactive": { status: "Inactive" },
      "missing license": { license_number: null }, "expired license": { license_expiry: new Date("2026-11-19") },
      "missing Leader account": { user_id: null },
    };
    if (changes[invalidStaff]) await db.staff.update({ where: { staff_id: staff.staff_id }, data: changes[invalidStaff] });
    else await db.user.update({ where: { user_id: leader.user_id },
      data: invalidStaff === "locked Leader account" ? { status: "Locked" } : { role: "Customer" } });
    await assert.rejects(updateDeparture(db, admin, draft.departure_id, { status: "Open" }, now), { code: "ACCESS_CONFLICT" });
    assert.equal((await readManagedDeparture(db, admin, draft.departure_id)).status, "Draft");
    assert.equal(await db.departureStaff.count(), 1);
    assert.equal(await db.departureSeat.count(), 1);
    assert.equal(await db.auditLog.count({ where: { action: "DepartureStatusChanged" } }), 0);
  });
}

test("opening rejects a pickup retired after the Draft was created", async () => {
  const draft = await createDeparture(db, manager, trip.trip_id, { ...base, pickups: schedule() }, now);
  await withSeats(draft.departure_id);
  await db.pickupPoint.update({ where: { pickup_id: pickup.pickup_id }, data: { is_active: false } });
  await assert.rejects(updateDeparture(db, admin, draft.departure_id, { status: "Open" }, now), { code: "INVALID_INPUT" });
  assert.equal((await readManagedDeparture(db, admin, draft.departure_id)).status, "Draft");
  assert.equal(await db.auditLog.count({ where: { action: "DepartureStatusChanged" } }), 0);
});

// O05 fixtures: a two-seat vehicle so the Leader ratio and sold-out close can be exercised.
let ticket = 0;
async function openWithTwoSeats(overrides = {}) {
  const draft = await createDeparture(db, manager, trip.trip_id, { ...base, min_passengers: 2, pickups: schedule(), ...overrides }, now);
  const vehicle = await db.vehicle.create({ data: { plate_number: `51B-100.${String(++plate).padStart(2, "0")}`, vehicle_type: "Xe 29 chỗ",
    seat_count: 2, seats: { create: [{ seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 },
      { seat_name: "A02", floor_level: 1, x_position: 1, y_position: 0 }] } }, include: { seats: true } });
  const assigned = await db.departureVehicle.create({ data: { departure_id: draft.departure_id, vehicle_id: vehicle.vehicle_id } });
  for (const seat of vehicle.seats) await db.departureSeat.create({ data: { dep_vehicle_id: assigned.dep_vehicle_id, seat_id: seat.seat_id } });
  const opened = await updateDeparture(db, manager, draft.departure_id, { status: "Open" }, now);
  const seats = await db.departureSeat.findMany({ where: { dep_vehicle_id: assigned.dep_vehicle_id }, orderBy: { dep_seat_id: "asc" } });
  return { departure: opened, assigned, seats };
}
// Stand-in for the payment flow (P02): a Paid invoice with one Valid ticket on a Sold seat.
async function sell(departure, seat) {
  const customer = others.find((actor) => actor.role === "Customer");
  const invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: departure.departure_id,
    payment_code: `PAID-${++ticket}`, total_amount: "500000", status: "Paid", expires_at: new Date("2026-11-19T00:00:00Z") } });
  await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id }, data: { status: "Sold", invoice_id: invoice.invoice_id } });
  await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: seat.dep_seat_id,
    dep_pickup_id: departure.pickups[0].dep_pickup_id, passenger_name: `Khách ${ticket}`, passenger_phone: "0901234567",
    emergency_contact: "0907654321", health_declaration: true, unit_price: "500000", status: "Valid", ticket_code: `T-${ticket}` } });
}
async function crew(assigned, departureId, role) {
  const leader = others.find((actor) => actor.role === "Leader");
  const staff = await db.staff.create({ data: { full_name: `${role} crew`, phone: "0900000000", staff_type: role,
    ...(role === "Leader" ? { user_id: leader.user_id } : {}),
    ...(role === "Driver" ? { license_number: "D-1", license_class: "D", license_expiry: new Date("2027-01-01") } : {}) } });
  await db.departureStaff.create({ data: { departure_id: departureId, dep_vehicle_id: assigned.dep_vehicle_id, staff_id: staff.staff_id, role_in_trip: role } });
  return staff;
}
const transitions = () => db.auditLog.findMany({ where: { action: "DepartureStatusChanged" }, orderBy: { log_id: "asc" } })
  .then((logs) => logs.map((log) => { const { from, to } = JSON.parse(log.description); return `${from}->${to}`; }));

test("Open closes at the booking deadline or once sold out; skipped, repeated and cancel/reschedule edges change nothing", async () => {
  const { departure, seats } = await openWithTwoSeats();
  const id = departure.departure_id;
  for (const status of ["Draft", "Open", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) {
    await assert.rejects(updateDeparture(db, admin, id, { status }, now), { code: "RESOURCE_CONFLICT" }, status);
  }
  await assert.rejects(updateDeparture(db, manager, id, { status: "Archived" }, now), { code: "INVALID_INPUT" });
  await assert.rejects(updateDeparture(db, manager, id, { status: "Closed", min_passengers: 1 }, new Date("2026-11-19T10:00:00Z")),
    { code: "INVALID_INPUT" });
  for (const actor of others) await assert.rejects(updateDeparture(db, actor, id, { status: "Closed" }, now), { code: "FORBIDDEN" });
  // One seat still unsold and the deadline not reached: sales stay open.
  await sell(departure, seats[0]);
  await assert.rejects(updateDeparture(db, manager, id, { status: "Closed" }, new Date("2026-11-19T09:59:59Z")), { code: "RESOURCE_CONFLICT" });
  assert.equal((await readManagedDeparture(db, manager, id)).status, "Open");

  const closed = await updateDeparture(db, manager, id, { status: "Closed" }, new Date("2026-11-19T10:00:00Z"));
  assert.equal(closed.status, "Closed");
  await assert.rejects(updateDeparture(db, manager, id, { status: "Closed" }, new Date("2026-11-19T10:00:00Z")), { code: "RESOURCE_CONFLICT" });
  assert.deepEqual(await transitions(), ["Draft->Open", "Open->Closed"]);

  const soldOut = await openWithTwoSeats();
  for (const seat of soldOut.seats) await sell(soldOut.departure, seat);
  assert.equal((await updateDeparture(db, admin, soldOut.departure.departure_id, { status: "Closed" }, now)).status, "Closed");
  assert.equal(await db.departureSeat.count({ where: { status: "Sold" } }), 3);
});

test("Closed confirms only with enough paid passengers, a Driver and Assistant per vehicle and Leaders at the configured ratio", async () => {
  const { departure, assigned, seats } = await openWithTwoSeats();
  const id = departure.departure_id;
  const deadline = new Date("2026-11-19T10:00:00Z");
  await sell(departure, seats[0]);
  await updateDeparture(db, manager, id, { status: "Closed" }, deadline);
  const confirm = (at = deadline) => updateDeparture(db, manager, id, { status: "Confirmed" }, at);
  const leader = await crew(assigned, id, "Leader");
  const driver = await crew(assigned, id, "Driver");
  await crew(assigned, id, "Assistant");
  // 1 Valid ticket < min_passengers 2.
  await assert.rejects(confirm(), { code: "RESOURCE_CONFLICT" });
  await sell(departure, seats[1]);

  await db.departureStaff.deleteMany({ where: { staff_id: driver.staff_id } });
  await assert.rejects(confirm(), { code: "RESOURCE_CONFLICT" });
  await db.departureStaff.create({ data: { departure_id: id, dep_vehicle_id: assigned.dep_vehicle_id, staff_id: driver.staff_id, role_in_trip: "Driver" } });
  await db.systemSetting.upsert({ where: { setting_key: "LEADER_RATIO" }, update: { setting_value: "1" },
    create: { setting_key: "LEADER_RATIO", setting_value: "1", description: "Test ratio" } });
  await assert.rejects(confirm(), { code: "RESOURCE_CONFLICT" });
  await db.systemSetting.update({ where: { setting_key: "LEADER_RATIO" }, data: { setting_value: "2" } });
  // Crew eligibility is rechecked, not only the head count.
  await db.staff.update({ where: { staff_id: driver.staff_id }, data: { license_expiry: new Date("2026-11-19") } });
  await assert.rejects(confirm(), { code: "ACCESS_CONFLICT" });
  await db.staff.update({ where: { staff_id: driver.staff_id }, data: { license_expiry: new Date("2027-01-01") } });
  await db.staff.update({ where: { staff_id: leader.staff_id }, data: { status: "Inactive" } });
  await assert.rejects(confirm(), { code: "ACCESS_CONFLICT" });
  await db.staff.update({ where: { staff_id: leader.staff_id }, data: { status: "Active" } });
  assert.equal((await readManagedDeparture(db, manager, id)).status, "Closed");
  assert.deepEqual(await transitions(), ["Draft->Open", "Open->Closed"]);

  assert.equal((await confirm()).status, "Confirmed");
  // Runs from the departure's Vietnam calendar day (2026-11-20 starts at 17:00Z the day before).
  await assert.rejects(updateDeparture(db, manager, id, { status: "Running" }, new Date("2026-11-19T16:59:59Z")), { code: "RESOURCE_CONFLICT" });
  assert.equal((await updateDeparture(db, admin, id, { status: "Running" }, new Date("2026-11-19T17:00:00Z"))).status, "Running");
  for (const status of ["Ended", "Cancelled", "Rescheduled", "Running"]) {
    await assert.rejects(updateDeparture(db, admin, id, { status }, new Date("2026-11-20T05:00:00Z")), { code: "RESOURCE_CONFLICT" }, status);
  }
  assert.deepEqual(await transitions(), ["Draft->Open", "Open->Closed", "Closed->Confirmed", "Confirmed->Running"]);
  assert.equal(await db.invoiceDetail.count({ where: { status: "Valid" } }), 2);
  assert.equal(await db.departureSeat.count({ where: { status: "Sold" } }), 2);
});
