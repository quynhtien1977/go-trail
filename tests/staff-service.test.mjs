import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { compare } from "bcryptjs";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { createStaff, deactivateStaff, listStaff, readStaff, updateStaff } from "../src/server/services/staff.ts";

let database, db, hr, admin, others;
const now = new Date("2026-10-29T03:00:00Z");
const driver = { full_name: "Nguyễn Văn Tài", phone: "0901234567", staff_type: "Driver",
  license_number: "790123456789", license_class: "D", license_expiry: "2027-06-30" };
const assistant = { full_name: "Trần Phụ Xe", phone: "0907654321", staff_type: "Assistant" };
const leader = { full_name: "Lê Dẫn Đoàn", phone: "0912345678", staff_type: "Leader",
  account: { email: "  Leader.New@Example.Test ", password: "correct horse battery" } };

before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff RESTART IDENTITY CASCADE");
  const actors = [];
  for (const [index, role] of ["HRMgr", "Admin", "RouteMgr", "Leader", "Customer"].entries()) {
    const user = await db.user.create({ data: { email: `${role}${index}@staff.example.test`, password_hash: "unused-test-hash",
      full_name: `${role} ${index}`, phone: "0901234567", role } });
    actors.push({ user_id: user.user_id, role, auth_version: 0 });
  }
  [hr, admin, ...others] = actors;
});
after(async () => { await database?.close(); });

// Holds the staff member on a departure in the given status.
async function assign(staffId, role, status, date = "2026-12-01T01:00:00Z") {
  const trip = await db.trip.create({ data: { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
    base_price: "500000", description: "Tuyến.", schedule_content: "Lịch." } });
  const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status, min_passengers: 1,
    departure_date: new Date(date), booking_deadline: new Date("2026-11-30T00:00:00Z") } });
  const vehicle = await db.vehicle.create({ data: { plate_number: `51B-${trip.trip_id}`, vehicle_type: "Xe 29 chỗ", seat_count: 1 } });
  const assigned = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  await db.departureStaff.create({ data: { departure_id: departure.departure_id, dep_vehicle_id: assigned.dep_vehicle_id, staff_id: staffId, role_in_trip: role } });
  return departure;
}

test("HRMgr records Drivers with a valid licence and Assistants without accounts or licence data", async () => {
  const created = await createStaff(db, hr, driver, now);
  assert.deepEqual(created, { staff_id: created.staff_id, full_name: driver.full_name, phone: driver.phone, staff_type: "Driver",
    license_number: driver.license_number, license_class: "D", license_expiry: "2027-06-30", status: "Active", account: null });
  assert.equal((await createStaff(db, admin, assistant, now)).account, null);
  assert.deepEqual(await readStaff(db, admin, created.staff_id), created);
  assert.equal(await db.user.count(), 5);

  const reject = (input) => assert.rejects(createStaff(db, hr, input, now), { code: "INVALID_INPUT" }, JSON.stringify(input));
  await reject({ ...driver, license_number: undefined });
  await reject({ ...driver, license_class: null });
  await reject({ ...driver, license_expiry: undefined });
  await reject({ ...driver, license_expiry: "2026-10-28" });
  await reject({ ...driver, license_expiry: "2026-13-01" });
  await reject({ ...assistant, license_number: "123" });
  await reject({ ...assistant, account: leader.account });
  await reject({ ...driver, account: leader.account });
  await reject({ ...assistant, staff_type: "RouteMgr" });
  await reject({ ...assistant, user_id: others[1].user_id });
  // A licence expiring today (Vietnam date) is still valid for today's assignments.
  assert.equal((await createStaff(db, hr, { ...driver, license_expiry: "2026-10-29" }, now)).license_expiry, "2026-10-29");
  assert.equal(await db.staff.count(), 3);
});

