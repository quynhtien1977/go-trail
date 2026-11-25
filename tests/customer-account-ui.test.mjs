import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  AccountClientError, DEMO_ACCOUNTS, ROLES, accountActions, applyAccessPatch, createDemoAccountSource, customerClient,
  customerSearchParams, describeFailure, describeResponsible, describeTicket, directoryCapabilities, filterAccounts,
  formatDate, formatVnd, initials, roleLabel, roleOptions, updateAccountAccess,
} from "../src/lib/customer-account-ui.ts";

const row = (overrides = {}) => ({
  user_id: 1, full_name: "Nguyễn Văn An", email: "an@gotrail.vn", phone: "0900000000", role: "Customer",
  status: "Active", created_at: "2026-01-01T00:00:00.000Z", has_staff_profile: false, ...overrides,
});

test("only the five target roles exist and labels are user-facing Vietnamese", () => {
  assert.deepEqual(ROLES, ["Customer", "Leader", "RouteMgr", "HRMgr", "Admin"]);
  assert.equal(roleLabel("RouteMgr"), "Quản lý tuyến");
  assert.equal(roleLabel("HRMgr"), "Quản lý nhân sự");
  for (const forbidden of ["Driver", "Assistant", "Accountant"]) assert.ok(!ROLES.includes(forbidden));
});

test("capabilities mirror PRD 3.2/3.3: Admin manages accounts, RouteMgr reads own customers only", () => {
  assert.deepEqual(directoryCapabilities("Admin"), { canReadCustomers: true, canManageAccounts: true, customerScope: "all" });
  assert.deepEqual(directoryCapabilities("RouteMgr"), { canReadCustomers: true, canManageAccounts: false, customerScope: "responsible" });
  for (const role of ["HRMgr", "Leader", "Customer", "Accountant", null, undefined]) {
    assert.deepEqual(directoryCapabilities(role), { canReadCustomers: false, canManageAccounts: false, customerScope: "none" });
  }
});

test("no self-escalation or self-lockout; a STAFF-linked account cannot change role", () => {
  assert.deepEqual(accountActions(row({ user_id: 7 }), 7), { isSelf: true, canChangeRole: false, roleChangeHint: "Không thể tự thay đổi tài khoản của bạn", canToggleLock: false });
  assert.deepEqual(accountActions(row({ role: "Leader", has_staff_profile: true }), 99), { isSelf: false, canChangeRole: false, roleChangeHint: "Gắn với hồ sơ nhân sự", canToggleLock: true });
  assert.deepEqual(accountActions(row(), 99), { isSelf: false, canChangeRole: true, roleChangeHint: null, canToggleLock: true });
  const options = roleOptions(row({ role: "RouteMgr" }));
  assert.equal(options.find((option) => option.role === "Leader").disabled, true);
  assert.equal(options.filter((option) => option.disabled).length, 1);
  assert.equal(options.find((option) => option.current).role, "RouteMgr");
});

test("demo access changes follow the server rules: last active admin and Leader/STAFF link", () => {
  const rows = [row({ user_id: 1, role: "Admin" }), row({ user_id: 2, role: "Leader", has_staff_profile: true }), row({ user_id: 3 })];
  assert.throws(() => applyAccessPatch(rows, 1, { status: "Locked" }), (error) => error.code === "LAST_ADMIN" && error.status === 409);
  assert.throws(() => applyAccessPatch(rows, 1, { role: "Customer" }), (error) => error.code === "LAST_ADMIN");
  assert.throws(() => applyAccessPatch(rows, 3, { role: "Leader" }), (error) => error.code === "STAFF_LINK");
  assert.throws(() => applyAccessPatch(rows, 2, { role: "HRMgr" }), (error) => error.code === "STAFF_LINK");
  assert.throws(() => applyAccessPatch(rows, 404, { status: "Locked" }), (error) => error.status === 404);
  const promoted = applyAccessPatch(rows, 3, { role: "Admin" });
  assert.equal(promoted.updated.role, "Admin");
  assert.equal(applyAccessPatch(promoted.rows, 1, { status: "Locked" }).updated.status, "Locked", "a second active admin allows locking");
  assert.equal(rows[2].role, "Customer", "input rows are not mutated");
});

