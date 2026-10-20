import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { hash, compare } from "bcryptjs";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { mockRedisRest } from "./helpers/test-redis.mjs";
import { registerCustomer, authenticateCredentials, updateAccountAccess } from "../src/server/services/accounts.ts";
import { requireActor, canAccessRouteGroup } from "../src/server/auth/authorization.ts";
import { readCustomerInvoice, listLeaderDepartures } from "../src/server/services/account-data.ts";
import { consumeRateLimit } from "../src/server/auth/rate-limit.ts";
import { writeAudit } from "../src/server/audit.ts";

let database, db, passwordHash, redis;
const password = "test-password-with-16-characters";
const secret = "isolated-test-secret-with-at-least-32-characters";
const credentials = (email = "customer@example.test") => ({ email, password });
const registration = { email: "new@example.test", password, full_name: "Khách Mới", phone: "0901234567" };
const actor = (user_id, role) => ({ user_id, role, auth_version: 0 });

before(async () => {
  redis = mockRedisRest();
  passwordHash = await hash(password, 12);
  database = await createTestDatabase();
  db = database.client;
});
beforeEach(async () => {
  redis.reset();
  await database.sql.exec("TRUNCATE users, trips, vehicles RESTART IDENTITY CASCADE");
  for (const [user_id, email, role] of [
    [1, "admin@example.test", "Admin"], [2, "customer@example.test", "Customer"],
    [3, "other@example.test", "Customer"], [4, "leader@example.test", "Leader"],
    [5, "unassigned@example.test", "Leader"], [6, "hr@example.test", "HRMgr"],
    [7, "routes@example.test", "RouteMgr"], [8, "finance@example.test", "Accountant"],
  ]) await db.user.create({ data: { user_id, email, role, password_hash: passwordHash, full_name: role, phone: "0901234567" } });
  await db.$queryRaw`SELECT setval('users_user_id_seq', 8)`;
  for (const user_id of [4, 5]) await db.staff.create({ data: { user_id, full_name: "Leader", phone: "0901234567", staff_type: "Leader" } });
});
after(async () => { redis?.close(); await database?.close(); });

test("public registration creates only Customer and stores a bcrypt hash, never returns it", async () => {
  const user = await registerCustomer(db, registration);
  assert.equal(user.role, "Customer");
  assert.equal(user.email, registration.email);
  assert.equal("password_hash" in user, false);
  const saved = await db.user.findUnique({ where: { email: user.email } });
  assert.ok(await compare(password, saved.password_hash));
  assert.notEqual(saved.password_hash, password);
});

test("registration rejects role/status injection without creating an account", async () => {
  await assert.rejects(registerCustomer(db, { ...registration, role: "Admin" }), { code: "INVALID_INPUT" });
  await assert.rejects(registerCustomer(db, { ...registration, status: "Active" }), { code: "INVALID_INPUT" });
  assert.equal(await db.user.count({ where: { email: registration.email } }), 0);
});

test("email identity is trimmed and case normalized; duplicate registration has a generic error", async () => {
  await registerCustomer(db, { ...registration, email: "  NEW@EXAMPLE.TEST " });
  await assert.rejects(registerCustomer(db, registration), { code: "REGISTRATION_UNAVAILABLE" });
  assert.equal(await db.user.count({ where: { email: "new@example.test" } }), 1);
});

test("registration rejects passwords over bcrypt's 72 UTF-8 byte limit without trimming passwords", async () => {
  await assert.rejects(registerCustomer(db, { ...registration, password: "ế".repeat(25) }), { code: "INVALID_INPUT" });
  const spaced = " " + password + " ";
  const user = await registerCustomer(db, { ...registration, password: spaced });
  const saved = await db.user.findUnique({ where: { user_id: user.user_id } });
  assert.ok(await compare(spaced, saved.password_hash));
  assert.equal(await compare(password, saved.password_hash), false);
});

test("all six roles authenticate; wrong password, missing account and Locked account fail identically", async () => {
  for (const email of ["admin", "customer", "leader", "hr", "routes", "finance"]) {
    const user = await authenticateCredentials(db, credentials(`${email}@example.test`), secret, undefined, email === "customer" ? "customer" : "staff");
    assert.ok(user?.user_id);
    assert.equal("password_hash" in user, false);
  }
  assert.equal(await authenticateCredentials(db, { ...credentials(), password: "wrong-password-123" }, secret), null);
  assert.equal(await authenticateCredentials(db, credentials("missing@example.test"), secret), null);
  await db.user.update({ where: { user_id: 2 }, data: { status: "Locked" } });
  assert.equal(await authenticateCredentials(db, credentials(), secret), null);
});

