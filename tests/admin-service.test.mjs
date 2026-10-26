import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { listAuditLogs, listSettings, listUsers, updateSetting } from "../src/server/services/admin.ts";
import { updateAccountAccess } from "../src/server/services/accounts.ts";

let database, db, admin, others;
before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff, system_settings RESTART IDENTITY CASCADE");
  const actors = [];
  for (const [role, name] of [["Admin", "Quản trị"], ["Customer", "Nguyễn Văn_A"], ["Customer", "Trần Thị B"], ["RouteMgr", "Điều hành"],
    ["HRMgr", "Nhân sự"], ["Leader", "Trưởng đoàn"], ["Accountant", "Kế toán"]]) {
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
  assert.equal(all.pagination.totalItems, 7);
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
    [["LEADER_RATIO", true], ["LEGACY_FLAG", false], ["MAX_SEATS_PER_INVOICE", true], ["SEAT_TTL_MINUTES", true]]);
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
});
