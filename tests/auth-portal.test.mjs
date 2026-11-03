import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthDestination, getLoginPath, getRolePortal, canLoginAtGate } from "../src/lib/auth-portal.ts";

const origin = "https://go-trail.example.test";
test("gate and portal policy covers current roles without granting an invented role", () => {
  for (const [role, portal] of Object.entries({ Customer: "/account", Leader: "/leader", RouteMgr: "/staff", HRMgr: "/staff", Admin: "/admin" })) {
    assert.equal(getRolePortal(role), portal);
    assert.equal(canLoginAtGate(role, "customer"), role === "Customer");
    assert.equal(canLoginAtGate(role, "staff"), role !== "Customer");
    assert.equal(getAuthDestination(role, null, origin), portal);
  }
  assert.equal(canLoginAtGate("invented", "staff"), false);
  assert.equal(getLoginPath("/staff/vehicles"), "/staff/login");
  assert.equal(getLoginPath("/leader"), "/staff/login");
  assert.equal(getLoginPath("/account"), "/login");
  assert.equal(getLoginPath("/staffing"), "/login");
});
test("role callbacks preserve allowed deep links and reject forbidden or looping destinations", () => {
  assert.equal(getAuthDestination("Customer", origin + "/booking?departure=1", origin), "/booking?departure=1");
  assert.equal(getAuthDestination("Leader", "/leader?view=next", origin), "/leader?view=next");
  assert.equal(getAuthDestination("Admin", "/staff/vehicles", origin), "/staff/vehicles");
  for (const path of ["/admin", "/staff", "/leader", "//evil.test", "https://evil.test", "/%61ccount", "/account/../../admin", "/login", "/register", "/auth/continue", "/api/auth/signout", "/accountant"]) {
    assert.equal(getAuthDestination("Customer", path, origin), "/account", path);
  }
  for (const path of ["/staff/login", "/staff/login/", "/account", "/admin"]) assert.equal(getAuthDestination("HRMgr", path, origin), "/staff");
});
