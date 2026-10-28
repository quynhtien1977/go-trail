import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { holdSeats } from "../src/server/services/bookings.ts";

let database, db, buyer, buyer2, owner, staffActors, departure, seatIds, pickupId;
const now = new Date("2026-10-18T00:00:00Z");
const later = (minutes) => new Date(now.getTime() + minutes * 60_000);
const tripInput = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
  base_price: "500000", description: "Tuyến tham khảo.", schedule_content: "Lịch trình." };
const passenger = (dep_seat_id) => ({ dep_seat_id, dep_pickup_id: pickupId, passenger_name: "Hành khách",
  passenger_phone: "0912345678", emergency_contact: "Người thân 0987654321", health_declaration: true });
const request = (ids, key = "key-0000000000000001") => ({ idempotency_key: key, seats: ids.map(passenger) });

async function makeDeparture(data = {}) {
  const { trip_id } = await db.trip.findFirstOrThrow();
  const dep = await db.departure.create({ data: { trip_id, departure_date: new Date("2026-11-20T01:00:00Z"),
    booking_deadline: new Date("2026-11-19T10:00:00Z"), min_passengers: 1, status: "Open", invoice_owner_user_id: owner.user_id, ...data } });
  const pickup = await db.pickupPoint.findFirstOrThrow();
  const depPickup = await db.departurePickup.create({ data: { departure_id: dep.departure_id, pickup_id: pickup.pickup_id,
    pickup_time: new Date("2026-11-20T00:30:00Z") } });
  const vehicle = await db.vehicle.findFirstOrThrow({ include: { seats: { orderBy: { seat_id: "asc" } } } });
  const assigned = await db.departureVehicle.create({ data: { departure_id: dep.departure_id, vehicle_id: vehicle.vehicle_id } });
  await db.departureSeat.createMany({ data: vehicle.seats.map((seat) => ({ dep_vehicle_id: assigned.dep_vehicle_id, seat_id: seat.seat_id })) });
  const seats = await db.departureSeat.findMany({ where: { dep_vehicle_id: assigned.dep_vehicle_id }, orderBy: { dep_seat_id: "asc" } });
  return { departure: dep, seatIds: seats.map((seat) => seat.dep_seat_id), pickupId: depPickup.dep_pickup_id };
}

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, system_settings RESTART IDENTITY CASCADE");
  const actors = {};
  for (const role of ["Customer", "Customer2", "RouteMgr", "HRMgr", "Leader", "Admin"]) {
    const user = await db.user.create({ data: { email: `${role}@hold.example.test`, password_hash: "x", full_name: `${role} Name`,
      phone: "0900000000", role: role === "Customer2" ? "Customer" : role } });
    actors[role] = { user_id: user.user_id, role: role === "Customer2" ? "Customer" : role, auth_version: 0 };
  }
  ({ Customer: buyer, Customer2: buyer2, RouteMgr: owner } = actors);
  staffActors = [actors.RouteMgr, actors.HRMgr, actors.Leader];
  const trip = await db.trip.create({ data: tripInput });
  await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Điểm A", address: "Địa chỉ A" } });
  await db.vehicle.create({ data: { plate_number: "51B-111.11", vehicle_type: "Xe 29 chỗ", seat_count: 3, seats: { create: [
    { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 },
    { seat_name: "A02", floor_level: 1, x_position: 1, y_position: 0 },
    { seat_name: "A03", floor_level: 1, x_position: 2, y_position: 0 },
  ] } } });
  ({ departure, seatIds, pickupId } = await makeDeparture());
});
after(async () => { await database?.close(); });