test("demo source filters accent-insensitively, counts by role and clamps pages", async () => {
  const page = filterAccounts(DEMO_ACCOUNTS, { page: 1, pageSize: 10, q: "hoang" });
  assert.ok(page.items.every((item) => /hoang/i.test(item.full_name.normalize("NFD").replace(/[̀-ͯ]/g, "") + item.email)));
  assert.equal(page.roleCounts.Leader, DEMO_ACCOUNTS.filter((item) => item.role === "Leader").length);
  assert.equal(filterAccounts(DEMO_ACCOUNTS, { page: 99, pageSize: 10 }).pagination.page, 2);
  assert.equal(filterAccounts(DEMO_ACCOUNTS, { page: 1, pageSize: 10, role: "Admin", status: "Locked" }).items.length, 0);
  const source = createDemoAccountSource();
  assert.equal(source.isDemo, true);
  const locked = await source.updateAccess(9003, { status: "Locked" });
  assert.equal(locked.status, "Locked");
  assert.equal((await source.list({ page: 1, pageSize: 50, status: "Locked" })).items.some((item) => item.user_id === 9003), true);
});

test("ticket, responsible and money formatting", () => {
  assert.equal(describeTicket({ detail_id: 1, seat_name: "A1", passenger_name: "An", status: "Valid", check_in_status: "CheckedIn" }), "Ghế A1 · An · Hợp lệ · Đã check-in");
  assert.equal(describeTicket({ detail_id: 2, seat_name: "B1", passenger_name: "An", status: "Cancelled", check_in_status: "Pending" }), "Ghế B1 · An · Đã hủy");
  assert.equal(describeResponsible({ responsible_name_snapshot: "Lê Thị Mai", responsible_role_snapshot: "RouteMgr" }), "Lê Thị Mai · Quản lý tuyến");
  assert.equal(describeResponsible({ responsible_name_snapshot: null, responsible_role_snapshot: null }), null);
  assert.equal(formatVnd("2850000"), "2.850.000 ₫");
  assert.equal(formatVnd("0"), "0 ₫");
  assert.equal(formatDate(null), "Chưa có");
  assert.equal(formatDate("2026-11-28T23:00:00.000Z"), "29/11/2026");
  assert.equal(initials("Nguyễn Hoàng Nam"), "NN");
  assert.equal(initials("  "), "?");
});

test("failures map to user wording; 403/409/401 are distinguished", () => {
  assert.equal(describeFailure("FORBIDDEN", 403).title, "Bạn không có quyền thực hiện thao tác này");
  assert.equal(describeFailure("UNAUTHENTICATED", 401).signIn, true);
  assert.match(describeFailure("ACCESS_CONFLICT", 409, "role").detail, /quản trị viên/);
  assert.equal(describeFailure("LAST_ADMIN", 409, "lock").title, "Không thể khóa tài khoản");
  assert.equal(describeFailure("NETWORK_ERROR", 0).retryable, true);
  for (const [code, status] of [["FORBIDDEN", 403], ["ACCESS_CONFLICT", 409], ["X", 500], ["INVALID_INPUT", 422]]) {
    const failure = describeFailure(code, status, "role");
    assert.doesNotMatch(`${failure.title} ${failure.detail ?? ""}`, /API|HTTP|RBAC|JWT|409|403|Payload/);
  }
});

test("customer query sends only set params, clamps page and trims search", () => {
  assert.equal(customerSearchParams({ page: 0, pageSize: 20 }).toString(), "page=1&pageSize=20");
  assert.equal(customerSearchParams({ page: 2, pageSize: 50, q: "  an  ", status: "Locked" }).toString(), "page=2&pageSize=50&q=an&status=Locked");
  assert.equal(customerSearchParams({ page: 1, pageSize: 10, q: "   " }).has("q"), false);
});

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("clients call C03 and A01 with the contract bodies and surface structured errors", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (init.method === "PATCH") return new Response(JSON.stringify({ error: { code: "ACCESS_CONFLICT", message: "x" } }), { status: 409 });
    return new Response(JSON.stringify({ data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } } }), { status: 200 });
  };
  await customerClient.list({ page: 1, pageSize: 20, q: "an" });
  await customerClient.detail(5);
  await assert.rejects(updateAccountAccess(5, { status: "Locked" }), (error) => error instanceof AccountClientError && error.status === 409 && error.code === "ACCESS_CONFLICT");
  assert.deepEqual(calls, [
    { url: "/api/staff/customers?page=1&pageSize=20&q=an", method: "GET", body: undefined },
    { url: "/api/staff/customers/5", method: "GET", body: undefined },
    { url: "/api/admin/users/5/access", method: "PATCH", body: { status: "Locked" } },
  ]);
  assert.throws(() => updateAccountAccess(5, {}), (error) => error.code === "INVALID_INPUT");
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(customerClient.detail(1), (error) => error.code === "NETWORK_ERROR");
});
