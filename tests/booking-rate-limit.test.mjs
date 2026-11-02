import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { mockRedisRest } from "./helpers/test-redis.mjs";
import * as bookings from "../src/server/services/bookings.ts";
import { errorResponse } from "../src/server/http.ts";
import { createBookingRateLimiter, getBookingRateLimitNamespace } from "../src/server/services/booking-rate-limit.ts";
import { createRateLimiter } from "../src/server/auth/rate-limit.ts";

let database, db, redis, actors, departure, seats, pickup;
const keys = ["AUTH_SECRET", "BOOKING_RATE_LIMIT_NAMESPACE"];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const secret = "isolated-booking-limit-secret-at-least-32-characters";
before(async () => { redis = mockRedisRest(); database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  redis.reset(); process.env.AUTH_SECRET = secret; process.env.BOOKING_RATE_LIMIT_NAMESPACE = "go-trail:booking:test";
  await database.sql.exec("TRUNCATE users, trips, vehicles, system_settings RESTART IDENTITY CASCADE");
  actors = {};
  for (const role of ["Customer", "OtherCustomer", "RouteMgr", "HRMgr", "Leader", "Admin"]) {
    const user = await db.user.create({ data: { email: `${role}@booking-limit.example.test`, role: role.replace("Other", ""),
      full_name: role, phone: "0901234567", password_hash: "private-fixture" } });
    actors[role] = { user_id: user.user_id, role: user.role, auth_version: 0 };
  }
  const trip = await db.trip.create({ data: { name: "Rate fixture", city: "Tây Ninh", location_name: "Mountain", length_km: "5",
    base_price: "500000", description: "Fixture", schedule_content: "Fixture" } });
  const point = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Pickup", address: "Address" } });
  departure = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
    invoice_owner_user_id: actors.RouteMgr.user_id, departure_date: new Date("2036-01-02"), booking_deadline: new Date("2036-01-01"),
    pickups: { create: { pickup_id: point.pickup_id, pickup_time: new Date("2036-01-02") } } }, include: { pickups: true } });
  pickup = departure.pickups[0].dep_pickup_id;
  const vehicle = await db.vehicle.create({ data: { plate_number: "BOOKING-LIMIT", vehicle_type: "Bus", seat_count: 2,
    seats: { create: [0, 1].map(x_position => ({ seat_name: `A${x_position + 1}`, floor_level: 1, x_position, y_position: 0 })) } }, include: { seats: true } });
  const assigned = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  seats = [];
  for (const seat of vehicle.seats) seats.push((await db.departureSeat.create({ data: { dep_vehicle_id: assigned.dep_vehicle_id, seat_id: seat.seat_id } })).dep_seat_id);
});
after(async () => {
  redis?.close(); await database?.close();
  for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
});
const body = (seat = seats[0], key = "rate-booking-key-0001") => ({ idempotency_key: key, seats: [{ dep_seat_id: seat, dep_pickup_id: pickup,
  passenger_name: "Passenger", passenger_phone: "0901234567", emergency_contact: "Fixture contact", health_declaration: true }] });
const hold = (actor = actors.Customer, input = body(), source) => bookings.holdRateLimitedSeats(db, actor, departure.departure_id, input, source);
const fingerprint = async () => JSON.stringify(await Promise.all([db.invoice.findMany(), db.invoiceDetail.findMany(), db.departureSeat.findMany(), db.auditLog.findMany()]));

test("K04 allows ten attempts per customer, then returns 429/Retry-After with no booking writes", async () => {
  const first = await hold();
  for (let i = 1; i < 10; i++) assert.deepEqual(await hold(), first);
  const before = await fingerprint();
  const rejected = await hold(actors.Customer, body(seats[1], "rotated-rate-key-0001")).catch(error => error);
  assert.equal(rejected.code, "RATE_LIMITED"); assert.equal(rejected.status, 429);
  const response = errorResponse(rejected);
  assert.equal(response.status, 429); assert.match(response.headers.get("retry-after"), /^[1-9]\d?$/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const { error } = await response.json(); assert.deepEqual(Object.keys(error).sort(), ["code", "message"]);
  assert.equal(await fingerprint(), before);
  assert.equal(await db.invoice.count(), 1);
});

test("K04 budgets follow customer rather than idempotency key/departure and do not consume Auth budgets", async () => {
  for (let i = 0; i < 10; i++) await hold();
  await assert.rejects(bookings.holdRateLimitedSeats(db, actors.Customer, 2147483647, body(seats[1], "another-intent-key-0001")), { code: "RATE_LIMITED" });
  const other = await hold(actors.OtherCustomer, body(seats[1]));
  assert.equal(other.tickets[0].dep_seat_id, seats[1]);
  assert.equal(redis.counters.size, 2);
  assert.ok([...redis.counters.keys()].every(key => key.startsWith("go-trail:booking:test:v1:") && !key.includes("@") && !key.includes("Customer")));
});

test("K04 expiry resets the budget; blocked attempts never extend TTL or renew the original hold", async () => {
  const first = await hold();
  const bucket = [...redis.counters.values()][0];
  const expiry = bucket.expiresAt;
  for (let i = 1; i < 10; i++) await hold();
  await assert.rejects(hold(), { code: "RATE_LIMITED" });
  assert.equal(bucket.expiresAt, expiry);
  bucket.expiresAt = Date.now() - 1;
  assert.deepEqual(await hold(), first);
});

test("K04 Admin inherits booking permission but does not bypass the attempt budget", async () => {
  const first = await hold(actors.Admin);
  for (let i = 1; i < 10; i++) assert.deepEqual(await hold(actors.Admin), first);
  await assert.rejects(hold(actors.Admin), { code: "RATE_LIMITED" });
});

test("K04 auth and schema rejection happen before Redis and cannot change booking state", async () => {
  const before = await fingerprint();
  await assert.rejects(hold(null), { code: "UNAUTHENTICATED" });
  for (const role of ["RouteMgr", "HRMgr", "Leader"]) await assert.rejects(hold(actors[role]), { code: "FORBIDDEN" });
  for (const input of [{ ...body(), customer_id: actors.Admin.user_id }, { ...body(), total_amount: "1" },
    { ...body(), seats: [{ ...body().seats[0], health_declaration: false }] },
    { ...body(), seats: [{ ...body().seats[0], passenger_phone: "bad" }] }, { ...body(), seats: [body().seats[0], body().seats[0]] }]) {
    await assert.rejects(hold(actors.Customer, input), { code: "INVALID_INPUT" });
  }
  await db.user.update({ where: { user_id: actors.Customer.user_id }, data: { status: "Locked" } });
  await assert.rejects(hold(), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: actors.Customer.user_id }, data: { status: "Active", auth_version: 1 } });
  await assert.rejects(hold(), { code: "UNAUTHENTICATED" });
  assert.equal(redis.calls, 0); assert.equal(await fingerprint(), before);
});