test("holding seats creates one Pending invoice with owner snapshot, locks seats and replays on retry", async () => {
  const hold = await holdSeats(db, buyer, departure.departure_id, request([seatIds[1], seatIds[0]]), now);
  assert.equal(hold.status, "Pending");
  assert.equal(hold.total_amount, "1000000");
  assert.equal(hold.expires_at, later(15).toISOString());
  assert.match(hold.payment_code, /^GT[0-9A-F]{10}$/);
  assert.deepEqual(hold.tickets.map((item) => [item.seat_name, item.unit_price]), [["A01", "500000"], ["A02", "500000"]]);
  const invoice = await db.invoice.findUniqueOrThrow({ where: { invoice_id: hold.invoice_id } });
  assert.deepEqual([invoice.responsible_user_id, invoice.responsible_name_snapshot, invoice.responsible_role_snapshot],
    [owner.user_id, "RouteMgr Name", "RouteMgr"]);
  const seats = await db.departureSeat.findMany({ where: { dep_seat_id: { in: seatIds.slice(0, 2) } } });
  assert.ok(seats.every((seat) => seat.status === "Locked" && seat.invoice_id === hold.invoice_id
    && seat.locked_until.getTime() === later(15).getTime()));

  // Retry after the owner was renamed: same invoice, unchanged snapshot.
  await db.user.update({ where: { user_id: owner.user_id }, data: { full_name: "Đổi tên" } });
  assert.deepEqual(await holdSeats(db, buyer, departure.departure_id, request([seatIds[0], seatIds[1]]), later(1)), hold);
  assert.equal(await db.invoice.count(), 1);
  assert.equal((await db.invoice.findFirstOrThrow()).responsible_name_snapshot, "RouteMgr Name");
  await assert.rejects(holdSeats(db, buyer, departure.departure_id, request([seatIds[2]]), now), { code: "RESOURCE_CONFLICT" });
});

test("one unavailable or foreign seat rolls the whole hold back and never takes a Sold seat", async () => {
  const paid = await db.invoice.create({ data: { customer_id: buyer2.user_id, departure_id: departure.departure_id, payment_code: "GTPAID",
    total_amount: "500000", status: "Paid", expires_at: later(-60) } });
  await db.departureSeat.update({ where: { dep_seat_id: seatIds[2] }, data: { status: "Sold", invoice_id: paid.invoice_id } });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id, request([seatIds[0], seatIds[2]]), now), { code: "RESOURCE_CONFLICT" });
  const other = await makeDeparture({ departure_date: new Date("2026-11-21T01:00:00Z") });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id, request([seatIds[0], other.seatIds[0]], "key-0000000000000002"), now),
    { code: "INVALID_INPUT" });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id,
    { idempotency_key: "key-0000000000000003", seats: [{ ...passenger(seatIds[0]), dep_pickup_id: other.pickupId }] }, now), { code: "INVALID_INPUT" });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id,
    { idempotency_key: "key-0000000000000004", seats: [{ ...passenger(seatIds[0]), health_declaration: false }] }, now), { code: "INVALID_INPUT" });
  assert.equal(await db.invoice.count(), 1);
  assert.equal(await db.invoiceDetail.count(), 0);
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: seatIds[0] } })).status, "Available");
});

test("expired Pending holds are reclaimed and fully released; live or paid holds are not", async () => {
  const first = await holdSeats(db, buyer, departure.departure_id, request([seatIds[0], seatIds[1]]), now);
  await assert.rejects(holdSeats(db, buyer2, departure.departure_id, request([seatIds[0]]), later(5)), { code: "RESOURCE_CONFLICT" });
  const second = await holdSeats(db, buyer2, departure.departure_id, request([seatIds[0]]), later(15));
  assert.equal(second.status, "Pending");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: first.invoice_id } })).status, "Expired");
  assert.deepEqual((await db.invoiceDetail.findMany({ where: { invoice_id: first.invoice_id } })).map((row) => row.status), ["Cancelled", "Cancelled"]);
  const released = await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: seatIds[1] } });
  assert.deepEqual([released.status, released.invoice_id, released.locked_until], ["Available", null, null]);
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: seatIds[0] } })).invoice_id, second.invoice_id);

  // A payment that landed on the hold keeps it, even after the TTL.
  const third = await holdSeats(db, buyer, departure.departure_id, request([seatIds[2]], "key-0000000000000009"), later(16));
  await db.invoice.update({ where: { invoice_id: third.invoice_id }, data: { status: "Paid" } });
  await assert.rejects(holdSeats(db, buyer2, departure.departure_id, request([seatIds[2]], "key-000000000000000a"), later(60)), { code: "RESOURCE_CONFLICT" });
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: seatIds[2] } })).invoice_id, third.invoice_id);
});

