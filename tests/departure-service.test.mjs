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
}

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles RESTART IDENTITY CASCADE");
  const actors = [];
  for (const [index, role] of ["RouteMgr", "Admin", "RouteMgr", "Customer", "Leader", "HRMgr", "Accountant"].entries()) {
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
