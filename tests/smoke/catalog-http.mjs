import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { createTestDatabase } from "../helpers/test-database.mjs";

// No .env loading, no live Redis: signed fixture sessions exercise real handlers/RBAC.
// DB URLs, session cookies, hashes, secrets and child-server output stay private.
const database = await createTestDatabase();
const lease = createServer();
lease.listen(0, "127.0.0.1");
await once(lease, "listening");
const port = lease.address().port;
await new Promise((resolve) => lease.close(resolve));
const base = `http://127.0.0.1:${port}`;
const origin = `https://localhost:${port}`;
const secret = randomBytes(32).toString("hex");
const actors = new Map();
const input = { name: "HTTP catalog fixture", city: "Tây Ninh", location_name: "Núi tham khảo",
  length_km: "8.50", base_price: "500000", description: "Dữ liệu cô lập.", schedule_content: "Đón khách → trekking → trở về." };
let child;

async function cookie(actor, claims = {}) {
  const token = await encode({ secret, maxAge: 8 * 60 * 60, token: { sub: String(actor.user_id), role: actor.role,
    auth_version: actor.auth_version, authenticated_at: Math.floor(Date.now() / 1000), ...claims } });
  return `__Secure-next-auth.session-token=${token}`;
}
async function request(path, options = {}, actor, claims) {
  const headers = new Headers(options.headers);
  if (actor) headers.set("cookie", await cookie(actor, claims));
  if (options.method && options.method !== "GET" && !headers.has("origin")) headers.set("origin", origin);
  if (options.body) headers.set("content-type", "application/json");
  const response = await fetch(base + path, { ...options, headers, redirect: "manual" });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    await response.text(); // Do not dump framework HTML on an unexpected status.
    return { response, body: {} };
  }
  return { response, body: await response.json() };
}
function check(result, status, code) {
  assert.equal(result.response.status, status);
  assert.equal(result.response.headers.get("cache-control"), "private, no-store");
  if (code) assert.equal(result.body.error.code, code);
}

