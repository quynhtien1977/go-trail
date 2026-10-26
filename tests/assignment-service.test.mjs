import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { createMaintenance, updateVehicle } from "../src/server/services/fleet.ts";
import { assignStaff, assignVehicle, listAssignments, unassignStaff, unassignVehicle } from "../src/server/services/assignments.ts";

let database, db, hr, admin, others, departure, vehicle, crew;
const day = new Date("2026-11-20T01:00:00Z");
const tripInput = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
  base_price: "500000", description: "Tuyến tham khảo.", schedule_content: "Lịch trình." };

async function makeVehicle(plate) {
  return db.vehicle.create({ data: { plate_number: plate, vehicle_type: "Xe 29 chỗ", seat_count: 2, seats: { create: [
    { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 },
    { seat_name: "A02", floor_level: 1, x_position: 1, y_position: 0 },
    { seat_name: "A03", floor_level: 1, x_position: 2, y_position: 0, is_active: false },
  ] } } });
}
async function makeDeparture(departure_date = day, status = "Draft") {
  const { trip_id } = await db.trip.findFirstOrThrow();
  return db.departure.create({ data: { trip_id, departure_date, booking_deadline: departure_date, min_passengers: 1, status } });
}

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff RESTART IDENTITY CASCADE");
  const actors = [];
  for (const role of ["HRMgr", "Admin", "RouteMgr", "Customer", "Leader", "Accountant"]) {
    const user = await db.user.create({ data: { email: `${role}@assign.example.test`, password_hash: "unused-test-hash",
      full_name: role, phone: "0901234567", role } });
    actors.push({ user_id: user.user_id, role, auth_version: 0 });
  }
  [hr, admin, ...others] = actors;
  await db.trip.create({ data: tripInput });
  departure = await makeDeparture();
  vehicle = await makeVehicle("51B-111.11");
  const leaderUser = actors.find((actor) => actor.role === "Leader");
  const staff = (data) => db.staff.create({ data: { phone: "0900000000", ...data } });
  crew = {
    driver: await staff({ full_name: "Tài xế", staff_type: "Driver", license_number: "B2-1", license_class: "D", license_expiry: new Date("2027-01-01") }),
    driver2: await staff({ full_name: "Tài xế 2", staff_type: "Driver", license_number: "B2-2", license_class: "D", license_expiry: new Date("2027-01-01") }),
    expired: await staff({ full_name: "Hết hạn", staff_type: "Driver", license_number: "B2-3", license_class: "D", license_expiry: new Date("2026-11-19") }),
    assistant: await staff({ full_name: "Phụ xe", staff_type: "Assistant" }),
    leader: await staff({ full_name: "Leader", staff_type: "Leader", user_id: leaderUser.user_id }),
    leaderNoAccount: await staff({ full_name: "Leader chưa có tài khoản", staff_type: "Leader" }),
  };
});
after(async () => { await database?.close(); });

test("HRMgr/Admin assign a vehicle once and active seats are generated without duplicates on retry", async () => {
  const first = await assignVehicle(db, hr, departure.departure_id, { vehicle_id: vehicle.vehicle_id });
  assert.equal(first.vehicles.length, 1);
  assert.equal(first.vehicles[0].generated_seats, 2);
  const retry = await assignVehicle(db, admin, departure.departure_id, { vehicle_id: vehicle.vehicle_id });
  assert.deepEqual(retry, first);
  assert.equal(await db.departureSeat.count(), 2);
  assert.deepEqual(await listAssignments(db, hr, departure.departure_id), first);
  for (const actor of others) {
    await assert.rejects(assignVehicle(db, { ...actor, role: "Admin" }, departure.departure_id, { vehicle_id: vehicle.vehicle_id }), { code: "FORBIDDEN" });
    await assert.rejects(listAssignments(db, actor, departure.departure_id), { code: "FORBIDDEN" });
  }
  await assert.rejects(assignVehicle(db, hr, departure.departure_id, { vehicle_id: 999 }), { code: "NOT_FOUND" });
  await assert.rejects(assignVehicle(db, hr, 999, { vehicle_id: vehicle.vehicle_id }), { code: "NOT_FOUND" });
});

test("vehicles in maintenance, not Ready or already used that local day are rejected", async () => {
  await createMaintenance(db, hr, vehicle.vehicle_id, { start_date: "2026-11-20", end_date: "2026-11-21", description: "Bảo dưỡng", cost: "1" });
  await assert.rejects(assignVehicle(db, hr, departure.departure_id, { vehicle_id: vehicle.vehicle_id }), { code: "VEHICLE_UNAVAILABLE" });
  const inactive = await makeVehicle("51B-222.22");
  await updateVehicle(db, hr, inactive.vehicle_id, { status: "Maintenance" });
  await assert.rejects(assignVehicle(db, hr, departure.departure_id, { vehicle_id: inactive.vehicle_id }), { code: "VEHICLE_UNAVAILABLE" });

  const shared = await makeVehicle("51B-333.33");
  await assignVehicle(db, hr, departure.departure_id, { vehicle_id: shared.vehicle_id });
  const sameDay = await makeDeparture(new Date("2026-11-20T10:00:00Z"));
  await assert.rejects(assignVehicle(db, hr, sameDay.departure_id, { vehicle_id: shared.vehicle_id }), { code: "VEHICLE_UNAVAILABLE" });
  const nextDay = await makeDeparture(new Date("2026-11-20T17:30:00Z"));
  await assignVehicle(db, hr, nextDay.departure_id, { vehicle_id: shared.vehicle_id });
  const running = await makeDeparture(day, "Running");
  await assert.rejects(assignVehicle(db, hr, running.departure_id, { vehicle_id: shared.vehicle_id }), { code: "RESOURCE_CONFLICT" });
});

