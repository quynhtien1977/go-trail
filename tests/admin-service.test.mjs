import assert from "node:assert/strict";
import { describe, before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { listAuditLogs, listSettings, listUsers, updateSetting } from "../src/server/services/admin.ts";
import { updateAccountAccess } from "../src/server/services/accounts.ts";
import { writeCronDeparturesClosed } from "../src/server/audit.ts";

describe("Admin console", () => {
  let database, db, admin, others;
  before(async () => { database = await createTestDatabase(); db = database.client; });
  beforeEach(async () => {
    await database.sql.exec("TRUNCATE users, trips, vehicles, staff, system_settings RESTART IDENTITY CASCADE");
    const actors = [];
    for (const [role, name] of [["Admin", "Quản trị"], ["Customer", "Nguyễn Văn_A"], ["Customer", "Trần Thị B"], ["RouteMgr", "Điều hành"],
      ["HRMgr", "Nhân sự"], ["Leader", "Trưởng đoàn"]]) {
      const user = await db.user.create({ data: { email: `${role.toLowerCase()}${actors.length}@admin.example.test`,
        password_hash: "secret-hash-value", full_name: name, phone: `09000000${actors.length}0`, role } });
      actors.push({ user_id: user.user_id, role, auth_version: 0 });
    }
    [admin, ...others] = actors;
    await db.staff.create({ data: { full_name: "Trưởng đoàn", phone: "0900000050", staff_type: "Leader", user_id: actors[5].user_id } });
    for (const [setting_key, setting_value] of [["SEAT_TTL_MINUTES", "15"], ["MAX_SEATS_PER_INVOICE", "10"], ["LEADER_RATIO", "15"],
      ["LEGACY_FLAG", "x"]]) await db.systemSetting.create({ data: { setting_key, setting_value, description: setting_key } });
  });
  after(async () => { await database?.close(); });

  test("Admin lists and searches accounts without credential fields", async () => {
    const all = await listUsers(db, admin);
    assert.equal(all.pagination.totalItems, 6);
    assert.deepEqual(Object.keys(all.items[0]).sort(), ["created_at", "email", "full_name", "is_staff", "phone", "role", "status", "user_id"]);
    assert.ok(!JSON.stringify(all).includes("secret-hash-value"));
    assert.equal(all.items.find((user) => user.role === "Leader").is_staff, true);
    assert.deepEqual((await listUsers(db, admin, { q: "nguyễn" })).items.map((user) => user.full_name), ["Nguyễn Văn_A"]);
    // LIKE wildcards are literal.
    assert.equal((await listUsers(db, admin, { q: "_" })).pagination.totalItems, 1);
    assert.equal((await listUsers(db, admin, { role: "Customer", pageSize: "1", page: "2" })).items[0].full_name, "Trần Thị B");
    await updateAccountAccess(db, admin, others[1].user_id, { status: "Locked" });
    assert.equal((await listUsers(db, admin, { status: "Locked" })).pagination.totalItems, 1);
    await assert.rejects(listUsers(db, admin, { role: "Driver" }), { code: "INVALID_INPUT" });
  });

  test("every non-Admin role is rejected by the admin console services", async () => {
    for (const actor of others) {
      await assert.rejects(listUsers(db, { ...actor, role: "Admin" }), { code: "FORBIDDEN" });
      await assert.rejects(listSettings(db, actor), { code: "FORBIDDEN" });
      await assert.rejects(updateSetting(db, actor, "SEAT_TTL_MINUTES", { setting_value: "20" }), { code: "FORBIDDEN" });
      await assert.rejects(listAuditLogs(db, actor), { code: "FORBIDDEN" });
    }
    await assert.rejects(listUsers(db, null), { code: "UNAUTHENTICATED" });
    assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "SEAT_TTL_MINUTES" } })).setting_value, "15");
  });

  test("only known settings change, within range, and each change is audited", async () => {
    const settings = await listSettings(db, admin);
    assert.deepEqual(settings.map((row) => [row.setting_key, row.editable]),
      [["LEADER_RATIO", true], ["MAX_SEATS_PER_INVOICE", true], ["SEAT_TTL_MINUTES", true]]);
    const updated = await updateSetting(db, admin, "MAX_SEATS_PER_INVOICE", { setting_value: "6" });
    assert.equal(updated.setting_value, "6");
    await updateSetting(db, admin, "MAX_SEATS_PER_INVOICE", { setting_value: "6" });
    await assert.rejects(updateSetting(db, admin, "MAX_SEATS_PER_INVOICE", { setting_value: "51" }), { code: "INVALID_INPUT" });
    await assert.rejects(updateSetting(db, admin, "SEAT_TTL_MINUTES", { setting_value: "0" }), { code: "INVALID_INPUT" });
    await assert.rejects(updateSetting(db, admin, "SEAT_TTL_MINUTES", { setting_value: "1.5" }), { code: "INVALID_INPUT" });
    await assert.rejects(updateSetting(db, admin, "LEGACY_FLAG", { setting_value: "1" }), { code: "NOT_FOUND" });
    await assert.rejects(updateSetting(db, admin, "__proto__", { setting_value: "1" }), { code: "NOT_FOUND" });
    const logs = await db.auditLog.findMany({ where: { action: "SettingChanged" } });
    assert.equal(logs.length, 1);
    assert.deepEqual([logs[0].table_name, logs[0].record_id, JSON.parse(logs[0].description)], ["system_settings", "MAX_SEATS_PER_INVOICE",
      { action: "SettingChanged", record_id: "MAX_SEATS_PER_INVOICE", from: "10", to: "6" }]);
  });

  test("reducing the Leader ratio cannot make a Confirmed departure understaffed", async () => {
    const trip = await db.trip.create({ data: { name: "Ratio fixture", city: "Test", location_name: "Test", length_km: "1",
      base_price: "100", description: "Fixture", schedule_content: "Fixture" } });
    const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Pickup", address: "Test" } });
    const dep = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Confirmed", min_passengers: 1,
      departure_date: new Date("2035-01-02T00:00:00Z"), booking_deadline: new Date("2035-01-01T00:00:00Z") } });
    const depPickup = await db.departurePickup.create({ data: { departure_id: dep.departure_id, pickup_id: pickup.pickup_id,
      pickup_time: new Date("2035-01-02T00:00:00Z") } });
    const vehicle = await db.vehicle.create({ data: { plate_number: "RATIO-TEST", vehicle_type: "Fixture", seat_count: 2,
      seats: { create: [0, 1].map(i => ({ seat_name: `A0${i + 1}`, floor_level: 1, x_position: i, y_position: 0 })) } }, include: { seats: true } });
    const assignment = await db.departureVehicle.create({ data: { departure_id: dep.departure_id, vehicle_id: vehicle.vehicle_id } });
    const leader = await db.staff.findFirstOrThrow({ where: { staff_type: "Leader" } });
    await db.departureStaff.create({ data: { departure_id: dep.departure_id, dep_vehicle_id: assignment.dep_vehicle_id,
      staff_id: leader.staff_id, role_in_trip: "Leader" } });
    const invoice = await db.invoice.create({ data: { customer_id: others[0].user_id, departure_id: dep.departure_id,
      payment_code: "RATIO-PAID", total_amount: "200", status: "Paid", expires_at: new Date("2034-01-01T00:00:00Z") } });
    for (const seat of vehicle.seats) {
      const depSeat = await db.departureSeat.create({ data: { dep_vehicle_id: assignment.dep_vehicle_id, seat_id: seat.seat_id,
        status: "Sold", invoice_id: invoice.invoice_id } });
      await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: depSeat.dep_seat_id, dep_pickup_id: depPickup.dep_pickup_id,
        passenger_name: "Passenger", passenger_phone: "0901234567", emergency_contact: "Contact", health_declaration: true, unit_price: "100", status: "Valid" } });
    }
    await assert.rejects(updateSetting(db, admin, "LEADER_RATIO", { setting_value: "1" }), { code: "RESOURCE_CONFLICT" });
    assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "LEADER_RATIO" } })).setting_value, "15");
    assert.equal(await db.auditLog.count({ where: { action: "SettingChanged" } }), 0);
    await updateSetting(db, admin, "LEADER_RATIO", { setting_value: "2" });
    assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "LEADER_RATIO" } })).setting_value, "2");
    await db.departure.update({ where: { departure_id: dep.departure_id }, data: { status: "Running" } });
    await assert.rejects(updateSetting(db, admin, "LEADER_RATIO", { setting_value: "1" }), { code: "RESOURCE_CONFLICT" });
    await updateSetting(db, admin, "LEADER_RATIO", { setting_value: "3" });
    assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "LEADER_RATIO" } })).setting_value, "3");
  });

  test("audit log search filters by table, record, actor and time, newest first", async () => {
    await updateAccountAccess(db, admin, others[0].user_id, { role: "RouteMgr" });
    await updateSetting(db, admin, "LEADER_RATIO", { setting_value: "12" });
    const all = await listAuditLogs(db, admin);
    assert.deepEqual(all.items.map((item) => item.action), ["SettingChanged", "RoleChanged"]);
    assert.equal(all.items[0].actor_name, "Quản trị");
    assert.deepEqual(all.items[1].event, { action: "RoleChanged", record_id: others[0].user_id, from: "Customer", to: "RouteMgr" });
    const byRecord = await listAuditLogs(db, admin, { table_name: "users", record_id: String(others[0].user_id), user_id: String(admin.user_id) });
    assert.deepEqual(byRecord.items.map((item) => item.action), ["RoleChanged"]);
    assert.equal((await listAuditLogs(db, admin, { from: "2099-01-01T00:00:00Z" })).pagination.totalItems, 0);
    await assert.rejects(listAuditLogs(db, admin, { table_name: "users; drop" }), { code: "INVALID_INPUT" });
    await assert.rejects(listAuditLogs(db, admin, { user_id: "2147483648" }), { code: "INVALID_INPUT" });
  });
  test("legacy audit rows remain readable without disclosing arbitrary descriptions", async () => {
    for (const description of ["legacy message", JSON.stringify({ password: "legacy" })]) {
      await db.auditLog.create({ data: { user_id: admin.user_id, action: "Legacy", table_name: "users", record_id: "1", description } });
    }
    const logs = await listAuditLogs(db, admin);
    assert.deepEqual(logs.items.map(row => row.event), [null, null]);
  });

  test("Admin reads real scheduler audits with their actor and reason, without exposing arbitrary fields", async () => {
    await writeCronDeparturesClosed(db, [{ record_id: 42, reason: "deadline" }, { record_id: 43, reason: "sold_out" }]);
    await db.auditLog.create({ data: { user_id: null, action: "DepartureStatusChanged", table_name: "departures", record_id: "44",
      description: JSON.stringify({ action: "DepartureStatusChanged", record_id: 44, from: "Open", to: "Closed", source: "cron",
        reason: "deadline", password: "do-not-expose" }) } });
    const logs = await listAuditLogs(db, admin, { table_name: "departures" });
    const byId = new Map(logs.items.map(row => [row.record_id, row]));
    assert.equal(logs.pagination.totalItems, 3);
    for (const [recordId, reason] of [["42", "deadline"], ["43", "sold_out"]]) {
      const row = byId.get(recordId);
      assert.equal(row.user_id, null);
      assert.equal(row.actor_name, "Hệ thống");
      assert.deepEqual(row.event, { action: "DepartureStatusChanged", record_id: Number(recordId), from: "Open", to: "Closed", source: "cron", reason });
    }
    assert.equal(byId.get("44").event, null);
    assert.ok(!JSON.stringify(logs).includes("do-not-expose"));
    for (const actor of others) await assert.rejects(listAuditLogs(db, actor), { code: "FORBIDDEN" });
  });

  test("two admins cannot concurrently demote one another and leave zero admins", async () => {
    await updateAccountAccess(db, admin, others[0].user_id, { role: "Admin" });
    const second = await db.user.findUniqueOrThrow({ where: { user_id: others[0].user_id } });
    const results = await Promise.allSettled([
      updateAccountAccess(db, admin, second.user_id, { role: "Customer" }),
      updateAccountAccess(db, second, admin.user_id, { role: "Customer" }),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await db.user.count({ where: { role: "Admin", status: "Active" } }), 1);
  });
});