try {
  for (const role of ["RouteMgr", "Admin", "Customer", "Leader", "HRMgr"]) {
    const user = await database.client.user.create({ data: { email: `${role}@http-catalog.example.test`,
      password_hash: "unused-fixture-hash", full_name: role, phone: "0901234567", role } });
    actors.set(role, { user_id: user.user_id, role, auth_version: 0 });
  }
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: database.connectionString,
      DIRECT_URL: database.connectionString, AUTH_SECRET: secret, NEXTAUTH_URL: origin,
      UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  child.stdout.resume(); child.stderr.resume();
  child.on("error", () => {});
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error("Catalog smoke server stopped; provider output suppressed.");
    try { if ((await fetch(base + "/api/account/me", { signal: AbortSignal.timeout(2000) })).status === 401) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Catalog smoke server did not become ready.");
  const empty = await request("/api/trips");
  check(empty, 200);
  assert.deepEqual(empty.body.data.items, []);
  const manager = actors.get("RouteMgr"), admin = actors.get("Admin");
  const created = await request("/api/staff/trips", { method: "POST", body: JSON.stringify(input) }, manager);
  check(created, 201);
  const trip = created.body.data;
  assert.equal(trip.base_price, "500000");
  assert.equal(trip.length_km, "8.50");
  assert.deepEqual(trip.media, []);
  assert.equal(trip.cover_image_url, null);
  check(await request(`/api/trips/${trip.trip_id}`), 200);
  const list = await request("/api/trips?q=HTTP&pageSize=1");
  check(list, 200);
  assert.equal(list.body.data.pagination.totalItems, 1);
  assert.equal("schedule_content" in list.body.data.items[0], false);
  console.log("PASS: guest public catalog, filters/pagination and RouteMgr create return decimal DTOs/no-store without Redis.");

  check(await request("/api/staff/trips", { method: "POST", body: JSON.stringify(input) }), 401, "UNAUTHENTICATED");
  for (const role of ["Customer", "Leader", "HRMgr"]) {
    check(await request("/api/staff/trips", {}, actors.get(role)), 403, "FORBIDDEN");
    check(await request("/api/staff/trips", { method: "POST", body: JSON.stringify(input) }, actors.get(role)), 403, "FORBIDDEN");
  }
  check(await request("/api/staff/trips", {}, actors.get("Customer"), { role: "Admin" }), 403, "FORBIDDEN");
  check(await request("/api/staff/trips", {}, admin), 200);
  check(await request(`/api/staff/trips/${trip.trip_id}`, { method: "PATCH", headers: { origin: "https://foreign.example.test" },
    body: JSON.stringify({ name: "Rejected" }) }, manager), 403, "FORBIDDEN");
  console.log("PASS: all roles, signed spoofed role and foreign-Origin writes are rejected by real server handlers.");

  const updated = await request(`/api/staff/trips/${trip.trip_id}`, { method: "PATCH", body: JSON.stringify({ base_price: "650000" }) }, admin);
  check(updated, 200);
  assert.equal(updated.body.data.base_price, "650000");
  assert.equal(await database.client.auditLog.count({ where: { action: "TripPriceChanged" } }), 1);
  const pickupResult = await request(`/api/staff/trips/${trip.trip_id}/pickups`, { method: "POST", body: JSON.stringify({ name: "Điểm đón", address: "Địa chỉ tham khảo" }) }, manager);
  check(pickupResult, 201);
  const pickup = pickupResult.body.data;
  check(await request(`/api/staff/trips/${trip.trip_id}/pickups/${pickup.pickup_id}`, { method: "DELETE" }, manager), 200);
  assert.equal((await request(`/api/trips/${trip.trip_id}/pickups`)).body.data.pagination.totalItems, 0);
  assert.equal((await request(`/api/staff/trips/${trip.trip_id}/pickups`, {}, manager)).body.data.pagination.totalItems, 1);
  check(await request(`/api/staff/trips/${trip.trip_id}/pickups/${pickup.pickup_id}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) }, admin), 200);
  console.log("PASS: Admin price edit has durable audit; pickup soft-delete/restoration preserves records and public visibility.");

  const departureData = { trip_id: trip.trip_id, departure_date: new Date("2030-01-01T22:00:00Z"), booking_deadline: new Date("2029-12-31"), min_passengers: 6, status: "Open" };
  await database.client.departure.create({ data: { ...departureData, price_override: "750000" } });
  await database.client.departure.create({ data: { ...departureData, is_demo: true } });
  await database.client.departure.create({ data: { ...departureData, status: "Draft" } });
  await database.client.departure.create({ data: { ...departureData, booking_deadline: new Date("2020-01-01") } });
  const departures = await request(`/api/trips/${trip.trip_id}/departures`);
  check(departures, 200);
  assert.equal(departures.body.data.pagination.totalItems, 1);
  assert.equal(departures.body.data.items[0].price, "750000");
  assert.equal("is_demo" in departures.body.data.items[0], false);
  console.log("PASS: actual public departure route excludes demo, non-Open and expired rows and returns UTC/effective price.");

  for (const path of ["/api/trips?page=1&page=2", "/api/trips?include_demo=true", "/api/trips/2147483648"]) check(await request(path), 422, "INVALID_INPUT");
  check(await request("/api/trips/99999"), 404, "NOT_FOUND");
  for (const body of [{ base_price: "-1" }, { source_url: "https://attacker.test" }, {}]) {
    check(await request(`/api/staff/trips/${trip.trip_id}`, { method: "PATCH", body: JSON.stringify(body) }, manager), 422, "INVALID_INPUT");
  }
  check(await request("/api/staff/trips", { method: "POST", body: JSON.stringify({ ...input, description: "x".repeat(65536) }) }, manager), 413, "INVALID_INPUT");
  check(await request(`/api/staff/trips/${trip.trip_id}`, { method: "DELETE" }, manager), 200);
  for (const path of [`/api/trips/${trip.trip_id}`, `/api/trips/${trip.trip_id}/pickups`, `/api/trips/${trip.trip_id}/departures`]) {
    check(await request(path), 404, "NOT_FOUND");
  }
  assert.equal((await request("/api/trips")).body.data.pagination.totalItems, 0);
  assert.equal((await request("/api/staff/trips", {}, manager)).body.data.pagination.totalItems, 1);
  check(await request(`/api/staff/trips/${trip.trip_id}`, { method: "DELETE" }, manager), 200);
  assert.equal(await database.client.auditLog.count({ where: { action: "TripAvailabilityChanged" } }), 1);
  assert.equal(await database.client.departure.count({ where: { trip_id: trip.trip_id } }), 4);
  check(await request(`/api/staff/trips/${trip.trip_id}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) }, admin), 200);
  check(await request(`/api/trips/${trip.trip_id}`), 200);
  console.log("PASS: trip retirement hides all public entry points, preserves existing departures and can be restored without duplicate retirement audit.");
  await database.client.user.update({ where: { user_id: manager.user_id }, data: { status: "Locked", auth_version: { increment: 1 } } });
  check(await request("/api/staff/trips", {}, manager), 401, "UNAUTHENTICATED");
  await database.client.user.update({ where: { user_id: manager.user_id }, data: { status: "Active" } });
  check(await request("/api/staff/trips", {}, manager), 401, "UNAUTHENTICATED");
  check(await request("/api/staff/trips", {}, { ...manager, auth_version: 1 }), 200);
  console.log("PASS: malformed queries/IDs/body limits/provenance injection and Locked/revoked sessions honor existing error contracts.");

  const hash = "a".repeat(64), mediaUrl = `https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/gotrail-media/trips/assets/${hash}.jpg`;
  for (const placement of ["Schedule", "Highlight", "Hero", "Cover"]) {
    await database.client.tripMedia.create({ data: { trip_id: trip.trip_id, placement, sort_order: 0,
      source_url: "https://gotrail.vn/wp-content/uploads/fixture.jpg", storage_url: mediaUrl,
      content_sha256: hash, alt_text: "Fixture image", title: placement === "Highlight" ? "Highlight fixture" : null } });
  }
  const detailMedia = await request(`/api/trips/${trip.trip_id}`);
  check(detailMedia, 200);
  assert.deepEqual(detailMedia.body.data.media.map(row => row.placement), ["Cover", "Hero", "Highlight", "Schedule"]);
  assert.equal(detailMedia.body.data.media[2].body, null);
  assert.equal(detailMedia.body.data.cover_image_url, mediaUrl);
  assert.equal("content_sha256" in detailMedia.body.data.media[0], false);
  assert.equal("source_url" in detailMedia.body.data.media[0], false);
  assert.equal((await request("/api/trips")).body.data.items[0].cover_image_url, mediaUrl);
  await database.client.tripMedia.updateMany({ where: { trip_id: trip.trip_id }, data: { is_active: false } });
  assert.deepEqual((await request(`/api/trips/${trip.trip_id}`)).body.data.media, []);
  assert.equal((await request("/api/trips")).body.data.items[0].cover_image_url, null);
  console.log("PASS: public media DTO orders all four placements, supports missing descriptions and hides inactive media/source hashes.");
} finally {
  if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
  await database.close();
}