test("a Leader's account and STAFF record are created atomically with an audit and no secrets in the DTO", async () => {
  const created = await createStaff(db, hr, leader, now);
  assert.equal(created.staff_type, "Leader");
  assert.equal(created.account.email, "leader.new@example.test");
  assert.equal(created.account.status, "Active");
  assert.deepEqual(Object.keys(created.account).sort(), ["email", "status", "user_id"]);
  const user = await db.user.findUniqueOrThrow({ where: { user_id: created.account.user_id }, include: { staff: true } });
  assert.equal(user.role, "Leader");
  assert.equal(user.staff.staff_id, created.staff_id);
  assert.ok(await compare(leader.account.password, user.password_hash));
  const log = await db.auditLog.findFirstOrThrow({ where: { action: "LeaderAccountCreated" } });
  assert.equal(log.user_id, hr.user_id);
  assert.equal(log.table_name, "users");
  assert.deepEqual(JSON.parse(log.description), { action: "LeaderAccountCreated", record_id: user.user_id });

  const counts = async () => [await db.user.count(), await db.staff.count(), await db.auditLog.count()];
  const before = await counts();
  await assert.rejects(createStaff(db, admin, { ...leader, full_name: "Người khác" }, now), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(createStaff(db, hr, { ...leader, account: undefined }, now), { code: "INVALID_INPUT" });
  await assert.rejects(createStaff(db, hr, { ...leader, account: { ...leader.account, email: "x@example.test", password: "short" } }, now),
    { code: "INVALID_INPUT" });
  await assert.rejects(createStaff(db, hr, { ...leader, account: { ...leader.account, role: "Admin" } }, now), { code: "INVALID_INPUT" });
  assert.deepEqual(await counts(), before);
});

test("only HRMgr and Admin manage staff; the DB role decides, not the session claim", async () => {
  const created = await createStaff(db, hr, assistant, now);
  for (const actor of others) {
    const forged = { ...actor, role: "HRMgr" };
    await assert.rejects(createStaff(db, forged, assistant, now), { code: "FORBIDDEN" });
    await assert.rejects(listStaff(db, forged), { code: "FORBIDDEN" });
    await assert.rejects(readStaff(db, forged, created.staff_id), { code: "FORBIDDEN" });
    await assert.rejects(updateStaff(db, forged, created.staff_id, { phone: "0900000000" }, now), { code: "FORBIDDEN" });
    await assert.rejects(deactivateStaff(db, forged, created.staff_id), { code: "FORBIDDEN" });
  }
  await assert.rejects(createStaff(db, null, assistant, now), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: hr.user_id }, data: { status: "Locked" } });
  await assert.rejects(listStaff(db, hr), { code: "UNAUTHENTICATED" });
  assert.equal(await db.staff.count(), 1);
});

test("lists and filters staff with paging", async () => {
  await createStaff(db, hr, driver, now);
  await createStaff(db, hr, assistant, now);
  await createStaff(db, hr, leader, now);
  const page = await listStaff(db, hr, { pageSize: "2" });
  assert.deepEqual(page.items.map((item) => item.staff_type), ["Driver", "Assistant"]);
  assert.deepEqual(page.pagination, { page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
  assert.deepEqual((await listStaff(db, admin, { staff_type: "Leader" })).items.map((item) => item.full_name), [leader.full_name]);
  await assert.rejects(listStaff(db, hr, { staff_type: "Admin" }), { code: "INVALID_INPUT" });
  await assert.rejects(readStaff(db, hr, 999), { code: "NOT_FOUND" });
});

test("assigned crew stay Active and Drivers keep a licence covering every departure that still holds them", async () => {
  const created = await createStaff(db, hr, driver, now);
  const departure = await assign(created.staff_id, "Driver", "Open");
  await assert.rejects(deactivateStaff(db, hr, created.staff_id), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(updateStaff(db, hr, created.staff_id, { status: "Inactive" }, now), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(updateStaff(db, hr, created.staff_id, { license_expiry: "2026-11-30" }, now), { code: "RESOURCE_CONFLICT" });
  await assert.rejects(updateStaff(db, hr, created.staff_id, { license_number: null }, now), { code: "INVALID_INPUT" });
  await assert.rejects(updateStaff(db, hr, created.staff_id, { staff_type: "Assistant" }, now), { code: "INVALID_INPUT" });
  // The departure day itself (Vietnam date 2026-12-01) is still covered.
  assert.equal((await updateStaff(db, hr, created.staff_id, { license_expiry: "2026-12-01", phone: "0911111111" }, now)).phone, "0911111111");
  assert.equal((await readStaff(db, hr, created.staff_id)).status, "Active");

  await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status: "Ended" } });
  const inactive = await deactivateStaff(db, admin, created.staff_id);
  assert.equal(inactive.status, "Inactive");
  assert.equal((await deactivateStaff(db, hr, created.staff_id)).status, "Inactive");
  assert.equal(await db.departureStaff.count(), 1);

  const helper = await createStaff(db, hr, assistant, now);
  await assign(helper.staff_id, "Assistant", "Confirmed");
  await assert.rejects(updateStaff(db, hr, helper.staff_id, { license_class: "B2" }, now), { code: "INVALID_INPUT" });
  assert.equal((await updateStaff(db, hr, helper.staff_id, { full_name: "Trần Phụ Xe Mới" }, now)).full_name, "Trần Phụ Xe Mới");
  await assert.rejects(deactivateStaff(db, hr, helper.staff_id), { code: "RESOURCE_CONFLICT" });
  assert.equal(await db.auditLog.count(), 0);
});
