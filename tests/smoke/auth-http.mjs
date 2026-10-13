import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { encode } from "next-auth/jwt";
import nextEnv from "@next/env";
import { createTestDatabase } from "../helpers/test-database.mjs";
import { getRedisConfig } from "../../src/server/auth/redis.ts";

// Production build + actual Next HTTP routes on disposable local DB + live Redis.
// Cookies, test passwords, secrets and connection URLs never appear in output.
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
getRedisConfig(); // Fail with a safe error before starting any child processes.
const database = await createTestDatabase();
const db = database.client;
const lease = createServer();
lease.listen(0, "127.0.0.1");
await once(lease, "listening");
const port = lease.address().port;
await new Promise((resolve) => lease.close(resolve));
const origin = `https://localhost:${port}`;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("base64url");
const users = new Map();
let child;
const rateNamespace = `go-trail:test:http:${randomBytes(12).toString("hex")}`;
const authSecret = randomBytes(32).toString("hex");

async function startServer(redisToken, databaseUrl = database.connectionString) {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), stdio: "ignore", windowsHide: true,
    env: { ...process.env, VERCEL: "", NODE_ENV: "production", TZ: "UTC", DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl, AUTH_SECRET: authSecret, NEXTAUTH_URL: origin,
      AUTH_RATE_LIMIT_NAMESPACE: rateNamespace, UPSTASH_REDIS_REST_TOKEN: redisToken },
  });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error("Isolated Next server exited before readiness.");
    try { if ((await fetch(base + "/")).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Isolated Next server must become ready");
}

class BrowserSession {
  cookies = new Map();
  async request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    if (init.method && init.method !== "GET") headers.set("origin", origin);
    const response = await fetch(base + path, { ...init, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";")[0];
      const split = first.indexOf("=");
      this.cookies.set(first.slice(0, split), first.slice(split + 1));
    }
    return response;
  }
  async login(email, suppliedPassword = password) {
    const csrf = await (await this.request("/api/auth/csrf")).json();
    return this.request("/api/auth/callback/credentials", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, password: suppliedPassword, csrfToken: csrf.csrfToken, json: "true", callbackUrl: "/" }),
    });
  }
}

