import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { assignVehicle } from "../src/server/services/assignments.ts";
import { readPublicSeatMap } from "../src/server/services/seat-map.ts";

let database, db, hr, customer, trip;
const now = new Date("2026-10-18T00:00:00Z");
const tripInput = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
  base_price: "500000", description: "Tuyến tham khảo.", schedule_content: "Lịch trình." };

async function vehicle(plate, prefix) {
  return db.vehicle.create({ data: { plate_number: plate, vehicle_type: `Xe ${prefix}`, seat_count: 3, seats: { create: [
    { seat_name: `${prefix}02`, floor_level: 1, x_position: 1, y_position: 0 },
    { seat_name: `${prefix}01`, floor_level: 1, x_position: 0, y_position: 0 },
    { seat_name: `${prefix}03`, floor_level: 2, x_position: 0, y_position: 0 },
  ] } } });
}
async function departure(data = {}) {
  return db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2026-11-20T01:00:00Z"),
    booking_deadline: new Date("2026-11-19T10:00:00Z"), min_passengers: 1, status: "Open", ...data } });
}

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles RESTART IDENTITY CASCADE");
  const hrUser = await db.user.create({ data: { email: "hr@seat.example.test", password_hash: "x", full_name: "HR", phone: "0900000000", role: "HRMgr" } });
  const buyer = await db.user.create({ data: { email: "buyer@seat.example.test", password_hash: "x", full_name: "Người Mua Bí Mật",
    phone: "0911111111", role: "Customer" } });
  hr = { user_id: hrUser.user_id, role: "HRMgr", auth_version: 0 };
  customer = buyer;
  trip = await db.trip.create({ data: tripInput });
});
after(async () => { await database?.close(); });

test("seat map groups seats by their own vehicle, orders the layout and hides buyer data", async () => {
  const dep = await departure();
  const first = await vehicle("51B-111.11", "A");
  const second = await vehicle("51B-222.22", "B");
  await assignVehicle(db, hr, dep.departure_id, { vehicle_id: first.vehicle_id });
  await assignVehicle(db, hr, dep.departure_id, { vehicle_id: second.vehicle_id });
  const invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: dep.departure_id,
    payment_code: "GTSECRET1", total_amount: "1000000", expires_at: new Date("2026-10-18T00:10:00Z") } });
  const seat = (name) => db.departureSeat.findFirstOrThrow({ where: { seat: { seat_name: name } } });
  const hold = (row, locked_until) => db.departureSeat.update({ where: { dep_seat_id: row.dep_seat_id },
    data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until } });
  await hold(await seat("A01"), new Date("2026-10-17T23:59:00Z"));
  await hold(await seat("A02"), new Date("2026-10-18T00:10:00Z"));
  await db.departureSeat.update({ where: { dep_seat_id: (await seat("B01")).dep_seat_id },
    data: { status: "Sold", invoice_id: invoice.invoice_id } });

  const map = await readPublicSeatMap(db, dep.departure_id, now);
  assert.deepEqual(map.vehicles.map((item) => [item.vehicle_type, item.seats.map((s) => `${s.seat_name}:${s.status}`)]), [
    ["Xe A", ["A01:Available", "A02:Locked", "A03:Available"]],
    ["Xe B", ["B01:Sold", "B02:Available", "B03:Available"]],
  ]);
  const text = JSON.stringify(map);
  for (const secret of ["GTSECRET1", "invoice", "locked_until", "51B-", "Người Mua", "0911111111"]) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(Object.keys(map.vehicles[0].seats[0]).sort(),
    ["dep_seat_id", "floor_level", "seat_name", "status", "x_position", "y_position"]);
  // The stored row is untouched; only the public view treats the stale hold as free.
  assert.equal((await seat("A01")).status, "Locked");
});

test("only open, real departures still on sale expose a seat map", async () => {
  const hidden = [
    ...await Promise.all(["Draft", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]
      .map((status) => departure({ status }))),
    await departure({ is_demo: true }),
    await departure({ booking_deadline: new Date("2026-10-17T00:00:00Z") }),
    await departure({ booking_deadline: now }),
    await departure({ departure_date: now, booking_deadline: now }),
    await departure({ departure_date: new Date("2026-10-17T02:00:00Z"), booking_deadline: new Date("2026-10-17T00:00:00Z") }),
  ];
  for (const dep of hidden) await assert.rejects(readPublicSeatMap(db, dep.departure_id, now), { code: "NOT_FOUND", status: 404 });
  const open = await departure();
  await db.trip.update({ where: { trip_id: trip.trip_id }, data: { is_active: false } });
  await assert.rejects(readPublicSeatMap(db, open.departure_id, now), { code: "NOT_FOUND" });
  await assert.rejects(readPublicSeatMap(db, 0, now), { code: "INVALID_INPUT" });
});

