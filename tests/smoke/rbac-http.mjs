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
let child, startupError = false, sequence = 0, requests = 0, stage = "matrix";
const next = () => ++sequence;
const tripInput = { name: "RBAC trail", city: "Tây Ninh", location_name: "RBAC mountain", length_km: "5.00",
  base_price: "500000", description: "Isolated fixture", schedule_content: "Isolated schedule" };
const seatInput = { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 };
// Fictional receiving account only; never inherit real bank configuration from .env.
const bankFixture = { BANK_ID: "970436", BANK_ACCOUNT_NUMBER: "0000000000", BANK_ACCOUNT_NAME: "GO TRAIL TEST" };
const startup = { method: "GET", route: "account/me", path: "/api/account/me" };

async function apiFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = await Promise.all(entries.map(entry => entry.isDirectory() ? apiFiles(`${dir}/${entry.name}`)
    : entry.name === "route.ts" ? [`${dir}/${entry.name}`] : []));
  return result.flat();
}
async function assertRouteCoverage(endpoints) {
  const expected = endpoints.map(e => `${e.method} ${e.route}`);
  expected.push("GET auth/[...nextauth]", "POST auth/[...nextauth]", "POST auth/register",
    "GET trips", "GET trips/[id]", "GET trips/[id]/pickups", "GET trips/[id]/departures", "GET departures/[id]/seats",
    "GET departures/[id]/pickups");
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
async function sendRequest(endpoint, actor, { claims = {}, originHeader = origin, body = endpoint.body?.(), extraHeaders } = {}) {
  const headers = new Headers(extraHeaders);
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
  return response;
}
async function request(endpoint, actor, options) {
  const response = await sendRequest(endpoint, actor, options);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/, `${endpoint.method} ${endpoint.route}: JSON required, never a login redirect`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, body: await response.json(), retryAfter: response.headers.get("retry-after"), label: `${endpoint.method} ${endpoint.route}` };
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

function invoiceDto(value) {
  const { payment, ...summary } = value;
  noSecrets(summary);
  assert.deepEqual(Object.keys(value).sort(), ["invoice_id", "departure_id", "payment_code", "status", "total_amount", "expires_at", "created_at",
    "responsible_name_snapshot", "responsible_role_snapshot", "customer_name", "departure", "tickets", "server_time", "payment"].sort());
  assert.match(value.total_amount, /^(0|[1-9]\d*)$/);
  for (const key of ["created_at", "expires_at", "server_time"]) assert.equal(new Date(value[key]).toISOString(), value[key]);
  if (payment.status !== "Ready") {
    assert.ok(["Expired", "NotPayable", "Unavailable"].includes(payment.status));
    assert.deepEqual(Object.keys(payment), ["status"]);
    return;
  }
  assert.deepEqual(Object.keys(payment).sort(), ["status", "bank_id", "account_number", "account_name", "amount", "transfer_content", "qr_url"].sort());
  assert.equal(payment.bank_id, bankFixture.BANK_ID); assert.equal(payment.account_number, bankFixture.BANK_ACCOUNT_NUMBER);
  assert.equal(payment.account_name, bankFixture.BANK_ACCOUNT_NAME); assert.equal(payment.amount, value.total_amount);
  assert.equal(payment.transfer_content, value.payment_code);
  const qr = new URL(payment.qr_url);
  assert.equal(qr.origin, "https://vietqr.app"); assert.equal(qr.pathname, "/img");
  assert.deepEqual([...qr.searchParams.keys()].sort(), ["acc", "bank", "amount", "des", "holder", "template"].sort());
  assert.equal(qr.searchParams.get("acc"), payment.account_number); assert.equal(qr.searchParams.get("bank"), payment.bank_id);
  assert.equal(qr.searchParams.get("amount"), value.total_amount); assert.equal(qr.searchParams.get("des"), value.payment_code);
  assert.equal(qr.searchParams.get("holder"), payment.account_name);
}

async function startServer(bank = {}) {
  startupError = false;
  child = spawn(process.execPath, ["--import", "./tests/helpers/preload-redis.mjs", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, VERCEL: "", NODE_ENV: "production", DATABASE_URL: database.connectionString,
      DIRECT_URL: database.connectionString, AUTH_SECRET: secret, NEXTAUTH_URL: origin,
      UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", GO_TRAIL_MOCK_REDIS: "1",
      BOOKING_RATE_LIMIT_NAMESPACE: "go-trail:booking:http-test", BANK_ID: "", BANK_ACCOUNT_NUMBER: "", BANK_ACCOUNT_NAME: "", ...bank },
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  child.stdout.resume(); child.stderr.resume();
  child.on("error", () => { startupError = true; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (startupError || child.exitCode !== null) throw new Error("Isolated RBAC server stopped; provider output suppressed.");
    try { if ((await request(startup)).status === 401) { ready = true; break; } } catch { /* startup only */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Production build must be available before HTTP RBAC checks.");
}

async function setRedisUnavailable(unavailable) {
  const server = child, id = next();
  await new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer); server.off("message", onMessage);
      if (error) reject(error); else resolve();
    };
    const onMessage = (message) => {
      if (message?.type === "test-redis-availability-ack" && message.id === id) finish();
    };
    const timer = setTimeout(() => finish(new Error("Test Redis control did not acknowledge availability")), 5000);
    server.on("message", onMessage);
    server.send({ type: "test-redis-availability", id, unavailable }, (error) => {
      if (error) finish(new Error("Test Redis control channel unavailable"));
    });
  });
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
    const departure = await db.departure.create({ data: { trip_id: trip.trip_id, status, min_passengers: 1, invoice_owner_user_id: actors.get("RouteMgr").user_id,
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
  // O03/O04 fixtures are separate from catalog/fleet retirement fixtures above.
  const operationsTrip = await db.trip.create({ data: { ...tripInput, name: "Operations trail" } });
  const operationsPickup = await db.pickupPoint.create({ data: { trip_id: operationsTrip.trip_id, name: "Operations pickup", address: "Fixture address" } });
  const operationsDates = { departure_date: "2032-01-02T02:00:00.000Z", booking_deadline: "2032-01-01T02:00:00.000Z" };
  const draft = await db.departure.create({ data: { trip_id: operationsTrip.trip_id, status: "Draft", min_passengers: 1,
    invoice_owner_user_id: actors.get("RouteMgr").user_id,
    departure_date: new Date(operationsDates.departure_date), booking_deadline: new Date(operationsDates.booking_deadline) } });
  const operationsVehicle = await db.vehicle.create({ data: { plate_number: "RBAC-OPS", vehicle_type: "Fixture bus", seat_count: 1,
    seats: { create: [seatInput] } } });
  const removeVehicle = await db.vehicle.create({ data: { plate_number: "RBAC-REMOVE", vehicle_type: "Fixture bus", seat_count: 1,
    seats: { create: [seatInput] } } });
  const assistant = await db.staff.create({ data: { full_name: "Operations assistant", phone: "0901234567", staff_type: "Assistant" } });
  route("staff/trips/[id]/departures", `/api/staff/trips/${operationsTrip.trip_id}/departures`, ["RouteMgr", "Admin"], { GET: undefined,
    POST: () => ({ ...operationsDates, min_passengers: 1, invoice_owner_user_id: actors.get("RouteMgr").user_id,
      pickups: [{ pickup_id: operationsPickup.pickup_id, pickup_time: operationsDates.departure_date }] }) });
  route("staff/departures/[id]", `/api/staff/departures/${draft.departure_id}`, ["RouteMgr", "Admin"], {
    GET: undefined, PATCH: () => ({ min_passengers: 2 }) });
  route("staff/departures/[id]/assignments", `/api/staff/departures/${departures[3].departure_id}/assignments`, ["RouteMgr", "Leader", "HRMgr", "Admin"], { GET: undefined });
  route("staff/departures/[id]/vehicles", `/api/staff/departures/${draft.departure_id}/vehicles`, ["HRMgr", "Admin"], { POST: () => ({ vehicle_id: operationsVehicle.vehicle_id }) });
  endpoints.at(-1).success = 200;
  route("staff/departures/[id]/vehicles/[vehicleId]", `/api/staff/departures/${draft.departure_id}/vehicles/${removeVehicle.vehicle_id}`, ["HRMgr", "Admin"], { DELETE: undefined });
  endpoints.at(-1).prepareSuccess = async () => {
    await db.departureVehicle.create({ data: { departure_id: draft.departure_id, vehicle_id: removeVehicle.vehicle_id } });
  };
  route("staff/departures/[id]/staff", `/api/staff/departures/${draft.departure_id}/staff`, ["HRMgr", "Admin"], {
    POST: () => ({ vehicle_id: operationsVehicle.vehicle_id, staff_id: assistant.staff_id, role_in_trip: "Assistant" }) });
  endpoints.at(-1).success = 200;
  route("staff/departures/[id]/staff/[assignmentId]", `/api/staff/departures/${draft.departure_id}/staff/2147483647`, ["HRMgr", "Admin"], { DELETE: undefined });
  const removeStaffEndpoint = endpoints.at(-1);
  removeStaffEndpoint.prepareSuccess = async () => {
    const assignment = await db.departureVehicle.findUniqueOrThrow({ where: { departure_id_vehicle_id: { departure_id: draft.departure_id, vehicle_id: operationsVehicle.vehicle_id } } });
    const crew = await db.departureStaff.upsert({ where: { departure_id_staff_id_role_in_trip: { departure_id: draft.departure_id, staff_id: assistant.staff_id, role_in_trip: "Assistant" } },
      create: { departure_id: draft.departure_id, dep_vehicle_id: assignment.dep_vehicle_id, staff_id: assistant.staff_id, role_in_trip: "Assistant" }, update: {} });
    removeStaffEndpoint.path = `/api/staff/departures/${draft.departure_id}/staff/${crew.dep_staff_id}`;
  };
  const personnel = await db.staff.create({ data: { full_name: "Personnel fixture", phone: "0901234567", staff_type: "Assistant" } });
  route("staff/personnel", "/api/staff/personnel", ["HRMgr", "Admin"], { GET: undefined, POST: () => ({
    full_name: `Fixture driver ${next()}`, phone: "0901234567", staff_type: "Driver", license_number: `D-${next()}`,
    license_class: "D", license_expiry: "2036-12-31" }) });
  route("staff/personnel/[id]", `/api/staff/personnel/${personnel.staff_id}`, ["HRMgr", "Admin"], {
    GET: undefined, PATCH: () => ({ phone: "0907654321" }), DELETE: undefined });
  // C03: a RouteMgr only reaches the customers of invoices they are responsible for, so the directory needs one.
  const directoryInvoice = await db.invoice.create({ data: { customer_id: actors.get("OtherCustomer").user_id,
    departure_id: departures[1].departure_id, payment_code: "RBAC-DIRECTORY", total_amount: "500000",
    expires_at: new Date("2030-01-01"), responsible_user_id: actors.get("RouteMgr").user_id,
    responsible_name_snapshot: "RouteMgr fixture", responsible_role_snapshot: "RouteMgr" } });
  route("staff/customers", "/api/staff/customers", ["RouteMgr", "Admin"], { GET: undefined });
  route("staff/customers/[id]", `/api/staff/customers/${actors.get("OtherCustomer").user_id}`, ["RouteMgr", "Admin"], { GET: undefined });
  route("account/bookings", "/api/account/bookings", ["Customer", "Admin"], { GET: undefined });
  let bookingSeatId, bookingPickupId;
  route("departures/[id]/holds", "/api/departures/2147483647/holds", ["Customer", "Admin"], { POST: () => ({
    idempotency_key: `rbac-booking-key-${next()}`, seats: [{ dep_seat_id: bookingSeatId, dep_pickup_id: bookingPickupId,
      passenger_name: "Fixture passenger", passenger_phone: "0901234567", emergency_contact: "Fixture contact", health_declaration: true }],
  }) });
  const holdEndpoint = endpoints.at(-1);
  holdEndpoint.prepareSuccess = async () => {
    const sale = await db.departure.create({ data: { trip_id: operationsTrip.trip_id, status: "Open", min_passengers: 1,
      invoice_owner_user_id: actors.get("RouteMgr").user_id, departure_date: new Date("2036-01-02"), booking_deadline: new Date("2036-01-01"),
      pickups: { create: { pickup_id: operationsPickup.pickup_id, pickup_time: new Date("2036-01-02") } } }, include: { pickups: true } });
    const assigned = await db.departureVehicle.create({ data: { departure_id: sale.departure_id, vehicle_id: operationsVehicle.vehicle_id } });
    const physicalSeat = await db.vehicleSeat.findFirstOrThrow({ where: { vehicle_id: operationsVehicle.vehicle_id } });
    const seat = await db.departureSeat.create({ data: { dep_vehicle_id: assigned.dep_vehicle_id, seat_id: physicalSeat.seat_id } });
    bookingSeatId = seat.dep_seat_id; bookingPickupId = sale.pickups[0].dep_pickup_id;
    holdEndpoint.path = `/api/departures/${sale.departure_id}/holds`;
  };
  assert.equal(endpoints.length, 41);
  await assertRouteCoverage(endpoints);
  console.log("PASS: explicit A03 policies cover all 41 protected API methods; new/unclassified API methods fail this gate.");

  await startServer();
  const deniedSnapshot = async () => {
    const rows = await Promise.all([db.trip.findMany({ orderBy: { trip_id: "asc" } }),
      db.pickupPoint.findMany({ orderBy: { pickup_id: "asc" } }), db.vehicle.findMany({ orderBy: { vehicle_id: "asc" } }),
      db.vehicleSeat.findMany({ orderBy: { seat_id: "asc" } }), db.vehicleMaintenance.findMany({ orderBy: { maintenance_id: "asc" } }),
      db.departure.findMany({ orderBy: { departure_id: "asc" } }), db.departurePickup.findMany({ orderBy: { dep_pickup_id: "asc" } }),
      db.departureVehicle.findMany({ orderBy: { dep_vehicle_id: "asc" } }), db.departureStaff.findMany({ orderBy: { dep_staff_id: "asc" } }),
      db.departureSeat.findMany({ orderBy: { dep_seat_id: "asc" } }),
      db.auditLog.findMany({ orderBy: { log_id: "asc" } }), db.invoice.findMany({ orderBy: { invoice_id: "asc" } }),
      db.invoiceDetail.findMany({ orderBy: { detail_id: "asc" } }),
      db.payment.findMany({ orderBy: { payment_id: "asc" } }), db.refund.findMany({ orderBy: { refund_id: "asc" } }),
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
      await endpoint.prepareSuccess?.();
      const result = await request(endpoint, actors.get(role));
      expect(result, endpoint.success);
      if (endpoint.route === "invoices/[id]") invoiceDto(result.body.data); else noSecrets(result.body.data);
    }
  }
  console.log("PASS: every allowed role executes each permitted method successfully; DTOs omit credentials/session versions and expose receiving-bank fields only in the authorized invoice payment contract.");

  const assignmentRead = endpoints.find(e => e.route === "staff/departures/[id]/assignments");
  expect(await request(assignmentRead, actors.get("OtherLeader")), 403, "FORBIDDEN");
  expect(await request({ ...assignmentRead, path: `/api/staff/departures/${departures[0].departure_id}/assignments` }, actors.get("Leader")), 403, "FORBIDDEN");
  await db.departure.update({ where: { departure_id: departures[3].departure_id }, data: { invoice_owner_user_id: null } });
  expect(await request(assignmentRead, actors.get("RouteMgr")), 403, "FORBIDDEN");
  await db.departure.update({ where: { departure_id: departures[3].departure_id }, data: { invoice_owner_user_id: actors.get("RouteMgr").user_id } });
  console.log("PASS: assignment reads enforce RouteMgr ownership and assigned Leader operational-state scope.");

  // K01: use the real O03/O04 HTTP flow before exercising its public read contract.
  const saleDate = "2033-01-02T02:00:00.000Z", saleDeadline = "2033-01-01T02:00:00.000Z";
  const createdSale = await request({ method: "POST", route: "staff/trips/[id]/departures",
    path: `/api/staff/trips/${operationsTrip.trip_id}/departures`, body: () => ({
      departure_date: saleDate, booking_deadline: saleDeadline, min_passengers: 1,
      pickups: [{ pickup_id: operationsPickup.pickup_id, pickup_time: saleDate }],
    }) }, actors.get("RouteMgr"));
  expect(createdSale, 201);
  const saleId = createdSale.body.data.departure_id;
  const saleVehicle = await db.vehicle.create({ data: { plate_number: "PRIVATE-SEAT-BUS", vehicle_type: "Public bus", seat_count: 3,
    seats: { create: [0, 1, 2].map(index => ({ seat_name: `S0${index + 1}`, floor_level: index === 2 ? 2 : 1,
      x_position: index === 1 ? 1 : 0, y_position: 0 })) } } });
  expect(await request({ method: "POST", route: "staff/departures/[id]/vehicles", path: `/api/staff/departures/${saleId}/vehicles`,
    body: () => ({ vehicle_id: saleVehicle.vehicle_id }) }, actors.get("HRMgr")), 200);
  expect(await request({ method: "PATCH", route: "staff/departures/[id]", path: `/api/staff/departures/${saleId}`,
    body: () => ({ status: "Open" }) }, actors.get("RouteMgr")), 200);
  const saleSeats = await db.departureSeat.findMany({ where: { vehicle: { departure_id: saleId } },
    orderBy: { seat: { seat_name: "asc" } } });
  const holdInvoice = await db.invoice.create({ data: { customer_id: actors.get("Customer").user_id, departure_id: saleId,
    payment_code: "PRIVATE-SEAT-HOLD", total_amount: "1000000", expires_at: new Date(Date.now() + 3600000) } });
  const paidInvoice = await db.invoice.create({ data: { customer_id: actors.get("OtherCustomer").user_id, departure_id: saleId,
    payment_code: "PRIVATE-SEAT-PAID", status: "Paid", total_amount: "500000", expires_at: new Date("2033-01-01") } });
  await db.departureSeat.update({ where: { dep_seat_id: saleSeats[0].dep_seat_id },
    data: { status: "Locked", invoice_id: holdInvoice.invoice_id, locked_until: new Date(Date.now() - 1000) } });
  await db.departureSeat.update({ where: { dep_seat_id: saleSeats[1].dep_seat_id },
    data: { status: "Locked", invoice_id: holdInvoice.invoice_id, locked_until: new Date(Date.now() + 3600000) } });
  await db.departureSeat.update({ where: { dep_seat_id: saleSeats[2].dep_seat_id },
    data: { status: "Sold", invoice_id: paidInvoice.invoice_id } });
  const publicMap = { method: "GET", route: "departures/[id]/seats", path: `/api/departures/${saleId}/seats` };
  const beforePublicRead = await deniedSnapshot();
  for (const actor of [undefined, ...roles.map(role => actors.get(role))]) {
    const result = await request(publicMap, actor);
    expect(result, 200); noSecrets(result.body.data);
    assert.deepEqual(Object.keys(result.body.data).sort(), ["departure_id", "vehicles"]);
    assert.equal(result.body.data.departure_id, saleId);
    assert.equal(result.body.data.vehicles.length, 1);
    const bus = result.body.data.vehicles[0];
    assert.deepEqual(Object.keys(bus).sort(), ["dep_vehicle_id", "seats", "vehicle_type"]);
    assert.equal(bus.vehicle_type, "Public bus");
    assert.deepEqual(bus.seats.map(seat => [seat.seat_name, seat.status]), [["S01", "Available"], ["S02", "Locked"], ["S03", "Sold"]]);
    for (const seat of bus.seats) assert.deepEqual(Object.keys(seat).sort(),
      ["dep_seat_id", "floor_level", "seat_name", "status", "x_position", "y_position"]);
  }
  assert.equal(await deniedSnapshot(), beforePublicRead, "Public seat-map reads cannot clean holds, change invoices/seats or write audits");
  for (const status of ["Draft", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) {
    await db.departure.update({ where: { departure_id: saleId }, data: { status } });
    expect(await request(publicMap), 404, "NOT_FOUND");
  }
  await db.departure.update({ where: { departure_id: saleId }, data: { status: "Open", is_demo: true } });
  expect(await request(publicMap), 404, "NOT_FOUND");
  await db.departure.update({ where: { departure_id: saleId }, data: { is_demo: false, booking_deadline: new Date(Date.now() - 1000) } });
  expect(await request(publicMap), 404, "NOT_FOUND");
  await db.departure.update({ where: { departure_id: saleId }, data: {
    departure_date: new Date(Date.now() - 1000), booking_deadline: new Date(Date.now() - 2000) } });
  expect(await request(publicMap), 404, "NOT_FOUND");
  await db.departure.update({ where: { departure_id: saleId }, data: { departure_date: new Date(saleDate), booking_deadline: new Date(saleDeadline) } });
  await db.trip.update({ where: { trip_id: operationsTrip.trip_id }, data: { is_active: false } });
  expect(await request(publicMap), 404, "NOT_FOUND");
  await db.trip.update({ where: { trip_id: operationsTrip.trip_id }, data: { is_active: true } });
  expect(await request({ ...publicMap, path: "/api/departures/2147483647/seats" }), 404, "NOT_FOUND");
  for (const id of ["0", "01", "-1", "1.5", "2147483648", "not-a-number"]) {
    expect(await request({ ...publicMap, path: `/api/departures/${id}/seats` }), 422, "INVALID_INPUT");
  }
  console.log("PASS: K01 public seat map follows O03/O04 sale setup, returns only safe seat fields to guests/all roles, hides unavailable departures and never mutates holds.");

  // Checkout consumes departure pickup IDs directly from the public HTTP contract, never from staff APIs.
  const pickupRead = { method: "GET", route: "departures/[id]/pickups", path: `/api/departures/${saleId}/pickups` };
  const beforePickupRead = await deniedSnapshot();
  let publicPickups;
  for (const actor of [undefined, ...roles.map(role => actors.get(role))]) {
    const result = await request(pickupRead, actor);
    expect(result, 200); noSecrets(result.body.data);
    assert.deepEqual(Object.keys(result.body.data).sort(), ["departure_id", "pickups"]);
    assert.equal(result.body.data.departure_id, saleId); assert.equal(result.body.data.pickups.length, 1);
    for (const item of result.body.data.pickups) assert.deepEqual(Object.keys(item).sort(),
      ["dep_pickup_id", "pickup_id", "name", "address", "pickup_time"].sort());
    publicPickups = result.body.data;
  }
  expect(await request({ ...pickupRead, path: "/api/departures/2147483647/pickups" }), 404, "NOT_FOUND");
  for (const id of ["0", "01", "-1", "1.5", "2147483648", "bad"]) {
    expect(await request({ ...pickupRead, path: `/api/departures/${id}/pickups` }), 422, "INVALID_INPUT");
  }
  await db.departure.update({ where: { departure_id: saleId }, data: { status: "Closed" } });
  expect(await request(pickupRead), 404, "NOT_FOUND");
  await db.departure.update({ where: { departure_id: saleId }, data: { status: "Open" } });
  assert.equal(await deniedSnapshot(), beforePickupRead, "Public pickup reads cannot change invoices, seats, assignments or audits");
  console.log("PASS: public departure pickup API is readable by guests/all roles, returns only assigned schedule fields and feeds real K02 holds without mutations.");

  // K02 extends the same real Draft -> assignment -> Open flow; only its unpaid stale holds may be reclaimed.
  await db.invoice.update({ where: { invoice_id: holdInvoice.invoice_id }, data: { expires_at: new Date(Date.now() - 1000) } });
  await db.departureSeat.update({ where: { dep_seat_id: saleSeats[1].dep_seat_id }, data: { locked_until: new Date(Date.now() - 1000) } });
  const salePickup = publicPickups.pickups[0];
  const bookingBody = { idempotency_key: "http-booking-key-0001", seats: saleSeats.slice(0, 2).map(seat => ({
    dep_seat_id: seat.dep_seat_id, dep_pickup_id: salePickup.dep_pickup_id, passenger_name: "Fixture passenger",
    passenger_phone: "0901234567", emergency_contact: "Fixture contact", health_declaration: true,
  })) };
  const book = { ...holdEndpoint, path: `/api/departures/${saleId}/holds`, body: () => bookingBody };
  const booked = await request(book, actors.get("Customer"));
  expect(booked, 201); noSecrets(booked.body.data);
  assert.equal(booked.body.data.status, "Pending"); assert.equal(booked.body.data.total_amount, "1000000");
  assert.equal(booked.body.data.tickets.length, 2);
  assert.equal(booked.body.data.responsible_name_snapshot, "RouteMgr");
  assert.equal(booked.body.data.responsible_role_snapshot, "RouteMgr");
  assert.ok(!JSON.stringify(booked.body).includes("passenger_phone"));
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: holdInvoice.invoice_id } })).status, "Expired");
  const retried = await request(book, actors.get("Customer"), { body: { ...bookingBody, seats: [...bookingBody.seats].reverse() } });
  expect(retried, 201); assert.deepEqual(retried.body, booked.body);
  const afterHold = await deniedSnapshot();
  expect(await request(book, actors.get("Customer"), { body: { ...bookingBody,
    seats: bookingBody.seats.map(seat => ({ ...seat, passenger_name: "Changed passenger" })) } }), 409, "RESOURCE_CONFLICT");
  expect(await request(book, actors.get("OtherCustomer")), 409, "RESOURCE_CONFLICT");
  for (const change of [{ responsible_user_id: actors.get("Admin").user_id }, { customer_id: actors.get("OtherCustomer").user_id }, { total_amount: "1" }]) {
    expect(await request(book, actors.get("Customer"), { body: { ...bookingBody, ...change } }), 422, "INVALID_INPUT");
  }
  expect(await request({ ...book, path: "/api/departures/2147483647/holds" }, actors.get("Customer"),
    { body: { ...bookingBody, idempotency_key: "http-missing-key-0001" } }), 404, "NOT_FOUND");
  expect(await request({ ...book, path: "/api/departures/01/holds" }, actors.get("Customer")), 422, "INVALID_INPUT");
  assert.equal(await deniedSnapshot(), afterHold, "Failed K02 requests cannot change invoice/snapshot/tickets/seats");
  assert.deepEqual((await request(publicMap)).body.data.vehicles[0].seats.map(seat => seat.status), ["Locked", "Locked", "Sold"]);
  expect(await request({ method: "GET", route: "invoices/[id]", path: `/api/invoices/${booked.body.data.invoice_id}` }, actors.get("Customer")), 200);
  expect(await request({ method: "GET", route: "invoices/[id]", path: `/api/invoices/${booked.body.data.invoice_id}` }, actors.get("OtherCustomer")), 404, "NOT_FOUND");
  console.log("PASS: K02 HTTP holds create the assigned employee snapshot, reclaim expired Pending holds, replay normalized retries and reject payload/key/ownership tampering without mutation.");

  // K03: same production route and actual K02 invoice; test unconfigured and configured servers.
  const invoiceRead = { method: "GET", route: "invoices/[id]", path: `/api/invoices/${booked.body.data.invoice_id}` };
  const noBank = await request(invoiceRead, actors.get("Customer"));
  expect(noBank, 200); invoiceDto(noBank.body.data);
  assert.deepEqual(noBank.body.data.payment, { status: "Unavailable" });
  child.kill(); await once(child, "exit");
  await startServer(bankFixture);
  const beforeInvoiceRead = await deniedSnapshot();
  let paymentInstructions;
  for (const role of ["Customer", "Admin"]) {
    const result = await request(invoiceRead, actors.get(role));
    expect(result, 200); invoiceDto(result.body.data);
    assert.equal(result.body.data.payment.status, "Ready");
    assert.equal(result.body.data.responsible_name_snapshot, "RouteMgr");
    assert.equal(result.body.data.responsible_role_snapshot, "RouteMgr");
    assert.equal(result.body.data.tickets.length, 2);
    for (const ticket of result.body.data.tickets) {
      assert.deepEqual(Object.keys(ticket).sort(), ["detail_id", "dep_seat_id", "dep_pickup_id", "seat_name", "passenger_name", "unit_price", "status", "pickup_name", "pickup_address", "pickup_time"].sort());
    }
    paymentInstructions = result.body.data.payment;
  }
  const injectedQuery = await request({ ...invoiceRead, path: `${invoiceRead.path}?amount=1&bank=ATTACKER&acc=123&customer_id=${actors.get("OtherCustomer").user_id}` }, actors.get("Customer"));
  expect(injectedQuery, 200); assert.deepEqual(injectedQuery.body.data.payment, paymentInstructions);
  expect(await request(invoiceRead, actors.get("OtherCustomer")), 404, "NOT_FOUND");
  expect(await request(invoiceRead, actors.get("OtherCustomer"), { claims: { role: "Admin" } }), 404, "NOT_FOUND");
  for (const role of ["RouteMgr", "Leader", "HRMgr"]) expect(await request(invoiceRead, actors.get(role)), 403, "FORBIDDEN");
  for (const id of ["0", "01", "-1", "1.5", "2147483648", "bad"]) expect(await request({ ...invoiceRead, path: `/api/invoices/${id}` }, actors.get("Customer")), 422, "INVALID_INPUT");
  expect(await request({ ...invoiceRead, path: "/api/invoices/2147483647" }, actors.get("Customer")), 404, "NOT_FOUND");
  const paidRead = await request({ ...invoiceRead, path: `/api/invoices/${paidInvoice.invoice_id}` }, actors.get("OtherCustomer"));
  expect(paidRead, 200); invoiceDto(paidRead.body.data); assert.deepEqual(paidRead.body.data.payment, { status: "NotPayable" });
  assert.equal(await deniedSnapshot(), beforeInvoiceRead, "K03 read/denied/query-tampered requests must never change money, seats, invoices or audits");
  await db.user.update({ where: { user_id: actors.get("RouteMgr").user_id }, data: { full_name: "Renamed employee" } });
  const renamedRead = await request(invoiceRead, actors.get("Customer"));
  expect(renamedRead, 200); assert.equal(renamedRead.body.data.responsible_name_snapshot, "RouteMgr");
  await db.user.update({ where: { user_id: actors.get("RouteMgr").user_id }, data: { full_name: "RouteMgr" } });
  await db.invoice.update({ where: { invoice_id: booked.body.data.invoice_id }, data: { expires_at: new Date(Date.now() - 1000) } });
  const beforeExpiryRead = await deniedSnapshot();
  const expiredRead = await request(invoiceRead, actors.get("Customer"));
  expect(expiredRead, 200); invoiceDto(expiredRead.body.data);
  assert.equal(expiredRead.body.data.status, "Pending"); assert.deepEqual(expiredRead.body.data.payment, { status: "Expired" });
  assert.equal(await deniedSnapshot(), beforeExpiryRead, "Reading an expired Pending invoice must not release its seats or mutate status");
  console.log("PASS: K03 invoice/VietQR HTTP contract enforces owner/Admin, immutable employee snapshots, exact VND/UTC, no-store, safe configured/unconfigured states and read-only expiry.");

  // C03: the customer directory and booking history over HTTP, with RouteMgr scoping and no PII beyond the contract.
  const beforeDirectory = await deniedSnapshot();
  const directoryList = { method: "GET", route: "staff/customers", path: "/api/staff/customers" };
  const directoryRead = { method: "GET", route: "staff/customers/[id]", path: `/api/staff/customers/${actors.get("OtherCustomer").user_id}` };
  const ownBookings = { method: "GET", route: "account/bookings", path: "/api/account/bookings" };
  const summaryKeys = ["user_id", "full_name", "email", "phone", "status", "created_at", "invoice_count", "last_booking_at"].sort();
  const historyKeys = ["invoice_id", "departure_id", "status", "total_amount", "created_at", "expires_at",
    "responsible_name_snapshot", "responsible_role_snapshot", "trip_name", "departure_date", "tickets"].sort();
  for (const actor of [actors.get("Admin"), actors.get("RouteMgr")]) {
    const listed = await request(directoryList, actor);
    expect(listed, 200); noSecrets(listed.body.data);
    assert.deepEqual(Object.keys(listed.body.data).sort(), ["items", "pagination"]);
    assert.deepEqual(Object.keys(listed.body.data.pagination).sort(), ["page", "pageSize", "totalItems", "totalPages"].sort());
    assert.ok(listed.body.data.items.some(item => item.user_id === actors.get("OtherCustomer").user_id));
    for (const item of listed.body.data.items) {
      assert.deepEqual(Object.keys(item).sort(), summaryKeys);
      assert.match(String(item.user_id), /^[1-9]\d*$/);
    }
    // Staff accounts are not customers and never appear in the directory.
    for (const staffRole of ["Leader", "RouteMgr", "HRMgr", "Admin"]) {
      assert.ok(!listed.body.data.items.some(item => item.user_id === actors.get(staffRole).user_id), `${staffRole} must not be listed as a customer`);
    }
  }
  // Admin sees every customer; a RouteMgr only those tied to an invoice they are responsible for.
  const adminList = await request(directoryList, actors.get("Admin"));
  const managerList = await request(directoryList, actors.get("RouteMgr"));
  assert.ok(adminList.body.data.pagination.totalItems >= managerList.body.data.pagination.totalItems);
  for (const item of managerList.body.data.items) assert.ok(item.invoice_count >= 1, "a scoped directory never lists customers without a managed invoice");
  for (const actor of [actors.get("Admin"), actors.get("RouteMgr")]) {
    const detail = await request(directoryRead, actor);
    expect(detail, 200); noSecrets(detail.body.data);
    assert.deepEqual(Object.keys(detail.body.data).sort(), ["bookings", "customer"]);
    assert.deepEqual(Object.keys(detail.body.data.customer).sort(), summaryKeys);
    assert.ok(!JSON.stringify(detail.body.data).includes("ticket_code"), "C03 never returns ticket codes; P04 owns QR issuance");
    for (const booking of detail.body.data.bookings) {
      assert.deepEqual(Object.keys(booking).sort(), historyKeys);
      assert.match(booking.total_amount, /^(0|[1-9]\d*)$/);
      for (const key of ["created_at", "expires_at", "departure_date"]) assert.equal(new Date(booking[key]).toISOString(), booking[key]);
      for (const ticket of booking.tickets) {
        assert.deepEqual(Object.keys(ticket).sort(), ["detail_id", "seat_name", "passenger_name", "status", "check_in_status"].sort());
      }
    }
  }
  const scopedDetail = await request(directoryRead, actors.get("RouteMgr"));
  assert.deepEqual(scopedDetail.body.data.bookings.map(booking => booking.invoice_id), [directoryInvoice.invoice_id]);
  // Out-of-scope and non-customer ids are indistinguishable from missing ones.
  expect(await request({ ...directoryRead, path: `/api/staff/customers/${actors.get("HRMgr").user_id}` }, actors.get("RouteMgr")), 404, "NOT_FOUND");
  expect(await request({ ...directoryRead, path: "/api/staff/customers/2147483647" }, actors.get("Admin")), 404, "NOT_FOUND");
  for (const id of ["0", "01", "-1", "1.5", "2147483648", "bad"]) {
    expect(await request({ ...directoryRead, path: `/api/staff/customers/${id}` }, actors.get("Admin")), 422, "INVALID_INPUT");
  }
  for (const query of ["page=0", "pageSize=51", "status=Deleted", "q=", "unknown=1", "page=1&page=2"]) {
    expect(await request({ ...directoryList, path: `/api/staff/customers?${query}` }, actors.get("Admin")), 422, "INVALID_INPUT");
  }
  // A Customer reads their own history only, and never another customer's invoices.
  const own = await request(ownBookings, actors.get("Customer"));
  expect(own, 200); noSecrets(own.body.data);
  assert.deepEqual(Object.keys(own.body.data).sort(), ["bookings", "customer_id"]);
  assert.equal(own.body.data.customer_id, actors.get("Customer").user_id);
  assert.ok(!own.body.data.bookings.some(booking => booking.invoice_id === directoryInvoice.invoice_id));
  assert.ok(!JSON.stringify(own.body.data).includes("ticket_code"));
  for (const booking of own.body.data.bookings) assert.deepEqual(Object.keys(booking).sort(), historyKeys);
  const otherOwn = await request(ownBookings, actors.get("OtherCustomer"));
  expect(otherOwn, 200);
  assert.equal(otherOwn.body.data.customer_id, actors.get("OtherCustomer").user_id);
  // Own history is every invoice of that customer, regardless of which employee is responsible for it.
  assert.ok(otherOwn.body.data.bookings.some(booking => booking.invoice_id === directoryInvoice.invoice_id));
  assert.ok(otherOwn.body.data.bookings.some(booking => booking.invoice_id === paidInvoice.invoice_id));
  assert.ok(!otherOwn.body.data.bookings.some(booking => booking.invoice_id === invoice.invoice_id),
    "a customer's own history must never include another customer's invoice");
  assert.equal(await deniedSnapshot(), beforeDirectory, "C03 reads cannot change accounts, invoices, tickets, seats or audits");
  console.log("PASS: C03 customer directory and booking history enforce Admin/RouteMgr scoping, Customer-own history, allowlisted fields without credentials or ticket codes, and no mutations.");

  // C00: a real Paid/Valid/Sold fixture and direct HTTP mutations, including Admin.
  const paidTicket = await db.invoiceDetail.create({ data: { invoice_id: paidInvoice.invoice_id,
    dep_seat_id: saleSeats[2].dep_seat_id, dep_pickup_id: salePickup.dep_pickup_id,
    passenger_name: "Policy fixture", passenger_phone: "0901234567", emergency_contact: "Fixture contact",
    health_declaration: true, unit_price: "500000", status: "Valid", ticket_code: "C00-VALID-TICKET" } });
  const beforePolicyAttempts = await deniedSnapshot();
  const noCancel = { method: "PATCH", route: "staff/departures/[id]", path: `/api/staff/departures/${saleId}` };
  for (const role of roles) {
    const actor = actors.get(role), canOperate = ["RouteMgr", "Admin"].includes(role);
    for (const status of ["Cancelled", "Rescheduled"]) {
      expect(await request(noCancel, actor, { body: { status } }), canOperate ? 409 : 403,
        canOperate ? "RESOURCE_CONFLICT" : "FORBIDDEN");
    }
    for (const body of [{ departure_date: "2033-01-03T02:00:00.000Z" },
      { pickups: [{ pickup_id: operationsPickup.pickup_id, pickup_time: "2033-01-03T02:00:00.000Z" }] }]) {
      expect(await request(noCancel, actor, { body }), canOperate ? 409 : 403,
        canOperate ? "RESOURCE_CONFLICT" : "FORBIDDEN");
    }
  }
  // Unsupported methods/routes have framework 404/405 responses rather than the application's JSON contract.
  // Keep the strict JSON/no-store assertions above for every implemented endpoint.
  const forbidden = [
    ["PATCH", `/api/invoices/${paidInvoice.invoice_id}`, { status: "Cancelled" }],
    ["DELETE", `/api/invoices/${paidInvoice.invoice_id}`],
    ["POST", `/api/invoices/${paidInvoice.invoice_id}/cancel`],
    ["POST", `/api/invoices/${paidInvoice.invoice_id}/refund`],
    ["PATCH", `/api/tickets/${paidTicket.detail_id}`, { status: "Cancelled", departure_id: draft.departure_id }],
    ["POST", `/api/tickets/${paidTicket.detail_id}/cancel`],
    ["POST", `/api/refunds`, { invoice_id: paidInvoice.invoice_id, amount: "500000" }],
    ["POST", `/api/admin/refunds`, { invoice_id: paidInvoice.invoice_id, amount: "500000" }],
    ["DELETE", `/api/staff/departures/${saleId}`],
    ["POST", `/api/staff/departures/${saleId}/cancel`],
    ["POST", `/api/staff/departures/${saleId}/reschedule`, { departure_date: "2033-01-03T02:00:00.000Z" }],
  ];
  for (const role of roles) {
    for (const [method, path, body] of forbidden) {
      const result = await sendRequest({ method, path }, actors.get(role), { body });
      assert.ok([403, 404, 405].includes(result.status), `${role} ${method} ${path}: must reject without a redirect`);
      await result.arrayBuffer();
    }
  }
  assert.equal(await deniedSnapshot(), beforePolicyAttempts,
    "C00 forbidden requests cannot mutate Paid/Valid/Sold, Pending holds, departure schedules, payments, refunds or audits");
  assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: paidInvoice.invoice_id } })).status, "Paid");
  assert.equal((await db.invoiceDetail.findUniqueOrThrow({ where: { detail_id: paidTicket.detail_id } })).status, "Valid");
  const soldPolicySeat = await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: saleSeats[2].dep_seat_id } });
  assert.equal(soldPolicySeat.status, "Sold"); assert.equal(soldPolicySeat.locked_until, null);
  assert.equal(await db.refund.count(), 0);
  console.log("PASS: C00 all five roles, including Admin, cannot cancel/refund/reschedule through direct HTTP calls; Paid/Valid/Sold and all financial/history rows stay unchanged.");

  // K04: retries are budgeted too; rotating browser-supplied source headers cannot reset the account budget.
  const beforeQuota = await deniedSnapshot();
  stage = "K04-outage";
  await setRedisUnavailable(true);
  const unavailable = await request(book, actors.get("Customer"));
  expect(unavailable, 503, "BOOKING_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(unavailable.body), /Redis|upstash|token|Prisma|ECONN|DATABASE_URL/i);
  assert.equal(unavailable.retryAfter, null);
  expect(await request(invoiceRead, actors.get("Customer")), 200);
  assert.equal(await deniedSnapshot(), beforeQuota, "Redis outage must not alter booking data; invoice reads remain available");
  stage = "K04-recovery";
  await setRedisUnavailable(false);
  const recovered = await request(book, actors.get("Customer"));
  expect(recovered, 201); assert.equal(recovered.body.data.invoice_id, booked.body.data.invoice_id);
  assert.equal(recovered.body.data.expires_at, expiredRead.body.data.expires_at);
  assert.equal(await deniedSnapshot(), beforeQuota);
  stage = "K04-quota";
  // Recovery consumed the first of ten attempts; keep the same process, counter and SDK client.
  for (let i = 0; i < 9; i++) {
    const result = await request(book, actors.get("Customer"), { extraHeaders: {
      "x-forwarded-for": `192.0.2.${i + 1}`, "x-vercel-forwarded-for": `198.51.100.${i + 1}`,
    } });
    expect(result, 201); assert.equal(result.body.data.invoice_id, booked.body.data.invoice_id);
    assert.equal(result.body.data.expires_at, expiredRead.body.data.expires_at);
  }
  const limited = await request(book, actors.get("Customer"), { body: { ...bookingBody, idempotency_key: "quota-rotated-key-0001" } });
  expect(limited, 429, "RATE_LIMITED"); assert.match(limited.retryAfter, /^[1-9]\d?$/);
  expect(await request(book, actors.get("Customer"), { body: { ...bookingBody, role: "Admin" } }), 422, "INVALID_INPUT");
  assert.equal(await deniedSnapshot(), beforeQuota, "Rate-limited retries must not write or renew a hold");
  console.log("PASS: K04 HTTP limits rotated/retried requests with 429/Retry-After; Redis outage fails closed with 503, preserves existing reads and recovers without duplicate invoices or renewed holds.");
  stage = "matrix";

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
  console.log(`PASS: Locked and revoked sessions fail all ${endpoints.length} methods for every role; fresh sessions work and absolute expiry remains enforced.`);
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
} catch (error) {
  // Keep the original assertion diagnosable even if a DB/socket cleanup also fails.
  console.error("RBAC_HTTP_FAILURE", {
    stage,
    name: error?.name,
    lines: (error?.stack ?? "").match(/rbac-http\.mjs:(\d+):(\d+)/g),
    actual: typeof error?.actual === "number" ? error.actual : undefined,
    expected: typeof error?.expected === "number" ? error.expected : undefined,
  });
  throw error;
} finally {
  if (child?.pid && child.exitCode === null) { child.kill(); await once(child, "exit"); }
  await database.close();
}