test("the seat limit comes from settings and only Customers can hold seats", async () => {
  await db.systemSetting.create({ data: { setting_key: "MAX_SEATS_PER_INVOICE", setting_value: "2", description: "test" } });
  await db.systemSetting.create({ data: { setting_key: "SEAT_TTL_MINUTES", setting_value: "5", description: "test" } });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id, request(seatIds), now), { code: "INVALID_INPUT" });
  const hold = await holdSeats(db, buyer, departure.departure_id, request(seatIds.slice(0, 2)), now);
  assert.equal(hold.expires_at, later(5).toISOString());
  for (const actor of staffActors) {
    await assert.rejects(holdSeats(db, { ...actor, role: "Customer" }, departure.departure_id, request([seatIds[2]], "key-0000000000000005"), now),
      { code: "FORBIDDEN" });
  }
  await assert.rejects(holdSeats(db, null, departure.departure_id, request([seatIds[2]]), now), { code: "UNAUTHENTICATED" });
});

test("demo, closed or late departures and missing/Locked/non-RouteMgr owners block the hold", async () => {
  const blocked = async (data, ownerChange) => {
    const fixture = await makeDeparture({ departure_date: new Date(`2026-12-${String(10 + (++blocked.n)).padStart(2, "0")}T01:00:00Z`), ...data });
    if (ownerChange) await ownerChange();
    await assert.rejects(holdSeats(db, buyer, fixture.departure.departure_id,
      { idempotency_key: `key-blocked-0000000${blocked.n}`, seats: [{ ...passenger(fixture.seatIds[0]), dep_pickup_id: fixture.pickupId }] }, now),
      { code: "RESOURCE_CONFLICT" });
  };
  blocked.n = 0;
  await blocked({ is_demo: true });
  await blocked({ status: "Draft" });
  await blocked({ booking_deadline: later(-1) });
  await blocked({ invoice_owner_user_id: null });
  await blocked({}, () => db.user.update({ where: { user_id: owner.user_id }, data: { status: "Locked" } }));
  await db.user.update({ where: { user_id: owner.user_id }, data: { status: "Active", role: "HRMgr" } });
  await blocked({});
  assert.equal(await db.invoice.count(), 0);
});

test("two customers racing for one seat get exactly one hold", async () => {
  const results = await Promise.allSettled([
    holdSeats(db, buyer, departure.departure_id, request([seatIds[0]], "key-race-00000000001"), now),
    holdSeats(db, buyer2, departure.departure_id, request([seatIds[0]], "key-race-00000000002"), now),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "RESOURCE_CONFLICT");
  assert.equal(await db.invoice.count(), 1);
});

test("idempotency compares the complete normalized passenger and pickup request", async () => {
  const input = request([seatIds[0]]);
  const hold = await holdSeats(db, buyer, departure.departure_id, input, now);
  for (const change of [{ passenger_name: "Khách khác" }, { passenger_phone: "0999999999" },
    { emergency_contact: "Liên hệ khác" }, { dep_pickup_id: pickupId + 1 }]) {
    await assert.rejects(holdSeats(db, buyer, departure.departure_id,
      { ...input, seats: [{ ...input.seats[0], ...change }] }, later(1)), { code: "RESOURCE_CONFLICT", status: 409 });
  }
  assert.deepEqual(await holdSeats(db, buyer, departure.departure_id, input, later(2)), hold);
  assert.equal(await db.invoice.count(), 1);
});

test("a pickup retired after opening cannot receive a new booking", async () => {
  await db.pickupPoint.updateMany({ data: { is_active: false } });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id, request([seatIds[0]]), now), { code: "INVALID_INPUT", status: 422 });
  assert.equal(await db.invoice.count(), 0);
});

test("an expired foreign hold cannot bypass departure scope during reclamation", async () => {
  const other = await makeDeparture({ departure_date: new Date("2026-11-21T01:00:00Z") });
  await holdSeats(db, buyer2, other.departure.departure_id, { idempotency_key: "foreign-expired-0001",
    seats: [{ ...passenger(other.seatIds[0]), dep_pickup_id: other.pickupId }] }, now);
  await assert.rejects(holdSeats(db, buyer, departure.departure_id,
    request([seatIds[0], other.seatIds[0]]), later(16)), { code: "INVALID_INPUT", status: 422 });
  assert.equal(await db.invoice.count(), 1);
  assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: seatIds[0] } })).status, "Available");
});

