import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import ts from "typescript";
import { createTestDatabase } from "../helpers/test-database.mjs";

// A04: exercise actual production handlers, not a mocked authorization layer.
// Never load .env, log cookies/provider diagnostics or connect to a remote DB/Redis.
const roles = ["Customer", "Leader", "RouteMgr", "HRMgr", "Admin"];
const database = await createTestDatabase({ beforeMigration: "20261021000000_five_roles" });
const db = database.client;
const secret = randomBytes(32).toString("hex");
const actors = new Map();
let child, startupError = false, sequence = 0, requests = 0;
const next = () => ++sequence;
const tripInput = { name: "RBAC trail", city: "Tây Ninh", location_name: "RBAC mountain", length_km: "5.00",
  base_price: "500000", description: "Isolated fixture", schedule_content: "Isolated schedule" };
const seatInput = { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 };

async function apiFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = await Promise.all(entries.map(entry => entry.isDirectory() ? apiFiles(`${dir}/${entry.name}`)
    : entry.name === "route.ts" ? [`${dir}/${entry.name}`] : []));
  return result.flat();
}
async function assertRouteCoverage(endpoints) {
  const expected = endpoints.map(e => `${e.method} ${e.route}`);
  expected.push("GET auth/[...nextauth]", "POST auth/[...nextauth]", "POST auth/register",
    "GET trips", "GET trips/[id]", "GET trips/[id]/pickups", "GET trips/[id]/departures");
  const actual = [];
  for (const file of await apiFiles("src/app/api")) {
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    const route = file.slice("src/app/api/".length, -"/route.ts".length);
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (/^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)$/.test(statement.name?.text ?? "")) actual.push(`${statement.name.text} ${route}`);
      } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const item of statement.exportClause.elements) {
          if (/^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)$/.test(item.name.text)) actual.push(`${item.name.text} ${route}`);
        }
      }
    }
  }
  assert.deepEqual(actual.sort(), expected.sort(), "Every API method needs an explicit public/role policy and HTTP coverage; review new endpoints against A03.");
}

const lease = createServer();
lease.listen(0, "127.0.0.1");
await once(lease, "listening");
const port = lease.address().port;
await new Promise(resolve => lease.close(resolve));
const base = `http://127.0.0.1:${port}`, origin = `https://localhost:${port}`;
async function request(endpoint, actor, { claims = {}, originHeader = origin, body = endpoint.body?.() } = {}) {
  const headers = new Headers();
  if (actor) {
    const token = await encode({ secret, maxAge: 8 * 60 * 60, token: { sub: String(actor.user_id), role: actor.role,
      auth_version: actor.auth_version, authenticated_at: Math.floor(Date.now() / 1000), ...claims } });
    headers.set("cookie", `__Secure-next-auth.session-token=${token}`);
  }
  if (endpoint.method !== "GET" && originHeader !== null) headers.set("origin", originHeader);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(base + endpoint.path, { method: endpoint.method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(10000) });
  requests++;
  assert.match(response.headers.get("content-type") ?? "", /application\/json/, `${endpoint.method} ${endpoint.route}: JSON required, never a login redirect`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, body: await response.json(), label: `${endpoint.method} ${endpoint.route}` };
}
function expect(result, status, code) {
  assert.equal(result.status, status, result.label);
  if (code) assert.deepEqual(result.body, { error: { code, message: result.body.error?.message } });
}
function noSecrets(value) {
  for (const [key, field] of Object.entries(value ?? {})) {
    assert.doesNotMatch(key, /password|auth_version|bank_|content_sha256|responsible_user_id/i);
    if (field && typeof field === "object") noSecrets(field);
  }
}

