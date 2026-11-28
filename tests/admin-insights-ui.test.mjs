import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  AUDIT_ACTIONS, SETTING_FIELDS, auditObjectLabel, auditSearchParams, changedSettings, dailySeries, describeAuditChange,
  describeSettingFailure, growth, minimumLeaders, percent, periodRange, previousRange, routeBreakdown, settingValuesFrom,
  settingsClient, validRecordId, validateSetting, validateSettings, vietnamDate,
} from "../src/lib/admin-insights-ui.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const metrics = (ticket_revenue) => ({ ticket_revenue, received: ticket_revenue, surplus: "0", needs_review_amount: "0",
  needs_review_count: 0, pending: 0, paid: 0, expired: 0 });

test("report periods use Vietnam dates and a same-length previous window", () => {
  const now = new Date("2026-10-30T18:30:00.000Z"); // 31/10 01:30 in Vietnam
  assert.equal(vietnamDate(now), "2026-10-31");
  assert.deepEqual(periodRange("today", now), { from: "2026-10-31", to: "2026-10-31" });
  assert.deepEqual(periodRange("7d", now), { from: "2026-10-25", to: "2026-10-31" });
  assert.deepEqual(periodRange("month", now), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(previousRange({ from: "2026-10-01", to: "2026-10-31" }), { from: "2026-08-31", to: "2026-09-30" });
});

test("daily series fills missing days and route breakdown adds up to the total", () => {
  const report = { group_by: "day", totals: metrics("300"), groups: [{ bucket: "2026-10-02", ...metrics("300") }] };
  assert.deepEqual(dailySeries({ from: "2026-10-01", to: "2026-10-03" }, report).map((day) => day.amount), [0, 300, 0]);
  const byTrip = { group_by: "trip", totals: metrics("1000"), groups: [
    { bucket: "1", ...metrics("400") }, { bucket: "2", ...metrics("300") }, { bucket: "3", ...metrics("150") },
    { bucket: "4", ...metrics("100") }, { bucket: "5", ...metrics("50") }, { bucket: "6", ...metrics("0") },
  ] };
  const rows = routeBreakdown(byTrip, new Map([[1, "Tà Năng"]]));
  assert.deepEqual(rows.map((row) => row.label), ["Tà Năng", "Tuyến #2", "Tuyến #3", "Tuyến #4", "Các tuyến khác"]);
  assert.equal(rows.reduce((total, row) => total + row.amount, 0), 1000);
  assert.equal(percent(1, 3), "33,3%");
  assert.equal(growth(114, 100), "+14%");
  assert.equal(growth(10, 0), null);
});

test("settings use the server ranges and send only a normalized value", async () => {
  const values = settingValuesFrom([{ setting_key: "SEAT_TTL_MINUTES", setting_value: " 20 " }]);
  assert.deepEqual(values, { SEAT_TTL_MINUTES: "20", MAX_SEATS_PER_INVOICE: "10", LEADER_RATIO: "15" });
  assert.deepEqual(SETTING_FIELDS.map((field) => [field.key, field.min, field.max]),
    [["SEAT_TTL_MINUTES", 1, 120], ["MAX_SEATS_PER_INVOICE", 1, 50], ["LEADER_RATIO", 1, 100]]);
  assert.match(validateSetting(SETTING_FIELDS[0], "121"), /từ 1 đến 120 phút/);
  assert.match(validateSetting(SETTING_FIELDS[0], "1.5"), /số nguyên/);
  assert.deepEqual(Object.keys(validateSettings({ ...values, MAX_SEATS_PER_INVOICE: "0" })), ["MAX_SEATS_PER_INVOICE"]);
  assert.deepEqual(changedSettings(values, { ...values, LEADER_RATIO: "015" }), []);
  assert.equal(minimumLeaders(32, 15), 3);
  assert.match(describeSettingFailure("LEADER_RATIO", "RESOURCE_CONFLICT", 409), /thiếu Leader/);

  let call;
  globalThis.fetch = async (url, init) => { call = { url, init }; return Response.json({ data: { setting_key: "LEADER_RATIO", setting_value: "12" } }); };
  await settingsClient.update("LEADER_RATIO", "012");
  assert.equal(call.url, "/api/admin/settings/LEADER_RATIO");
  assert.equal(call.init.method, "PATCH");
  assert.deepEqual(JSON.parse(call.init.body), { setting_value: "12" });
});

test("audit labels cover the server allowlist and changes render from the event", () => {
  assert.deepEqual([...AUDIT_ACTIONS].sort(), [
    "AccountStatusChanged", "DepartureOwnerChanged", "DepartureStatusChanged", "LeaderAccountCreated", "MoneyRecorded", "RoleChanged",
    "SettingChanged", "SupplyIssued", "SupplyItemCreated", "SupplyItemUpdated", "SupplyReceived", "SupplyReturned",
    "TripAvailabilityChanged", "TripCreated", "TripPriceChanged", "VehicleStatusChanged",
  ]);
  assert.equal(describeAuditChange({ action: "RoleChanged", event: { action: "RoleChanged", from: "Customer", to: "RouteMgr" } }).summary,
    "Khách hàng → Quản lý tuyến");
  assert.equal(describeAuditChange({ action: "SettingChanged", event: { action: "SettingChanged", record_id: "SEAT_TTL_MINUTES", from: "15", to: "20" } }).after,
    "20 phút");
  assert.match(describeAuditChange({ action: "DepartureStatusChanged",
    event: { action: "DepartureStatusChanged", from: "Open", to: "Closed", source: "cron", reason: "deadline" } }).summary, /tự động: tới hạn chốt bán/);
  assert.equal(describeAuditChange({ action: "MoneyRecorded", event: { action: "MoneyRecorded", amount: "3180000" } }).before, undefined);
  assert.equal(describeAuditChange({ action: "RoleChanged", event: null }).summary, "Không đọc được chi tiết");
  assert.equal(auditObjectLabel({ table_name: "system_settings", record_id: "LEADER_RATIO" }), "Số khách cho mỗi Leader");
  assert.equal(auditObjectLabel({ table_name: "users", record_id: "42" }), "Tài khoản #42");
});

test("audit query sends only set, valid parameters", () => {
  const now = new Date("2026-10-30T10:00:00.000Z");
  assert.equal(String(auditSearchParams({ page: 1, pageSize: 20, range: "all" }, now)), "page=1&pageSize=20");
  const params = auditSearchParams({ page: 2, pageSize: 20, range: "7d", recordId: "#42", userId: 3, action: "RoleChanged", table: "users" }, now);
  assert.equal(params.get("record_id"), "42");
  assert.equal(params.get("user_id"), "3");
  assert.equal(params.get("table_name"), "users");
  assert.equal(params.get("from"), "2026-10-23T10:00:00.000Z");
  assert.equal(auditSearchParams({ page: 1, pageSize: 20, range: "all", recordId: "a b" }, now).has("record_id"), false);
  assert.equal(validRecordId("LEADER_RATIO"), true);
  assert.equal(validRecordId("x;y"), false);
});
