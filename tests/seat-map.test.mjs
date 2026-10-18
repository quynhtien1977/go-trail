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
    await departure({ status: "Draft" }),
    await departure({ is_demo: true }),
    await departure({ booking_deadline: new Date("2026-10-17T00:00:00Z") }),
  ];
  for (const dep of hidden) await assert.rejects(readPublicSeatMap(db, dep.departure_id, now), { code: "NOT_FOUND", status: 404 });
  const open = await departure();
  await db.trip.update({ where: { trip_id: trip.trip_id }, data: { is_active: false } });
  await assert.rejects(readPublicSeatMap(db, open.departure_id, now), { code: "NOT_FOUND" });
  await assert.rejects(readPublicSeatMap(db, 0, now), { code: "INVALID_INPUT" });
});