try {
  // A real legacy account is migrated locally; a signed pre-cutover cookie must fail over HTTP.
  const legacy = (await database.sql.query(`INSERT INTO users(email,password_hash,full_name,phone,role,auth_version)
    VALUES('legacy@rbac.example.test','unused-fixture-hash','Legacy fixture','0901234567','Accountant',4) RETURNING user_id`)).rows[0];
  const migrations = new URL("../../prisma/migrations/", import.meta.url);
  // Keep this upgrade fixture compatible with subsequent migrations added by teammates.
  for (const name of (await readdir(migrations)).filter(name => /^\d+_/.test(name) && name >= "20261021000000_five_roles").sort()) {
    await database.sql.exec(await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"));
  }
  const migrated = await db.user.findUniqueOrThrow({ where: { user_id: legacy.user_id } });
  assert.equal(migrated.role, "Customer"); assert.equal(migrated.status, "Locked"); assert.equal(migrated.auth_version, 5);
  assert.equal(await db.auditLog.count(), 2);
  for (const role of [...roles, "OtherCustomer", "OtherLeader"]) {
    const user = await db.user.create({ data: { email: `${role}@rbac.example.test`, password_hash: "unused-fixture-hash",
      role: role === "OtherCustomer" ? "Customer" : role === "OtherLeader" ? "Leader" : role, full_name: role, phone: "0901234567" } });
    actors.set(role, { user_id: user.user_id, role: user.role, auth_version: 0 });
  }
  const trip = await db.trip.create({ data: tripInput });
  const otherTrip = await db.trip.create({ data: { ...tripInput, name: "Other trail" } });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Fixture pickup", address: "Fixture address" } });
  const otherPickup = await db.pickupPoint.create({ data: { trip_id: otherTrip.trip_id, name: "Other pickup", address: "Other address" } });
  const vehicle = await db.vehicle.create({ data: { plate_number: "51B-000.01", vehicle_type: "Fixture bus", seat_count: 2 } });
  const seat = await db.vehicleSeat.create({ data: { ...seatInput, vehicle_id: vehicle.vehicle_id } });
  await db.vehicleSeat.create({ data: { ...seatInput, seat_name: "A02", x_position: 1, vehicle_id: vehicle.vehicle_id } });
  const otherVehicle = await db.vehicle.create({ data: { plate_number: "51B-000.02", vehicle_type: "Other bus", seat_count: 1 } });
  const otherSeat = await db.vehicleSeat.create({ data: { ...seatInput, vehicle_id: otherVehicle.vehicle_id } });
  const staff = await db.staff.create({ data: { user_id: actors.get("Leader").user_id, full_name: "Assigned leader", phone: "0901234567", staff_type: "Leader" } });
  const departures = [];
  for (const status of ["Draft", "Open", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) {
    const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status, min_passengers: 1,
      departure_date: new Date("2030-01-02"), booking_deadline: new Date("2030-01-01") } });
    const assignment = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: otherVehicle.vehicle_id } });
    await db.departureStaff.create({ data: { departure_id: departure.departure_id, staff_id: staff.staff_id, role_in_trip: "Leader", dep_vehicle_id: assignment.dep_vehicle_id } });
    departures.push(departure);
  }
  const invoice = await db.invoice.create({ data: { customer_id: actors.get("Customer").user_id, departure_id: departures[1].departure_id,
    payment_code: "RBAC-OWN", total_amount: "500000", expires_at: new Date("2030-01-01") } });
  const endpoints = [];
  function route(route, path, allowed, methods) {
    for (const [method, body] of Object.entries(methods)) endpoints.push({ route, path, allowed, method, body,
      success: method === "POST" ? 201 : 200 });
  }
  route("account/me", "/api/account/me", roles, { GET: undefined });
  route("invoices/[id]", `/api/invoices/${invoice.invoice_id}`, ["Customer", "Admin"], { GET: undefined });
  route("leader/departures", "/api/leader/departures", ["Leader", "Admin"], { GET: undefined });
  route("admin/users/[id]/access", `/api/admin/users/${actors.get("OtherCustomer").user_id}/access`, ["Admin"], { PATCH: () => ({ status: "Active" }) });
  route("staff/trips", "/api/staff/trips", ["RouteMgr", "Admin"], { GET: undefined, POST: () => ({ ...tripInput, name: `Created trail ${next()}` }) });
  route("staff/trips/[id]", `/api/staff/trips/${trip.trip_id}`, ["RouteMgr", "Admin"], { GET: undefined, PATCH: () => ({ name: `Edited trail ${next()}` }), DELETE: undefined });
  route("staff/trips/[id]/pickups", `/api/staff/trips/${trip.trip_id}/pickups`, ["RouteMgr", "Admin"], { GET: undefined, POST: () => ({ name: `Created pickup ${next()}`, address: "Fixture address" }) });
  route("staff/trips/[id]/pickups/[pickupId]", `/api/staff/trips/${trip.trip_id}/pickups/${pickup.pickup_id}`, ["RouteMgr", "Admin"], { PATCH: () => ({ name: `Edited pickup ${next()}` }), DELETE: undefined });
  route("staff/vehicles", "/api/staff/vehicles", ["HRMgr", "Admin"], { GET: undefined, POST: () => ({ plate_number: `51B-${next()}`, vehicle_type: "Created bus", seats: [seatInput] }) });
  route("staff/vehicles/[id]", `/api/staff/vehicles/${vehicle.vehicle_id}`, ["HRMgr", "Admin"], { GET: undefined, PATCH: () => ({ vehicle_type: `Edited bus ${next()}` }), DELETE: undefined });
  let addedSeat = 2;
  route("staff/vehicles/[id]/seats", `/api/staff/vehicles/${vehicle.vehicle_id}/seats`, ["HRMgr", "Admin"], { POST: () => ({ ...seatInput, seat_name: `B${++addedSeat}`, x_position: 2, y_position: addedSeat }) });
  route("staff/vehicles/[id]/seats/[seatId]", `/api/staff/vehicles/${vehicle.vehicle_id}/seats/${seat.seat_id}`, ["HRMgr", "Admin"], { PATCH: () => ({ seat_name: `S${next()}` }), DELETE: undefined });
  route("staff/vehicles/[id]/maintenance", `/api/staff/vehicles/${vehicle.vehicle_id}/maintenance`, ["HRMgr", "Admin"], { GET: undefined,
    POST: () => ({ start_date: "2031-01-01", end_date: "2031-01-02", description: "Fixture maintenance", cost: "100000" }) });
  assert.equal(endpoints.length, 23);
  await assertRouteCoverage(endpoints);
  console.log("PASS: explicit A03 policies cover all 23 protected API methods; new/unclassified API methods fail this gate.");

  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, VERCEL: "", NODE_ENV: "production", DATABASE_URL: database.connectionString,
      DIRECT_URL: database.connectionString, AUTH_SECRET: secret, NEXTAUTH_URL: origin,
      UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  child.stdout.resume(); child.stderr.resume();
  child.on("error", () => { startupError = true; });
  const startup = { method: "GET", route: "account/me", path: "/api/account/me" };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (startupError || child.exitCode !== null) throw new Error("Isolated RBAC server stopped; provider output suppressed.");
    try { if ((await request(startup)).status === 401) { ready = true; break; } } catch { /* startup only */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Production build must be available before HTTP RBAC checks.");
  const deniedSnapshot = async () => {
    const rows = await Promise.all([db.trip.findMany({ orderBy: { trip_id: "asc" } }),
      db.pickupPoint.findMany({ orderBy: { pickup_id: "asc" } }), db.vehicle.findMany({ orderBy: { vehicle_id: "asc" } }),
      db.vehicleSeat.findMany({ orderBy: { seat_id: "asc" } }), db.vehicleMaintenance.findMany({ orderBy: { maintenance_id: "asc" } }),
      db.auditLog.findMany({ orderBy: { log_id: "asc" } }), db.invoice.findMany({ orderBy: { invoice_id: "asc" } }),
      db.user.findMany({ orderBy: { user_id: "asc" }, select: { user_id: true, role: true, status: true, auth_version: true } })]);
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  };
  for (const endpoint of endpoints) {
    const before = await deniedSnapshot();
    expect(await request(endpoint), 401, "UNAUTHENTICATED");
    for (const role of roles.filter(role => !endpoint.allowed.includes(role))) {
      expect(await request(endpoint, actors.get(role)), 403, "FORBIDDEN");
      expect(await request(endpoint, actors.get(role), { claims: { role: "Admin" } }), 403, "FORBIDDEN");
    }
    assert.equal(await deniedSnapshot(), before, `${endpoint.method} ${endpoint.route}: denied writes cannot alter business rows, access or audits`);
  }
  console.log("PASS: anonymous and disallowed roles fail every protected method, including forged Admin JWT roles, without altering business rows, access or audits.");
  for (const endpoint of endpoints) {
    for (const role of endpoint.allowed) {
      const result = await request(endpoint, actors.get(role));
      expect(result, endpoint.success); noSecrets(result.body.data);
    }
  }
  console.log("PASS: every allowed role executes each permitted method successfully; read DTOs omit credentials, bank fields and session versions.");

  const ownInvoice = endpoints.find(e => e.route === "invoices/[id]");
  expect(await request(ownInvoice, actors.get("OtherCustomer")), 404, "NOT_FOUND");
  const leaderRead = endpoints.find(e => e.route === "leader/departures");
  const assigned = (await request(leaderRead, actors.get("Leader"))).body.data;
  assert.deepEqual(assigned.map(row => row.status).sort(), ["Confirmed", "Ended", "Running"]);
  assert.deepEqual((await request(leaderRead, actors.get("OtherLeader"))).body.data, []);
  const pickupWrite = endpoints.find(e => e.route.endsWith("pickups/[pickupId]") && e.method === "PATCH");
  expect(await request({ ...pickupWrite, path: `/api/staff/trips/${trip.trip_id}/pickups/${otherPickup.pickup_id}` }, actors.get("RouteMgr")), 404, "NOT_FOUND");
  const seatWrite = endpoints.find(e => e.route.endsWith("seats/[seatId]") && e.method === "PATCH");
  expect(await request({ ...seatWrite, path: `/api/staff/vehicles/${vehicle.vehicle_id}/seats/${otherSeat.seat_id}` }, actors.get("HRMgr")), 404, "NOT_FOUND");
  console.log("PASS: cross-Customer invoice, unassigned Leader, cross-trip pickup and cross-vehicle seat access are blocked by resource scope.");

  const routeManager = actors.get("RouteMgr");
  const changeRole = { method: "PATCH", route: "admin/users/[id]/access", path: `/api/admin/users/${routeManager.user_id}/access`,
    body: () => ({ role: "HRMgr" }) };
  expect(await request(changeRole, actors.get("Admin")), 200);
  for (const endpoint of endpoints) expect(await request(endpoint, routeManager), 401, "UNAUTHENTICATED");
  const changedActor = { ...routeManager, auth_version: 1 }; // Deliberately stale RouteMgr role claim, fresh version.
  const fleetRead = endpoints.find(e => e.route === "staff/vehicles" && e.method === "GET");
  const catalogRead = endpoints.find(e => e.route === "staff/trips" && e.method === "GET");
  expect(await request(fleetRead, changedActor), 200);
  expect(await request(catalogRead, changedActor), 403, "FORBIDDEN");
  assert.equal((await request(startup, changedActor)).body.data.role, "HRMgr");
  expect(await request(changeRole, actors.get("Admin"), { body: { role: "Accountant" } }), 422, "INVALID_INPUT");
  expect(await request(changeRole, actors.get("Admin"), { body: { role: "RouteMgr" } }), 200);
  actors.set("RouteMgr", { ...routeManager, auth_version: 2 });
  assert.equal(await db.auditLog.count({ where: { action: "RoleChanged", record_id: String(routeManager.user_id) } }), 2);
  console.log("PASS: actual Admin role changes revoke old sessions across every method; fresh access follows the DB role, never the old JWT role or retired Accountant input.");

  for (const endpoint of endpoints.filter(e => e.method !== "GET")) {
    for (const originHeader of [null, "https://foreign.example.test"]) expect(await request(endpoint, actors.get("Admin"), { originHeader }), 403, "FORBIDDEN");
  }
  console.log("PASS: every cookie-authenticated write requires the canonical Origin, even for Admin.");
  for (const role of roles) {
    const actor = actors.get(role);
    await db.user.update({ where: { user_id: actor.user_id }, data: { status: "Locked" } });
    for (const endpoint of endpoints) expect(await request(endpoint, actor), 401, "UNAUTHENTICATED");
    await db.user.update({ where: { user_id: actor.user_id }, data: { status: "Active", auth_version: { increment: 1 } } });
    for (const endpoint of endpoints) expect(await request(endpoint, actor), 401, "UNAUTHENTICATED");
    const fresh = { ...actor, auth_version: actor.auth_version + 1 };
    expect(await request(startup, fresh), 200);
    expect(await request(startup, fresh, { claims: { authenticated_at: Math.floor(Date.now() / 1000) - 8 * 60 * 60 } }), 401, "UNAUTHENTICATED");
  }
  console.log("PASS: Locked and revoked sessions fail all 23 methods for every role; fresh sessions work and absolute expiry remains enforced.");
  const oldAccountant = { user_id: legacy.user_id, role: "Accountant", auth_version: 4 };
  for (const endpoint of endpoints) expect(await request(endpoint, oldAccountant), 401, "UNAUTHENTICATED");
  const admin = { ...actors.get("Admin"), auth_version: 1 };
  const unlock = { method: "PATCH", route: "admin/users/[id]/access", path: `/api/admin/users/${legacy.user_id}/access`, body: () => ({ status: "Active" }) };
  expect(await request(unlock, admin), 200);
  expect(await request(startup, oldAccountant), 401, "UNAUTHENTICATED");
  const unlocked = await db.user.findUniqueOrThrow({ where: { user_id: legacy.user_id } });
  assert.equal(unlocked.role, "Customer"); assert.equal(unlocked.auth_version, 6);
  const newCustomer = { user_id: legacy.user_id, role: "Customer", auth_version: 6 };
  expect(await request(startup, newCustomer), 200);
  expect(await request({ method: "GET", route: "staff/vehicles", path: "/api/staff/vehicles" }, newCustomer, { claims: { role: "Accountant" } }), 403, "FORBIDDEN");
  console.log(`PASS: actual Accountant migration and Admin unlock never revive pre-cutover sessions or retired privileges (${requests} HTTP checks).`);
} finally {
  if (child?.pid && child.exitCode === null) { child.kill(); await once(child, "exit"); }
  await database.close();
}
