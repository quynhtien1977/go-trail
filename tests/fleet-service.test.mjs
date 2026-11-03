import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { listVehicles, readVehicle, createVehicle, updateVehicle, addSeat, updateSeat,
  listMaintenance, createMaintenance, assertVehicleAssignable } from "../src/server/services/fleet.ts";

let database, db, hr, admin, others;
const seats = [
  { seat_name: "a01", floor_level: 1, x_position: 0, y_position: 0 },
  { seat_name: "A02", floor_level: 1, x_position: 1, y_position: 0 },
];
const input = { plate_number: " 51b-123.45 ", vehicle_type: "Xe 29 chỗ", seats };
const trip = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
  base_price: "500000", description: "Tuyến tham khảo.", schedule_content: "Lịch trình." };

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles RESTART IDENTITY CASCADE");
  const actors = [];
  for (const role of ["HRMgr", "Admin", "Customer", "Leader", "RouteMgr"]) {
    const user = await db.user.create({ data: { email: `${role}@fleet.example.test`, password_hash: "unused-test-hash",
      full_name: role, phone: "0901234567", role } });
    actors.push({ user_id: user.user_id, role, auth_version: 0 });
  }
  [hr, admin, ...others] = actors;
});
after(async () => { await database?.close(); });

async function assign(vehicleId, departure_date, status = "Open") {
  const { trip_id } = await db.trip.create({ data: trip });
  const departure = await db.departure.create({ data: { trip_id, departure_date, booking_deadline: departure_date,
    min_passengers: 1, status } });
  await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicleId } });
}
const assignable = (vehicleId, date) => db.$transaction((tx) => assertVehicleAssignable(tx, vehicleId, date));

test("HRMgr and Admin create, read, list, update and deactivate vehicles", async () => {
  const created = await createVehicle(db, hr, input);
  assert.equal(created.plate_number, "51B-123.45");
  assert.equal(created.seat_count, 2);
  assert.equal(created.status, "Ready");
  assert.deepEqual(created.seats.map((seat) => seat.seat_name), ["A01", "A02"]);
  assert.deepEqual(await readVehicle(db, admin, created.vehicle_id), created);
  const updated = await updateVehicle(db, admin, created.vehicle_id, { vehicle_type: "Xe 45 chỗ", status: "Inactive" });
  assert.equal(updated.vehicle_type, "Xe 45 chỗ");
  assert.equal((await listVehicles(db, hr, { status: "Inactive" })).pagination.totalItems, 1);
  assert.equal((await listVehicles(db, hr, { status: "Ready" })).pagination.totalItems, 0);
  const log = await db.auditLog.findFirst({ where: { action: "VehicleStatusChanged" } });
  assert.deepEqual(JSON.parse(log.description),
    { action: "VehicleStatusChanged", record_id: created.vehicle_id, from: "Ready", to: "Inactive" });
  assert.equal(log.table_name, "vehicles");
});

test("other roles, spoofed roles, Locked users and revoked versions are rejected", async () => {
  const vehicle = await createVehicle(db, hr, input);
  for (const actor of others) {
    await assert.rejects(createVehicle(db, { ...actor, role: "Admin" }, { ...input, plate_number: "51B-999.99" }), { code: "FORBIDDEN" });
    await assert.rejects(listVehicles(db, actor), { code: "FORBIDDEN" });
    await assert.rejects(addSeat(db, actor, vehicle.vehicle_id, { ...seats[0], seat_name: "B01", x_position: 3 }), { code: "FORBIDDEN" });
    await assert.rejects(createMaintenance(db, actor, vehicle.vehicle_id,
      { start_date: "2026-11-01", end_date: "2026-11-02", description: "Thay dầu", cost: "1000" }), { code: "FORBIDDEN" });
  }
  await assert.rejects(listVehicles(db, null), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: hr.user_id }, data: { status: "Locked" } });
  await assert.rejects(readVehicle(db, hr, vehicle.vehicle_id), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: admin.user_id }, data: { auth_version: 1 } });
  await assert.rejects(listVehicles(db, admin), { code: "UNAUTHENTICATED" });
  assert.equal(await db.vehicle.count(), 1);
});