test("K04 Redis outage and timeout fail closed with 503 and generic errors before any transaction", async () => {
  const before = await fingerprint();
  for (const kind of ["outage", "timeout"]) {
    redis.reset(); if (kind === "outage") redis.setUnavailable(true); else redis.setTimeout(true);
    const error = await hold().catch(error => error);
    assert.equal(error.code, "BOOKING_UNAVAILABLE"); assert.equal(error.status, 503);
    assert.doesNotMatch(JSON.stringify(await errorResponse(error).json()), /provider|token|Prisma|upstash|private-fixture/);
    assert.equal(redis.calls, 1, "SDK must not retry counter requests");
    assert.equal(await fingerprint(), before);
  }
});

test("K04 missing Redis/secret or invalid namespace/source fails closed without network or writes", async () => {
  // Prime the cached SDK client: validation must still run if env later goes missing.
  await hold(); redis.reset();
  const before = await fingerprint();
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "AUTH_SECRET"]) {
    const previous = process.env[key]; process.env[key] = "";
    await assert.rejects(hold(), { code: "BOOKING_UNAVAILABLE" });
    process.env[key] = previous;
  }
  process.env.BOOKING_RATE_LIMIT_NAMESPACE = "invalid namespace";
  await assert.rejects(hold(), { code: "BOOKING_UNAVAILABLE" });
  process.env.BOOKING_RATE_LIMIT_NAMESPACE = "go-trail:booking:test";
  await assert.rejects(hold(actors.Customer, body(), "not-an-ip"), { code: "BOOKING_UNAVAILABLE" });
  assert.equal(redis.calls, 0); assert.equal(await fingerprint(), before);
});

test("K04 trusted source shares fifty attempts across users while another source remains independent", async () => {
  const customers = [];
  for (let i = 0; i < 6; i++) {
    const user = await db.user.create({ data: { email: `source-${i}@example.test`, password_hash: "unused", full_name: "Fixture", phone: "0901234567" } });
    customers.push({ user_id: user.user_id, role: "Customer", auth_version: 0 });
  }
  const before = await fingerprint();
  for (const customer of customers.slice(0, 5)) for (let i = 0; i < 10; i++) {
    await assert.rejects(bookings.holdRateLimitedSeats(db, customer, 2147483647, body(), "192.0.2.1"), { code: "NOT_FOUND" });
  }
  await assert.rejects(hold(customers[5], body(), "192.0.2.1"), { code: "RATE_LIMITED" });
  await assert.rejects(bookings.holdRateLimitedSeats(db, customers[5], 2147483647, body(), "192.0.2.2"), { code: "NOT_FOUND" });
  assert.ok([...redis.counters.keys()].every(key => !key.includes("192.0.2.")));
  assert.equal(await fingerprint(), before);
});

test("K04 namespaces isolate environments and Auth counters even when an explicit namespace is shared", async () => {
  assert.equal(getBookingRateLimitNamespace({ NODE_ENV: "development" }), "go-trail:booking:development");
  assert.equal(getBookingRateLimitNamespace({ NODE_ENV: "production", VERCEL_ENV: "preview" }), "go-trail:booking:preview");
  assert.equal(getBookingRateLimitNamespace({ NODE_ENV: "production" }), "go-trail:booking:production");
  assert.equal(getBookingRateLimitNamespace({ BOOKING_RATE_LIMIT_NAMESPACE: "test:custom" }), "test:custom");
  const calls = [];
  const store = { async eval(_script, [key], [, window]) { calls.push(key); return [1, window]; } };
  await createBookingRateLimiter(store, "shared:test", secret)(42, "192.0.2.42");
  await createRateLimiter(store, "shared:test")("login-email", "42", secret, 10);
  await createBookingRateLimiter(store, "preview:test", secret)(42);
  assert.equal(new Set(calls).size, 4);
  assert.ok(calls.every(key => /:v1:[a-f0-9]{64}$/.test(key) && !key.includes("192.0.2.")));
});

test("K04 malformed provider replies become generic 503 responses instead of allowing a hold", async () => {
  for (const reply of [null, [], [0, 100], [1, 0], [1, 60001], [12, 100], [1.5, 100], [1, "100"]]) {
    const consume = createBookingRateLimiter({ async eval() { return reply; } }, "test:bad-reply", secret);
    await assert.rejects(consume(1), { code: "BOOKING_UNAVAILABLE", status: 503 });
  }
});