test("expiry at the exact boundary is available without changing stored holds, invoices or Sold seats", async () => {
  const dep = await departure();
  const bus = await vehicle("51B-BOUNDARY", "A");
  await assignVehicle(db, hr, dep.departure_id, { vehicle_id: bus.vehicle_id });
  const seats = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
  const invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: dep.departure_id,
    payment_code: "GTBOUNDARY", total_amount: "1000000", expires_at: now } });
  await db.departureSeat.update({ where: { dep_seat_id: seats[0].dep_seat_id },
    data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until: now } });
  await db.departureSeat.update({ where: { dep_seat_id: seats[1].dep_seat_id },
    data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until: new Date(now.getTime() + 1) } });
  await db.departureSeat.update({ where: { dep_seat_id: seats[2].dep_seat_id },
    data: { status: "Sold", invoice_id: invoice.invoice_id } });
  const before = await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } });
  const readStates = async (at) => new Map((await readPublicSeatMap(db, dep.departure_id, at)).vehicles[0].seats
    .map((seat) => [seat.dep_seat_id, seat.status]));
  const first = await readStates(now);
  assert.equal(first.get(seats[0].dep_seat_id), "Available");
  assert.equal(first.get(seats[1].dep_seat_id), "Locked");
  assert.equal(first.get(seats[2].dep_seat_id), "Sold");
  const later = await readStates(new Date(now.getTime() + 1));
  assert.equal(later.get(seats[1].dep_seat_id), "Available");
  assert.equal(later.get(seats[2].dep_seat_id), "Sold");
  assert.deepEqual(await db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }), before);
  assert.deepEqual(await db.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } }), invoice);
  assert.equal(await db.auditLog.count(), 0);
});

test("the same physical vehicle on another departure cannot leak seat IDs or booking state", async () => {
  const own = await departure();
  const other = await departure({ departure_date: new Date("2026-11-21T01:00:00Z") });
  const bus = await vehicle("51B-SCOPED", "A");
  await assignVehicle(db, hr, own.departure_id, { vehicle_id: bus.vehicle_id });
  await assignVehicle(db, hr, other.departure_id, { vehicle_id: bus.vehicle_id });
  const otherSeats = await db.departureSeat.findMany({ where: { vehicle: { departure_id: other.departure_id } } });
  const invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: other.departure_id,
    payment_code: "GTOTHER", total_amount: "500000", expires_at: now } });
  await db.departureSeat.update({ where: { dep_seat_id: otherSeats[0].dep_seat_id },
    data: { status: "Sold", invoice_id: invoice.invoice_id } });
  const map = await readPublicSeatMap(db, own.departure_id, now);
  assert.equal(map.departure_id, own.departure_id);
  assert.equal(map.vehicles.length, 1);
  assert.equal(map.vehicles[0].seats.length, 3);
  assert.ok(map.vehicles[0].seats.every(seat => seat.status === "Available"
    && !otherSeats.some(otherSeat => otherSeat.dep_seat_id === seat.dep_seat_id)));
});

test("29-seat and 45-seat maps contain every generated seat in layout order", async () => {
  const dep = await departure();
  for (const count of [29, 45]) {
    const seats = Array.from({ length: count }, (_, index) => ({
      seat_name: `S${String(index + 1).padStart(2, "0")}`, floor_level: 1,
      x_position: count === 45 && index >= 40 ? index - 40 : index % 4,
      y_position: Math.floor(index / 4) > 10 ? 10 : Math.floor(index / 4),
    })).reverse();
    const bus = await db.vehicle.create({ data: { plate_number: `51B-FULL-${count}`, vehicle_type: `Xe ${count} chỗ`,
      seat_count: count, seats: { create: seats } } });
    await assignVehicle(db, hr, dep.departure_id, { vehicle_id: bus.vehicle_id });
  }
  const map = await readPublicSeatMap(db, dep.departure_id, now);
  assert.deepEqual(map.vehicles.map(bus => bus.seats.length), [29, 45]);
  assert.equal(new Set(map.vehicles.flatMap(bus => bus.seats.map(seat => seat.dep_seat_id))).size, 74);
  for (const bus of map.vehicles) assert.deepEqual(bus.seats.map(seat => seat.seat_name),
    Array.from({ length: bus.seats.length }, (_, index) => `S${String(index + 1).padStart(2, "0")}`));
});

test("public reads support an empty map and reject missing or invalid departure IDs", async () => {
  const dep = await departure();
  assert.deepEqual(await readPublicSeatMap(db, dep.departure_id, now), { departure_id: dep.departure_id, vehicles: [] });
  await assert.rejects(readPublicSeatMap(db, 2147483647, now), { code: "NOT_FOUND", status: 404 });
  for (const id of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    await assert.rejects(readPublicSeatMap(db, id, now), { code: "INVALID_INPUT", status: 422 });
  }
});