try {
  const password_hash = await hash(password, 12);
  for (const role of ["Customer", "Leader", "RouteMgr", "HRMgr", "Accountant", "Admin"]) {
    users.set(role, await db.user.create({ data: { email: `${role.toLowerCase()}@smoke.example.test`, role,
      full_name: `Test ${role}`, phone: "0901234567", password_hash, created_at: new Date("2026-10-12T18:00:00Z") } }));
  }
  const other = await db.user.create({ data: { email: "other@smoke.example.test", full_name: "Test Other", phone: "0901234567", password_hash } });
  const staff = await db.staff.create({ data: { user_id: users.get("Leader").user_id, full_name: "Test Leader", phone: "0901234567", staff_type: "Leader" } });
  const trip = await db.trip.create({ data: { name: "Smoke trail", city: "Tây Ninh", location_name: "Núi", length_km: "5", base_price: "500000", description: "Test", schedule_content: "Test" } });
  const vehicle = await db.vehicle.create({ data: { plate_number: "SMOKE", vehicle_type: "Bus", seat_count: 16 } });
  let confirmed;
  for (const status of ["Confirmed", "Open"]) {
    const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status, min_passengers: 1,
      departure_date: new Date("2030-01-01"), booking_deadline: new Date("2029-12-31") } });
    const assigned = await db.departureVehicle.create({ data: { vehicle_id: vehicle.vehicle_id, departure_id: departure.departure_id } });
    await db.departureStaff.create({ data: { departure_id: departure.departure_id, staff_id: staff.staff_id, role_in_trip: "Leader", dep_vehicle_id: assigned.dep_vehicle_id } });
    if (status === "Confirmed") confirmed = departure;
  }
  const invoice = await db.invoice.create({ data: { customer_id: users.get("Customer").user_id, departure_id: confirmed.departure_id,
    payment_code: "SMOKE1", total_amount: "500000", expires_at: new Date("2029-12-31") } });
  await startServer(process.env.UPSTASH_REDIS_REST_TOKEN);
  const guest = new BrowserSession();
  assert.equal((await guest.request("/api/account/me")).status, 401);
  const guestPortal = await guest.request("/admin?view=users");
  assert.equal(guestPortal.status, 307);
  const guestLocation = new URL(guestPortal.headers.get("location"), origin);
  assert.equal(guestLocation.pathname, "/login");
  assert.equal(guestLocation.searchParams.get("callbackUrl"), "/admin?view=users");
  const defaultSignin = await guest.request("/api/auth/signin?callbackUrl=%2Faccount");
  assert.equal(defaultSignin.status, 302);
  assert.equal(new URL(defaultSignin.headers.get("location"), origin).pathname, "/login");
  const sessions = new Map();
  const allowed = { Customer: ["account"], Leader: ["leader"], RouteMgr: ["staff"], HRMgr: ["staff"], Accountant: ["staff"], Admin: ["account", "leader", "staff", "admin"] };
  for (const [role, user] of users) {
    const browser = new BrowserSession();
    const login = await browser.login(user.email);
    assert.equal(login.status, 200, `${role} login should succeed`);
    assert.equal(new URL((await login.json()).url).searchParams.has("error"), false);
    assert.ok(login.headers.getSetCookie().some((value) => value.includes("session-token") && value.includes("HttpOnly") && value.includes("Secure") && value.includes("SameSite=Lax")));
    const profile = await browser.request("/api/account/me");
    assert.equal(profile.status, 200);
    assert.equal(profile.headers.get("x-content-type-options"), "nosniff");
    const dto = (await profile.json()).data;
    assert.equal(dto.role, role);
    assert.equal(Object.hasOwn(dto, "password_hash"), false);
    for (const group of ["account", "leader", "staff", "admin"]) {
      const portal = await browser.request(`/${group}`);
      assert.equal(portal.status, allowed[role].includes(group) ? 200 : 403, `${role}/${group}`);
      if (portal.status === 200) {
        assert.match(portal.headers.get("content-type"), /text\/html/);
        assert.match(portal.headers.get("cache-control"), /no-store/);
        const html = await portal.text();
        assert.ok(!html.includes(password_hash) && !html.includes(password));
        if (group === "account" || group === "admin") assert.ok(html.includes("13/10/2026"), "Portal dates use Vietnam timezone on a UTC host");
        if (group === "account" || group === "admin") assert.ok(!html.includes("12/10/2026"), "Near-midnight UTC fixture must not render the previous day");
        if (group === "account") assert.ok(html.includes('href="/#system-trailbus"'));
      }
    }
    sessions.set(role, browser);
  }
  console.log("PASS: six-role login, secure cookies, current identity, Proxy route groups");
  const customer = sessions.get("Customer");
  const sessionCsrf = await (await customer.request("/api/auth/csrf")).json();
  await customer.request("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ csrfToken: sessionCsrf.csrfToken, data: { user: { role: "Admin", auth_version: 999 } } }) });
  assert.equal((await (await customer.request("/api/account/me")).json()).data.role, "Customer");
  assert.equal((await customer.request("/admin")).status, 403);
  const expired = new BrowserSession();
  expired.cookies.set("__Secure-next-auth.session-token", await encode({ secret: authSecret, maxAge: 8 * 60 * 60,
    token: { sub: String(users.get("Customer").user_id), role: "Customer", auth_version: 0,
      authenticated_at: Math.floor(Date.now() / 1000) - 8 * 60 * 60 } }));
  const expiredPortal = await expired.request("/account");
  assert.equal(expiredPortal.status, 307);
  assert.equal(new URL(expiredPortal.headers.get("location"), origin).pathname, "/login");
  assert.equal((await expired.request("/api/account/me")).status, 401);
  console.log("PASS: session update cannot elevate privileges; absolute session expiry sends portals to custom login");
  assert.equal((await customer.request(`/api/invoices/${invoice.invoice_id}`)).status, 200);
  const otherSession = new BrowserSession();
  await otherSession.login(other.email);
  assert.equal((await otherSession.request(`/api/invoices/${invoice.invoice_id}`)).status, 404);
  const leaderList = await sessions.get("Leader").request("/api/leader/departures");
  assert.equal(leaderList.status, 200);
  assert.deepEqual((await leaderList.json()).data.map((row) => row.status), ["Confirmed"]);
  assert.equal((await customer.request("/api/leader/departures")).status, 403);
  console.log("PASS: invoice ownership and assigned Leader departure scope over HTTP");

  const accessPath = `/api/admin/users/${users.get("RouteMgr").user_id}/access`;
  const payload = { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "Locked" }) };
  assert.equal((await customer.request(accessPath, payload)).status, 403);
  assert.equal((await sessions.get("Admin").request(accessPath, payload)).status, 200);
  assert.equal((await sessions.get("RouteMgr").request("/api/account/me")).status, 401);
  const lockedPortal = await sessions.get("RouteMgr").request("/staff");
  assert.equal(lockedPortal.status, 307);
  assert.equal(new URL(lockedPortal.headers.get("location"), origin).pathname, "/login");
  assert.equal(await db.auditLog.count({ where: { action: "AccountStatusChanged" } }), 1);
  await sessions.get("Admin").request(accessPath, { ...payload, body: JSON.stringify({ status: "Active" }) });
  assert.equal((await sessions.get("RouteMgr").request("/staff")).status, 307, "Unlock does not restore a revoked session");
  const newRouteSession = new BrowserSession();
  await newRouteSession.login(users.get("RouteMgr").email);
  assert.equal((await newRouteSession.request("/staff")).status, 200);
  console.log("PASS: Admin-only access changes, durable audit and existing-session revocation");

  const registration = { email: "new@smoke.example.test", password, full_name: "Khách Mới", phone: "0901234567" };
  const register = (value) => guest.request("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  assert.equal((await register({ ...registration, role: "Admin" })).status, 422);
  assert.equal((await register(registration)).status, 201);
  assert.equal((await register(registration)).status, 409);
  assert.equal((await register(registration)).status, 409);
  assert.equal((await register(registration)).status, 429);
  const registered = new BrowserSession();
  await registered.login(registration.email);
  assert.equal((await (await registered.request("/api/account/me")).json()).data.role, "Customer");
  const csrf = await (await guest.request("/api/auth/csrf")).json();
  const missingCsrf = await guest.request("/api/auth/callback/credentials", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: registration.email, password, json: "true", csrfToken: "invalid" }) });
  assert.equal(new URL((await missingCsrf.json()).url).searchParams.get("csrf"), "true");
  assert.ok(csrf.csrfToken);
  const foreign = await fetch(base + "/api/auth/register", { method: "POST", headers: { "origin": "https://evil.example.test", "content-type": "application/json" }, body: JSON.stringify(registration) });
  assert.equal(foreign.status, 403);
  const denied = new BrowserSession();
  for (let i = 0; i < 10; i++) await denied.login(other.email, "wrong-password-123");
  const rateLimited = await denied.login(other.email);
  assert.equal(new URL((await rateLimited.json()).url).searchParams.get("error"), "CredentialsSignin");
  console.log("PASS: Customer registration, privilege-injection rejection, CSRF/Origin and login rate limit");
  // Same JWT secret and DB, but unavailable Redis configuration in the new process.
  child.kill(); await once(child, "exit");
  await startServer("");
  const unavailable = await register({ ...registration, email: "outage@smoke.example.test" });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, "AUTH_UNAVAILABLE");
  assert.equal(await db.user.count({ where: { email: "outage@smoke.example.test" } }), 0);
  const unavailableLogin = await guest.login(users.get("Admin").email);
  assert.equal(new URL((await unavailableLogin.json()).url).searchParams.get("error"), "AUTH_UNAVAILABLE");
  assert.equal((await sessions.get("Admin").request("/api/account/me")).status, 200);
  console.log("PASS: unavailable Redis rejects registration/login, preserves existing authorized sessions and discloses no provider errors");
  const admin = sessions.get("Admin");
  const signoutCsrf = await (await admin.request("/api/auth/csrf")).json();
  await admin.request("/api/auth/signout", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: signoutCsrf.csrfToken, json: "true" }) });
  assert.equal((await admin.request("/api/account/me")).status, 401);
  console.log("PASS: logout removes the current session even when Redis is unavailable");
  child.kill(); await once(child, "exit");
  await startServer(process.env.UPSTASH_REDIS_REST_TOKEN, "postgresql://private-test-sentinel@127.0.0.1:1/postgres");
  const databaseFailure = await guest.login("database-outage@smoke.example.test");
  const failureBody = await databaseFailure.text();
  assert.equal(new URL(JSON.parse(failureBody).url).searchParams.get("error"), "AUTH_UNAVAILABLE");
  assert.ok(!failureBody.includes("private-test-sentinel") && !failureBody.includes("Prisma") && !failureBody.includes("ECONNREFUSED"));
  console.log("PASS: unexpected database failures return only a safe Credentials error code");
} finally {
  if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
  await database.close();
}