test("login gates reject the other audience and forged role input before issuing an identity", async () => {
  assert.equal(await authenticateCredentials(db, credentials("admin@example.test"), secret), null);
  assert.equal(await authenticateCredentials(db, credentials(), secret, undefined, "staff"), null);
  assert.equal(await authenticateCredentials(db, { ...credentials(), role: "Admin" }, secret), null);
  assert.equal(await authenticateCredentials(db, credentials(), secret, undefined, "invented"), null);
  assert.ok(await authenticateCredentials(db, credentials(), secret));
  assert.ok(await authenticateCredentials(db, credentials("admin@example.test"), secret, undefined, "staff"));
});

test("alternating customer and staff gates shares one normalized email attempt budget", async () => {
  for (let i = 0; i < 10; i++) await authenticateCredentials(db, credentials(), secret, undefined, i % 2 ? "customer" : "staff");
  assert.equal(await authenticateCredentials(db, credentials(), secret), null);
});

test("login limit counts attempts across calls and normalized email variants", async () => {
  for (let i = 0; i < 10; i++) {
    assert.ok(await authenticateCredentials(db, credentials(i % 2 ? "CUSTOMER@example.test " : undefined), secret));
  }
  assert.equal(await authenticateCredentials(db, credentials(), secret), null);
});

test("a noisy login identity cannot consume unrelated users' login budgets", async () => {
  for (let i = 0; i < 501; i++) await authenticateCredentials(db, credentials(), secret);
  assert.ok(await authenticateCredentials(db, credentials("admin@example.test"), secret, undefined, "staff"));
});

test("trusted source limits span email identities while leaving another source unaffected", async () => {
  for (let i = 0; i < 51; i++) await authenticateCredentials(db, credentials(), secret, "192.0.2.1");
  assert.equal(await authenticateCredentials(db, credentials("admin@example.test"), secret, "192.0.2.1"), null);
  assert.ok(await authenticateCredentials(db, credentials("admin@example.test"), secret, "192.0.2.2", "staff"));
});

test("Redis REST adapter shares its budget across calls, resets expired buckets and stores no email", async () => {
  const results = await Promise.all(Array.from({ length: 14 }, () => consumeRateLimit("login", "private@example.test", secret, 10)));
  assert.equal(results.filter((result) => result.allowed).length, 10);
  assert.equal(redis.counters.size, 1);
  assert.match([...redis.counters.keys()][0], /^go-trail:auth:test:v1:[a-f0-9]{64}$/);
  for (const bucket of redis.counters.values()) bucket.expiresAt = 0;
  assert.equal((await consumeRateLimit("login", "private@example.test", secret, 10)).allowed, true);
});

test("Redis outage stops login before account reads or password verification", async () => {
  redis.setUnavailable(true);
  const databaseMustNotBeRead = { user: { findUnique() { throw new Error("Account lookup must not happen"); } } };
  await assert.rejects(authenticateCredentials(databaseMustNotBeRead, credentials(), secret), { code: "AUTH_UNAVAILABLE", status: 503 });
});

test("the Redis SDK aborts a stalled request and does not retry or allow login", async () => {
  redis.setTimeout(true);
  const started = Date.now();
  await assert.rejects(authenticateCredentials(db, credentials(), secret), { code: "AUTH_UNAVAILABLE" });
  assert.equal(redis.calls, 1);
  assert.ok(Date.now() - started < 4000, "Request must have a bounded timeout");
});

test("route group permissions match all six roles, with Admin access to every group", () => {
  const expected = {
    Customer: ["/account"], Leader: ["/leader"], RouteMgr: ["/staff"],
    HRMgr: ["/staff"], Accountant: ["/staff"], Admin: ["/account", "/leader", "/staff", "/admin"],
  };
  for (const [role, groups] of Object.entries(expected)) {
    for (const group of ["/account", "/leader", "/staff", "/admin"]) {
      assert.equal(canAccessRouteGroup(role, `${group}/anything`), groups.includes(group));
    }
  }
  assert.equal(canAccessRouteGroup("Customer", "/administrator"), true);
  assert.equal(canAccessRouteGroup("invented", "/admin"), false);
});

test("server actor verification rejects missing sessions, Locked users and revoked JWT versions", async () => {
  await assert.rejects(requireActor(db, null), { code: "UNAUTHENTICATED" });
  assert.equal((await requireActor(db, actor(2, "Admin"))).role, "Customer");
  await db.user.update({ where: { user_id: 2 }, data: { auth_version: 1 } });
  await assert.rejects(requireActor(db, actor(2, "Customer")), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: 2 }, data: { status: "Locked" } });
  await assert.rejects(requireActor(db, { ...actor(2, "Customer"), auth_version: 1 }), { code: "UNAUTHENTICATED" });
});

