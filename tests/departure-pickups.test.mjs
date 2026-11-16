import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { readPublicDeparturePickups } from "../src/server/services/departure-pickups.ts";
import { holdSeats } from "../src/server/services/bookings.ts";

let database, db, trip, departure, buyer, pickupA, pickupB;
const now = new Date("2034-01-01T00:00:00Z");
const tripInput = { name: "Pickup fixture", city: "Test", location_name: "Test", length_km: "5",
  base_price: "500000", description: "Fixture", schedule_content: "Fixture" };
before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users,trips,vehicles RESTART IDENTITY CASCADE");
  const owner = await db.user.create({ data: { email: "owner@pickup.example.test", password_hash: "unused",
    full_name: "Private owner", phone: "0901234567", role: "RouteMgr" } });
  const user = await db.user.create({ data: { email: "buyer@pickup.example.test", password_hash: "unused",
    full_name: "Private buyer", phone: "0901234567", role: "Customer" } });
  buyer = { user_id: user.user_id, role: "Customer", auth_version: 0 };
  trip = await db.trip.create({ data: tripInput });
  const foreign = await db.trip.create({ data: { ...tripInput, name: "Another trip" } });
  const foreignPickup = await db.pickupPoint.create({ data: { trip_id: foreign.trip_id, name: "Foreign pickup", address: "Foreign address" } });
  await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Not scheduled", address: "Not scheduled" } });
  pickupA = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Later pickup", address: "Later address" } });
  pickupB = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "First pickup", address: "First address" } });
  const retired = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Retired", address: "Retired", is_active: false } });
  departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
    departure_date: new Date("2035-01-02T02:00:00Z"), booking_deadline: new Date("2035-01-01T02:00:00Z"),
    invoice_owner_user_id: owner.user_id, pickups: { create: [
      { pickup_id: pickupA.pickup_id, pickup_time: new Date("2035-01-02T01:30:00Z") },
      { pickup_id: pickupB.pickup_id, pickup_time: new Date("2035-01-02T01:00:00Z") },
      { pickup_id: retired.pickup_id, pickup_time: new Date("2035-01-02T00:30:00Z") },
      { pickup_id: foreignPickup.pickup_id, pickup_time: new Date("2035-01-02T00:00:00Z") },
    ] } }, include: { pickups: true } });
});
after(async () => { await database?.close(); });

test("public departure pickups expose only scheduled active same-trip pickups in UTC order", async () => {
  const result = await readPublicDeparturePickups(db, departure.departure_id, now);
  assert.deepEqual(Object.keys(result).sort(), ["departure_id", "pickups"]);
  assert.equal(result.departure_id, departure.departure_id);
  assert.deepEqual(result.pickups.map(item => [item.pickup_id, item.name, item.address, item.pickup_time]), [
    [pickupB.pickup_id, "First pickup", "First address", "2035-01-02T01:00:00.000Z"],
    [pickupA.pickup_id, "Later pickup", "Later address", "2035-01-02T01:30:00.000Z"],
  ]);
  for (const item of result.pickups) {
    assert.deepEqual(Object.keys(item).sort(), ["dep_pickup_id", "pickup_id", "name", "address", "pickup_time"].sort());
    assert.equal(departure.pickups.find(row => row.pickup_id === item.pickup_id).dep_pickup_id, item.dep_pickup_id);
  }
  assert.doesNotMatch(JSON.stringify(result), /Private|invoice|password|auth_version|phone|example\.test/);
});

test("public pickup reads never return another departure's schedule", async () => {
  const other = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
    departure_date: new Date("2035-02-02T02:00:00Z"), booking_deadline: new Date("2035-02-01T02:00:00Z"),
    pickups: { create: { pickup_id: pickupA.pickup_id, pickup_time: new Date("2035-02-02T01:00:00Z") } } }, include: { pickups: true } });
  const result = await readPublicDeparturePickups(db, departure.departure_id, now);
  assert.ok(result.pickups.every(item => item.dep_pickup_id !== other.pickups[0].dep_pickup_id));
});

test("only Open real departures before deadline and departure time on an active trip are public", async () => {
  for (const status of ["Draft", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) {
    await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status } });
    await assert.rejects(readPublicDeparturePickups(db, departure.departure_id, now), { code: "NOT_FOUND", status: 404 });
  }
  for (const data of [{ status: "Open", is_demo: true }, { is_demo: false, booking_deadline: now },
    { booking_deadline: now, departure_date: now }]) {
    await db.departure.update({ where: { departure_id: departure.departure_id }, data });
    await assert.rejects(readPublicDeparturePickups(db, departure.departure_id, now), { code: "NOT_FOUND", status: 404 });
  }
  await db.departure.update({ where: { departure_id: departure.departure_id }, data: {
    departure_date: new Date("2035-01-02T02:00:00Z"), booking_deadline: new Date("2035-01-01T02:00:00Z") } });
  await db.trip.update({ where: { trip_id: trip.trip_id }, data: { is_active: false } });
  await assert.rejects(readPublicDeparturePickups(db, departure.departure_id, now), { code: "NOT_FOUND", status: 404 });
});

test("empty schedules are explicit and missing/invalid departure IDs fail consistently", async () => {
  await db.departurePickup.deleteMany({ where: { departure_id: departure.departure_id } });
  assert.deepEqual(await readPublicDeparturePickups(db, departure.departure_id, now), { departure_id: departure.departure_id, pickups: [] });
  await assert.rejects(readPublicDeparturePickups(db, 2147483647, now), { code: "NOT_FOUND", status: 404 });
  for (const id of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    await assert.rejects(readPublicDeparturePickups(db, id, now), { code: "INVALID_INPUT", status: 422 });
  }
});

test("the public dep_pickup_id feeds the real hold transaction; read requests have no side effects", async () => {
  const vehicle = await db.vehicle.create({ data: { plate_number: "PICKUP-TEST", vehicle_type: "Fixture", seat_count: 1,
    seats: { create: { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 } } }, include: { seats: true } });
  const assignment = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  const seat = await db.departureSeat.create({ data: { dep_vehicle_id: assignment.dep_vehicle_id, seat_id: vehicle.seats[0].seat_id } });
  const pickups = await readPublicDeparturePickups(db, departure.departure_id, now);
  const selected = pickups.pickups[0]; assert.notEqual(selected.dep_pickup_id, selected.pickup_id);
  const hold = await holdSeats(db, buyer, departure.departure_id, { idempotency_key: "public-pickup-hold-01", seats: [{
    dep_seat_id: seat.dep_seat_id, dep_pickup_id: selected.dep_pickup_id, passenger_name: "Fixture passenger",
    passenger_phone: "0901234567", emergency_contact: "Fixture contact", health_declaration: true,
  }] }, now);
  const before = await Promise.all([db.invoice.findMany(), db.invoiceDetail.findMany(), db.departureSeat.findMany()]);
  assert.equal(hold.tickets[0].dep_pickup_id, selected.dep_pickup_id);
  assert.equal(hold.status, "Pending");
  await readPublicDeparturePickups(db, departure.departure_id, now);
  assert.deepEqual(await Promise.all([db.invoice.findMany(), db.invoiceDetail.findMany(), db.departureSeat.findMany()]), before);
  assert.equal(await db.auditLog.count(), 0);
});