test("seat names are unique per vehicle, positions do not collide and seats stay on their own vehicle", async () => {
  await assert.rejects(createVehicle(db, hr, { ...input, seats: [seats[0], { ...seats[1], seat_name: "A01" }] }), { code: "INVALID_INPUT" });
  await assert.rejects(createVehicle(db, hr, { ...input, seats: [seats[0], { ...seats[1], x_position: 0 }] }), { code: "INVALID_INPUT" });
  const first = await createVehicle(db, hr, input);
  await assert.rejects(createVehicle(db, hr, { ...input, plate_number: "51b-123.45" }), { code: "RESOURCE_CONFLICT", status: 409 });
  const second = await createVehicle(db, hr, { ...input, plate_number: "51B-678.90" });
  await assert.rejects(addSeat(db, hr, first.vehicle_id, { ...seats[0], x_position: 5 }), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(addSeat(db, hr, first.vehicle_id, { ...seats[0], seat_name: "A03" }), { code: "RESOURCE_CONFLICT" });
  const added = await addSeat(db, hr, first.vehicle_id, { seat_name: "a03", floor_level: 1, x_position: 2, y_position: 0 });
  assert.equal(added.seat_name, "A03");
  assert.equal((await readVehicle(db, hr, first.vehicle_id)).seat_count, 3);
  await assert.rejects(updateSeat(db, hr, first.vehicle_id, second.seats[0].seat_id, { seat_name: "Z01" }), { code: "NOT_FOUND" });
  await assert.rejects(updateSeat(db, hr, first.vehicle_id, added.seat_id, { seat_name: "A01" }), { code: "RESOURCE_CONFLICT" });
  await updateSeat(db, hr, first.vehicle_id, added.seat_id, { is_active: false });
  assert.equal((await readVehicle(db, hr, first.vehicle_id)).seat_count, 2);
  // A deactivated seat frees its position but keeps its row for history.
  await addSeat(db, hr, first.vehicle_id, { seat_name: "A04", floor_level: 1, x_position: 2, y_position: 0 });
  await assert.rejects(updateSeat(db, hr, first.vehicle_id, added.seat_id, { is_active: true }), { code: "RESOURCE_CONFLICT" });
  assert.equal(await db.vehicleSeat.count({ where: { vehicle_id: first.vehicle_id } }), 4);
  await updateSeat(db, hr, second.vehicle_id, second.seats[0].seat_id, { is_active: false });
  await assert.rejects(updateSeat(db, hr, second.vehicle_id, second.seats[1].seat_id, { is_active: false }), { code: "RESOURCE_CONFLICT" });
  assert.equal((await db.vehicleSeat.findUniqueOrThrow({ where: { seat_id: second.seats[1].seat_id } })).is_active, true,
    "Rejecting the last active seat must roll back its update as well as seat_count");
  assert.equal((await readVehicle(db, hr, second.vehicle_id)).seat_count, 1);
});

test("maintenance blocks assignment on its local days, is append-only history and audits cost", async () => {
  const vehicle = await createVehicle(db, hr, input);
  const row = await createMaintenance(db, hr, vehicle.vehicle_id,
    { start_date: "2026-11-10", end_date: "2026-11-12", description: "Bảo dưỡng định kỳ", cost: "2500000" });
  assert.ok(row.maintenance_id > 0);
  assert.deepEqual({ ...row, maintenance_id: 0 }, { maintenance_id: 0, vehicle_id: vehicle.vehicle_id, start_date: "2026-11-10", end_date: "2026-11-12",
    description: "Bảo dưỡng định kỳ", cost: "2500000" });
  // 2026-11-09T17:30Z is 00:30 on 11-10 in Vietnam; 11-12T17:30Z is already 11-13 locally.
  await assert.rejects(assignable(vehicle.vehicle_id, new Date("2026-11-09T17:30:00Z")), { code: "VEHICLE_UNAVAILABLE", status: 409 });
  await assert.rejects(assignable(vehicle.vehicle_id, new Date("2026-11-12T16:59:00Z")), { code: "VEHICLE_UNAVAILABLE" });
  await assignable(vehicle.vehicle_id, new Date("2026-11-12T17:30:00Z"));
  await assignable(vehicle.vehicle_id, new Date("2026-11-09T16:59:00Z"));
  await createMaintenance(db, admin, vehicle.vehicle_id,
    { start_date: "2026-12-01", end_date: "2026-12-01", description: "Thay lốp", cost: "0" });
  const history = await listMaintenance(db, hr, vehicle.vehicle_id);
  assert.deepEqual(history.items.map((item) => item.start_date), ["2026-12-01", "2026-11-10"]);
  const log = await db.auditLog.findFirst({ where: { action: "MoneyRecorded" }, orderBy: { log_id: "asc" } });
  assert.equal(log.table_name, "vehicle_maintenance");
  assert.equal(JSON.parse(log.description).amount, "2500000");
  await assert.rejects(createMaintenance(db, hr, vehicle.vehicle_id,
    { start_date: "2026-11-12", end_date: "2026-11-10", description: "Sai ngày", cost: "1" }), { code: "INVALID_INPUT" });
  await assert.rejects(createMaintenance(db, hr, vehicle.vehicle_id,
    { start_date: "2026-02-30", end_date: "2026-03-01", description: "Ngày không tồn tại", cost: "1" }), { code: "INVALID_INPUT" });
});

test("vehicles with open assignments cannot enter maintenance, change status or edit their layout", async () => {
  const vehicle = await createVehicle(db, hr, input);
  await assign(vehicle.vehicle_id, new Date("2026-11-20T01:00:00Z"));
  await assert.rejects(createMaintenance(db, hr, vehicle.vehicle_id,
    { start_date: "2026-11-20", end_date: "2026-11-20", description: "Trùng chuyến", cost: "1" }), { code: "VEHICLE_UNAVAILABLE" });
  await createMaintenance(db, hr, vehicle.vehicle_id,
    { start_date: "2026-11-21", end_date: "2026-11-22", description: "Sau chuyến", cost: "1" });
  await assert.rejects(updateVehicle(db, hr, vehicle.vehicle_id, { status: "Maintenance" }), { code: "VEHICLE_UNAVAILABLE" });
  await assert.rejects(addSeat(db, hr, vehicle.vehicle_id, { seat_name: "A09", floor_level: 1, x_position: 9, y_position: 0 }),
    { code: "RESOURCE_CONFLICT" });
  await assert.rejects(updateSeat(db, hr, vehicle.vehicle_id, vehicle.seats[0].seat_id, { seat_name: "X1" }), { code: "RESOURCE_CONFLICT" });
  await updateVehicle(db, hr, vehicle.vehicle_id, { vehicle_type: "Xe 29 chỗ đời mới" });

  const ended = await createVehicle(db, hr, { ...input, plate_number: "51B-000.01" });
  await assign(ended.vehicle_id, new Date("2026-10-01T01:00:00Z"), "Ended");
  await updateVehicle(db, hr, ended.vehicle_id, { status: "Maintenance" });
  await assert.rejects(assignable(ended.vehicle_id, new Date("2026-12-01T01:00:00Z")), { code: "VEHICLE_UNAVAILABLE" });
  await updateVehicle(db, hr, ended.vehicle_id, { status: "Ready" });
  await assignable(ended.vehicle_id, new Date("2026-12-01T01:00:00Z"));
  await assert.rejects(assignable(999, new Date()), { code: "NOT_FOUND" });
});

test("vehicle status and maintenance writes roll back when durable audit recording fails", async () => {
  const vehicle = await createVehicle(db, hr, input);
  await database.sql.exec(`CREATE FUNCTION reject_fleet_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.table_name IN ('vehicles', 'vehicle_maintenance') THEN
      RAISE EXCEPTION 'isolated audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_fleet_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fleet_audit();`);
  try {
    await assert.rejects(updateVehicle(db, admin, vehicle.vehicle_id, { status: "Maintenance", vehicle_type: "Must roll back" }));
    const unchanged = await readVehicle(db, hr, vehicle.vehicle_id);
    assert.equal(unchanged.status, "Ready");
    assert.equal(unchanged.vehicle_type, vehicle.vehicle_type);
    await assert.rejects(createMaintenance(db, hr, vehicle.vehicle_id,
      { start_date: "2026-11-01", end_date: "2026-11-02", description: "Must roll back", cost: "150000" }));
    assert.equal(await db.vehicleMaintenance.count({ where: { vehicle_id: vehicle.vehicle_id } }), 0);
    assert.equal(await db.auditLog.count(), 0);
    await assignable(vehicle.vehicle_id, new Date("2026-11-01T01:00:00Z"));
  } finally {
    await database.sql.exec("DROP TRIGGER reject_fleet_audit ON audit_logs; DROP FUNCTION reject_fleet_audit();");
  }
});