async function departureFixtures() {
  const trip = await db.trip.create({ data: { name: "Isolated trail", city: "Tây Ninh", location_name: "Núi", length_km: "5", base_price: "500000", description: "Test", schedule_content: "Test" } });
  const staff = await db.staff.findUniqueOrThrow({ where: { user_id: 4 } });
  const vehicle = await db.vehicle.create({ data: { plate_number: "TEST", vehicle_type: "Bus", seat_count: 16 } });
  const departures = [];
  for (const status of ["Draft", "Open", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) {
    const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status, departure_date: new Date("2030-01-01"), booking_deadline: new Date("2029-12-31"), min_passengers: 1 } });
    const assignment = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
    await db.departureStaff.create({ data: { departure_id: departure.departure_id, staff_id: staff.staff_id, role_in_trip: "Leader", dep_vehicle_id: assignment.dep_vehicle_id } });
    departures.push(departure);
  }
  return departures;
}

test("Customer A cannot read Customer B's invoice; ownership is enforced inside the service", async () => {
  const departures = await departureFixtures();
  const invoice = await db.invoice.create({ data: { customer_id: 2, departure_id: departures[1].departure_id, payment_code: "TEST", total_amount: "500000", expires_at: new Date("2029-12-31") } });
  const own = await readCustomerInvoice(db, actor(2, "Customer"), invoice.invoice_id);
  assert.equal(own.invoice_id, invoice.invoice_id);
  assert.equal(own.total_amount, "500000");
  await assert.rejects(readCustomerInvoice(db, actor(3, "Customer"), invoice.invoice_id), { code: "NOT_FOUND" });
  await assert.rejects(readCustomerInvoice(db, actor(3, "Admin"), invoice.invoice_id), { code: "NOT_FOUND" });
  await assert.rejects(readCustomerInvoice(db, actor(4, "Leader"), invoice.invoice_id), { code: "FORBIDDEN" });
});

test("Leader sees only assigned Confirmed/Running/Ended departures, never payments or customer bank data", async () => {
  await departureFixtures();
  const assigned = await listLeaderDepartures(db, actor(4, "Leader"));
  assert.deepEqual(assigned.map((row) => row.status).sort(), ["Confirmed", "Ended", "Running"]);
  assert.ok(assigned.every((row) => !Object.hasOwn(row, "invoices") && !Object.hasOwn(row, "price_override")));
  assert.deepEqual(await listLeaderDepartures(db, actor(5, "Leader")), []);
  await db.staff.updateMany({ where: { user_id: 4 }, data: { status: "Inactive" } });
  assert.deepEqual(await listLeaderDepartures(db, actor(4, "Leader")), []);
});

test("only Admin changes access; role/status changes revoke old sessions and have atomic audit logs", async () => {
  await assert.rejects(updateAccountAccess(db, actor(6, "HRMgr"), 7, { role: "Admin" }), { code: "FORBIDDEN" });
  await updateAccountAccess(db, actor(1, "Admin"), 7, { role: "HRMgr", status: "Locked" });
  const target = await db.user.findUnique({ where: { user_id: 7 } });
  assert.equal(target.role, "HRMgr");
  assert.equal(target.status, "Locked");
  assert.equal(target.auth_version, 1);
  const logs = await db.auditLog.findMany({ orderBy: { log_id: "asc" } });
  assert.deepEqual(logs.map((log) => log.action), ["RoleChanged", "AccountStatusChanged"]);
  assert.ok(logs.every((log) => log.user_id === 1 && log.record_id === "7" && !log.description.includes("@")));
  await updateAccountAccess(db, actor(1, "Admin"), 7, { status: "Active" });
  await assert.rejects(requireActor(db, actor(7, "RouteMgr")), { code: "UNAUTHENTICATED" });
});

test("access changes preserve the last active Admin and Leader's staff relationship", async () => {
  await assert.rejects(updateAccountAccess(db, actor(1, "Admin"), 1, { status: "Locked" }), { code: "ACCESS_CONFLICT" });
  await assert.rejects(updateAccountAccess(db, actor(1, "Admin"), 4, { role: "Customer" }), { code: "ACCESS_CONFLICT" });
  await assert.rejects(updateAccountAccess(db, actor(1, "Admin"), 2, { role: "Leader" }), { code: "ACCESS_CONFLICT" });
  assert.equal(await db.auditLog.count(), 0);
});

test("audit and business changes roll back together; audit refuses credentials, bank fields and arbitrary descriptions", async () => {
  await assert.rejects(db.$transaction(async (tx) => {
    await tx.user.update({ where: { user_id: 7 }, data: { role: "Accountant" } });
    await writeAudit(tx, 1, { action: "RoleChanged", record_id: 7, from: "RouteMgr", to: "Accountant" });
    throw new Error("Abort isolated transaction");
  }), /Abort isolated transaction/);
  assert.equal((await db.user.findUnique({ where: { user_id: 7 } })).role, "RouteMgr");
  assert.equal(await db.auditLog.count(), 0);
  await assert.rejects(writeAudit(db, 1, { action: "RoleChanged", record_id: 7, from: "RouteMgr", to: "Accountant", bank_account_number: "secret" }), { code: "INVALID_INPUT" });
});