test("staff must match role, be Active, hold a valid licence or Leader account, and not be double-booked", async () => {
  await assignVehicle(db, hr, departure.departure_id, { vehicle_id: vehicle.vehicle_id });
  const assign = (staff, role_in_trip, target = departure) => assignStaff(db, hr, target.departure_id,
    { staff_id: staff.staff_id, vehicle_id: vehicle.vehicle_id, role_in_trip });
  const withDriver = await assign(crew.driver, "Driver");
  assert.deepEqual(withDriver.vehicles[0].staff.map((item) => [item.full_name, item.role_in_trip]), [["Tài xế", "Driver"]]);
  assert.deepEqual(await assign(crew.driver, "Driver"), withDriver);
  await assert.rejects(assign(crew.driver2, "Driver"), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(assign(crew.expired, "Driver"), { code: "ACCESS_CONFLICT" });
  await assert.rejects(assign(crew.assistant, "Driver"), { code: "ACCESS_CONFLICT" });
  await assert.rejects(assign(crew.leaderNoAccount, "Leader"), { code: "ACCESS_CONFLICT" });
  await assign(crew.assistant, "Assistant");
  const full = await assign(crew.leader, "Leader");
  assert.equal(full.vehicles[0].staff.length, 3);
  await db.staff.update({ where: { staff_id: crew.driver2.staff_id }, data: { status: "Inactive" } });
  await assert.rejects(assign(crew.driver2, "Driver"), { code: "ACCESS_CONFLICT" });

  const other = await makeVehicle("51B-444.44");
  await assert.rejects(assignStaff(db, hr, departure.departure_id, { staff_id: crew.assistant.staff_id, vehicle_id: other.vehicle_id, role_in_trip: "Assistant" }),
    { code: "INVALID_INPUT" });
  const sameDay = await makeDeparture(new Date("2026-11-20T09:00:00Z"));
  await assignVehicle(db, hr, sameDay.departure_id, { vehicle_id: other.vehicle_id });
  await assert.rejects(assignStaff(db, hr, sameDay.departure_id, { staff_id: crew.driver.staff_id, vehicle_id: other.vehicle_id, role_in_trip: "Driver" }),
    { code: "RESOURCE_CONFLICT" });
  const leaderRow = full.vehicles[0].staff.find((item) => item.role_in_trip === "Leader");
  const afterRemoval = await unassignStaff(db, hr, departure.departure_id, leaderRow.dep_staff_id);
  assert.equal(afterRemoval.vehicles[0].staff.length, 2);
  await assert.rejects(unassignStaff(db, hr, sameDay.departure_id, leaderRow.dep_staff_id), { code: "NOT_FOUND" });
});

test("unassigning never destroys held/sold seats and keeps an Open departure with a vehicle", async () => {
  const assigned = await assignVehicle(db, hr, departure.departure_id, { vehicle_id: vehicle.vehicle_id });
  await assignStaff(db, hr, departure.departure_id, { staff_id: crew.driver.staff_id, vehicle_id: vehicle.vehicle_id, role_in_trip: "Driver" });
  const customer = others.find((actor) => actor.role === "Customer");
  const invoice = await db.invoice.create({ data: { customer_id: customer.user_id, departure_id: departure.departure_id,
    payment_code: "GT0001", total_amount: "500000", expires_at: new Date("2026-11-19T00:00:00Z"), status: "Paid" } });
  const seat = await db.departureSeat.findFirstOrThrow({ where: { dep_vehicle_id: assigned.vehicles[0].dep_vehicle_id } });
  await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id }, data: { status: "Sold", invoice_id: invoice.invoice_id } });
  await assert.rejects(unassignVehicle(db, hr, departure.departure_id, vehicle.vehicle_id), { code: "RESOURCE_CONFLICT" });
  assert.equal(await db.departureSeat.count(), 2);

  const second = await makeVehicle("51B-555.55");
  await assignVehicle(db, hr, departure.departure_id, { vehicle_id: second.vehicle_id });
  const removed = await unassignVehicle(db, hr, departure.departure_id, second.vehicle_id);
  assert.deepEqual(removed.vehicles.map((item) => item.vehicle_id), [vehicle.vehicle_id]);
  assert.equal(await db.departureSeat.count(), 2);

  const open = await makeDeparture(new Date("2026-12-01T01:00:00Z"), "Open");
  await assignVehicle(db, hr, open.departure_id, { vehicle_id: second.vehicle_id });
  await assert.rejects(unassignVehicle(db, hr, open.departure_id, second.vehicle_id), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(unassignVehicle(db, hr, open.departure_id, vehicle.vehicle_id), { code: "NOT_FOUND" });
});
