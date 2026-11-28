import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUDIT_ACTIONS, AUDIT_ACTION_LABELS, DEMO_AUDIT, DEMO_NOW, SETTING_FIELDS, auditActors, auditSummary, changedSettings,
  demoDashboard, describeAuditChange, filterAudit, growth, minimumLeaders, percent, settingValuesFrom, splitByWeights, sum,
  validateSetting, validateSettings,
} from "../src/lib/admin-insights-ui.ts";

const query = (overrides = {}) => ({ page: 1, pageSize: 20, range: "30d", ...overrides });

test("settings read SYSTEM_SETTINGS rows with defaults and validate ranges", () => {
  const values = settingValuesFrom([{ setting_key: "SEAT_TTL_MINUTES", setting_value: " 20 " }, { setting_key: "OTHER", setting_value: "1" }]);
  assert.deepEqual(values, { SEAT_TTL_MINUTES: "20", MAX_SEATS_PER_INVOICE: "10", LEADER_RATIO: "15" });
  const ttl = SETTING_FIELDS[0];
  assert.equal(validateSetting(ttl, "15"), undefined);
  assert.match(validateSetting(ttl, "3"), /từ 5 đến 60 phút/);
  assert.match(validateSetting(ttl, ""), /Vui lòng/);
  assert.match(validateSetting(ttl, "1.5"), /số nguyên/);
  assert.deepEqual(Object.keys(validateSettings({ SEAT_TTL_MINUTES: "0", MAX_SEATS_PER_INVOICE: "21", LEADER_RATIO: "15" })),
    ["SEAT_TTL_MINUTES", "MAX_SEATS_PER_INVOICE"]);
  assert.deepEqual(changedSettings(values, { ...values, LEADER_RATIO: "015" }), []);
  assert.deepEqual(changedSettings(values, { ...values, LEADER_RATIO: "12" }), ["LEADER_RATIO"]);
  assert.equal(minimumLeaders(32, 15), 3);
  assert.equal(minimumLeaders(0, 15), 0);
});

test("audit labels cover exactly the allowlisted server events", () => {
  assert.deepEqual(AUDIT_ACTIONS.sort(), [
    "AccountStatusChanged", "DepartureOwnerChanged", "DepartureStatusChanged", "LeaderAccountCreated", "MoneyRecorded", "RoleChanged",
    "SupplyItemCreated", "SupplyItemUpdated", "SupplyReceived", "TripAvailabilityChanged", "TripCreated", "TripPriceChanged",
    "VehicleStatusChanged",
  ]);
  for (const entry of DEMO_AUDIT) assert.ok(AUDIT_ACTION_LABELS[entry.action]);
});

test("audit changes are rendered from the structured event", () => {
  assert.deepEqual(describeAuditChange({ action: "RoleChanged", detail: { from: "Customer", to: "RouteMgr" } }),
    { before: "Khách hàng", after: "Quản lý tuyến", summary: "Khách hàng → Quản lý tuyến" });
  assert.equal(describeAuditChange({ action: "DepartureStatusChanged", detail: { from: "Closed", to: "Confirmed" } }).summary, "Đã chốt bán → Đã xác nhận");
  assert.equal(describeAuditChange({ action: "TripPriceChanged", detail: { from: "1590000", to: "1690000" } }).after, "1.690.000 ₫");
  assert.equal(describeAuditChange({ action: "MoneyRecorded", detail: { amount: "3180000" } }).before, undefined);
  assert.equal(describeAuditChange({ action: "SupplyReceived", detail: { quantity: 20, item_id: 18 } }).summary, "+20 · Vật tư #18");
  assert.equal(describeAuditChange({ action: "DepartureOwnerChanged", detail: { from: null, to: 15 } }).before, "Chưa có");
});

test("audit filters by time window, actor, action, object and id", () => {
  assert.equal(filterAudit(DEMO_AUDIT, query(), DEMO_NOW).totalItems, DEMO_AUDIT.length);
  const week = filterAudit(DEMO_AUDIT, query({ range: "7d" }), DEMO_NOW);
  assert.ok(week.items.every((entry) => new Date(entry.created_at) >= new Date(DEMO_NOW.getTime() - 7 * 86_400_000)));
  assert.ok(week.totalItems < DEMO_AUDIT.length);
  assert.ok(week.items.every((entry, index, list) => index === 0 || list[index - 1].created_at >= entry.created_at));
  assert.ok(filterAudit(DEMO_AUDIT, query({ actorId: 12 }), DEMO_NOW).items.every((entry) => entry.actor.user_id === 12));
  assert.ok(filterAudit(DEMO_AUDIT, query({ action: "RoleChanged" }), DEMO_NOW).items.every((entry) => entry.action === "RoleChanged"));
  assert.ok(filterAudit(DEMO_AUDIT, query({ object: "supplies" }), DEMO_NOW).items.every((entry) => entry.table_name.startsWith("supply")));
  assert.deepEqual(filterAudit(DEMO_AUDIT, query({ q: "#88410" }), DEMO_NOW).items.map((entry) => entry.log_id), [88410]);
  assert.deepEqual(filterAudit(DEMO_AUDIT, query({ q: "128" }), DEMO_NOW).items.map((entry) => entry.record_id), ["128"]);
  const paged = filterAudit(DEMO_AUDIT, query({ pageSize: 10, page: 9 }), DEMO_NOW);
  assert.equal(paged.page, paged.totalPages);
  const summary = auditSummary(DEMO_AUDIT, DEMO_NOW);
  assert.equal(summary.total, week.totalItems);
  assert.ok(auditActors(DEMO_AUDIT).length >= 3);
});

test("dashboard numbers add up for every period", () => {
  for (const period of ["today", "7d", "30d", "month"]) {
    const data = demoDashboard(period);
    assert.equal(data.revenue, sum(data.daily.map((day) => day.amount)));
    const routes = sum(data.routes.map((route) => route.amount)) + (data.otherRoutes?.amount ?? 0);
    assert.equal(routes, data.revenue, `${period} route revenue must equal total revenue`);
    const { total, ended, running, confirmed } = data.departures;
    assert.equal(ended + running + confirmed, total);
    assert.ok(data.ticketsSold <= data.seatsOffered);
  }
  assert.deepEqual(splitByWeights(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(percent(1, 3), "33,3%");
  assert.equal(growth(114, 100), "+14%");
  assert.equal(growth(10, 0), null);
});