test("the default ten-seat limit is enforced and client-supplied business fields are rejected", async () => {
  const assignment = await db.departureVehicle.findFirstOrThrow();
  for (let index = 3; index < 11; index++) {
    const seat = await db.vehicleSeat.create({ data: { vehicle_id: assignment.vehicle_id, seat_name: `A${index + 1}`,
      floor_level: 1, x_position: index, y_position: 0 } });
    const row = await db.departureSeat.create({ data: { dep_vehicle_id: assignment.dep_vehicle_id, seat_id: seat.seat_id } });
    seatIds.push(row.dep_seat_id);
  }
  for (const input of [request(seatIds), request([seatIds[0], seatIds[0]]),
    { ...request([seatIds[0]]), responsible_user_id: owner.user_id },
    { ...request([seatIds[0]]), total_amount: "1" }, { ...request([seatIds[0]]), customer_id: buyer2.user_id }]) {
    await assert.rejects(holdSeats(db, buyer, departure.departure_id, input, now), { code: "INVALID_INPUT", status: 422 });
  }
  assert.equal(await db.invoice.count(), 0);
  const hold = await holdSeats(db, buyer, departure.departure_id, request(seatIds.slice(0, 10)), now);
  assert.equal(hold.tickets.length, 10);
  assert.equal(hold.total_amount, "5000000");
  assert.equal(hold.responsible_name_snapshot, "RouteMgr Name");
  assert.equal(hold.responsible_role_snapshot, "RouteMgr");
  const serialized = JSON.stringify(hold);
  for (const field of ["responsible_user_id", "passenger_phone", "emergency_contact", "auth_version", "password_hash"]) {
    assert.ok(!serialized.includes(field));
  }
});

test("owner reassignment and account changes affect only new invoices and never revive a revoked buyer", async () => {
  const input = request([seatIds[0]]);
  const first = await holdSeats(db, buyer, departure.departure_id, input, now);
  const other = await db.user.create({ data: { email: "new-owner@hold.example.test", full_name: "New owner", phone: "0901234567",
    password_hash: "unused", role: "RouteMgr" } });
  await db.departure.update({ where: { departure_id: departure.departure_id }, data: { invoice_owner_user_id: other.user_id } });
  await db.user.update({ where: { user_id: owner.user_id }, data: { full_name: "Renamed", role: "HRMgr", status: "Locked" } });
  assert.deepEqual(await holdSeats(db, buyer, departure.departure_id, input, later(1)), first);
  const second = await holdSeats(db, buyer, departure.departure_id, request([seatIds[1]], "new-owner-key-0001"), later(1));
  assert.equal(second.responsible_name_snapshot, "New owner");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: first.invoice_id } })).responsible_user_id, owner.user_id);
  await db.user.update({ where: { user_id: buyer.user_id }, data: { auth_version: { increment: 1 } } });
  await assert.rejects(holdSeats(db, buyer, departure.departure_id, input, later(2)), { code: "UNAUTHENTICATED" });
  assert.equal(await db.invoice.count(), 2);
});

test("a failure after expired-hold cleanup rolls back invoices, snapshots, tickets and every seat", async () => {
  await holdSeats(db, buyer, departure.departure_id, request(seatIds.slice(0, 2)), now);
  const snapshot = async () => ({ invoices: await db.invoice.findMany(), details: await db.invoiceDetail.findMany(),
    seats: await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }) });
  const before = await snapshot();
  await database.sql.exec(`CREATE FUNCTION reject_test_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'isolated test failure'; END $$;
    CREATE TRIGGER reject_test_ticket BEFORE INSERT ON invoice_details FOR EACH ROW EXECUTE FUNCTION reject_test_ticket();`);
  try {
    await assert.rejects(holdSeats(db, buyer2, departure.departure_id, request([seatIds[0]]), later(16)));
    assert.deepEqual(await snapshot(), before);
  } finally {
    await database.sql.exec("DROP TRIGGER reject_test_ticket ON invoice_details; DROP FUNCTION reject_test_ticket()");
  }
});

test("cleanup refuses inconsistent Pending invoices with a Valid ticket", async () => {
  const old = await holdSeats(db, buyer, departure.departure_id, request(seatIds.slice(0, 2)), now);
  await db.invoiceDetail.update({ where: { detail_id: old.tickets[0].detail_id }, data: { status: "Valid", ticket_code: "VALID-PRESERVED" } });
  await assert.rejects(holdSeats(db, buyer2, departure.departure_id, request([seatIds[1]]), later(16)), { code: "RESOURCE_CONFLICT" });
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: old.invoice_id } })).status, "Pending");
  assert.equal((await db.invoiceDetail.findUniqueOrThrow({ where: { detail_id: old.tickets[0].detail_id } })).status, "Valid");
  assert.equal(await db.departureSeat.count({ where: { invoice_id: old.invoice_id, status: "Locked" } }), 2);
});
