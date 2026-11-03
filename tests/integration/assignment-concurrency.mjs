import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { assignStaff, assignVehicle } from "../../src/server/services/assignments.ts";
import { updateDeparture } from "../../src/server/services/departures.ts";

// Explicit integration gate: disposable local PostgreSQL only, never .env or DATABASE_URL.
const name = `gotrail-assignments-test-${randomUUID()}`;
const applicationName = name;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
let started = false, pool, db;
try {
  docker("run", "--rm", "--detach", "--name", name, "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
    "--publish", "127.0.0.1::5432", "postgres:18");
  started = true;
  const portMapping = docker("port", name, "5432/tcp");
  assert.match(portMapping, /^127\.0\.0\.1:\d+$/);
  const port = Number(portMapping.split(":")[1]);
  const config = { host: "127.0.0.1", port, user: "postgres", database: "postgres", connectionTimeoutMillis: 1000 };
  pool = new pg.Pool({ ...config, max: 3 });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { await pool.query("SELECT 1"); ready = true; break; } catch { await delay(250); }
  }
  assert.ok(ready, "Disposable PostgreSQL must start");
  const migrations = new URL("../../prisma/migrations/", import.meta.url);
  for (const migration of (await readdir(migrations)).filter(n => /^\d+_/.test(n)).sort()) {
    await pool.query(await readFile(new URL(`${migration}/migration.sql`, migrations), "utf8"));
  }
  db = new PrismaClient({ adapter: new PrismaPg({ ...config, max: 6, application_name: applicationName }) });
  const actors = {};
  for (const role of ["HRMgr", "RouteMgr", "Admin"]) {
    const user = await db.user.create({ data: { email: `${role}@concurrency.example.test`, password_hash: "unused",
      full_name: role, phone: "0901234567", role } });
    actors[role] = { user_id: user.user_id, role, auth_version: 0 };
  }
  const trip = await db.trip.create({ data: { name: "Concurrency fixture", city: "Test", location_name: "Test", length_km: "5",
    base_price: "500000", description: "Isolated", schedule_content: "Isolated" } });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Test", address: "Test" } });
  const day = new Date("2035-01-02T01:00:00Z");
  const makeDeparture = () => db.departure.create({ data: { trip_id: trip.trip_id, departure_date: day,
    booking_deadline: new Date("2035-01-01T01:00:00Z"), min_passengers: 1, status: "Draft",
    invoice_owner_user_id: actors.RouteMgr.user_id,
    pickups: { create: { pickup_id: pickup.pickup_id, pickup_time: day } } } });
  const makeVehicle = (plate) => db.vehicle.create({ data: { plate_number: plate, vehicle_type: "Fixture", seat_count: 1,
    seats: { create: { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 } } } });
  const left = await makeDeparture(), right = await makeDeparture();
  const leftVehicle = await makeVehicle("TEST-LEFT"), rightVehicle = await makeVehicle("TEST-RIGHT");
  await assignVehicle(db, actors.HRMgr, left.departure_id, { vehicle_id: leftVehicle.vehicle_id });
  await assignVehicle(db, actors.HRMgr, right.departure_id, { vehicle_id: rightVehicle.vehicle_id });
  const staff = await db.staff.create({ data: { full_name: "Shared assistant", phone: "0901234567", staff_type: "Assistant" } });

  async function whileBlocked(lockSql, lockParams, run, mutate, expectedWaiters) {
    const blocker = await pool.connect();
    let pending;
    try {
      await blocker.query("BEGIN");
      await blocker.query(lockSql, lockParams);
      // allSettled attaches rejection handlers immediately, including failing-before-lock regressions.
      pending = Promise.allSettled(run());
      let blocked = false;
      for (let i = 0; i < 80; i++) {
        const result = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [applicationName]);
        if (result.rows[0].n >= expectedWaiters) { blocked = true; break; }
        await delay(25);
      }
      assert.ok(blocked, "Concurrent service transactions must wait on the shared resource lock");
      await mutate?.(blocker);
      await blocker.query("COMMIT");
      return await pending;
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await pending;
    }
  }
  const assign = (dep, vehicle) => assignStaff(db, actors.HRMgr, dep.departure_id,
    { staff_id: staff.staff_id, vehicle_id: vehicle.vehicle_id, role_in_trip: "Assistant" });
  const results = await whileBlocked("SELECT staff_id FROM staff WHERE staff_id = $1 FOR UPDATE", [staff.staff_id],
    () => [assign(left, leftVehicle), assign(right, rightVehicle)], undefined, 2);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "RESOURCE_CONFLICT");
  assert.equal(await db.departureStaff.count({ where: { staff_id: staff.staff_id } }), 1);
  console.log("PASS: two real concurrent staff assignments serialize; exactly one commits.");

  await db.departureStaff.deleteMany({ where: { staff_id: staff.staff_id } });
  const inactivated = await whileBlocked("SELECT staff_id FROM staff WHERE staff_id = $1 FOR UPDATE", [staff.staff_id],
    () => [assign(left, leftVehicle), assign(right, rightVehicle)],
    connection => connection.query("UPDATE staff SET status = 'Inactive' WHERE staff_id = $1", [staff.staff_id]), 2);
  assert.ok(inactivated.every(r => r.status === "rejected" && r.reason.code === "ACCESS_CONFLICT"));
  assert.equal(await db.departureStaff.count({ where: { staff_id: staff.staff_id } }), 0);
  console.log("PASS: eligibility is re-read after a concurrent personnel update; neither invalid assignment commits.");

  const sharedVehicle = await makeVehicle("TEST-SHARED");
  const vehicles = await whileBlocked("SELECT vehicle_id FROM vehicles WHERE vehicle_id = $1 FOR UPDATE", [sharedVehicle.vehicle_id],
    () => [left, right].map(dep => assignVehicle(db, actors.HRMgr, dep.departure_id, { vehicle_id: sharedVehicle.vehicle_id })), undefined, 2);
  assert.equal(vehicles.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(vehicles.find(r => r.status === "rejected").reason.code, "VEHICLE_UNAVAILABLE");
  assert.equal(await db.departureVehicle.count({ where: { vehicle_id: sharedVehicle.vehicle_id } }), 1);
  console.log("PASS: two real concurrent vehicle assignments cannot double-book a vehicle.");

  const opening = await whileBlocked("SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE", [actors.RouteMgr.user_id],
    () => [updateDeparture(db, actors.Admin, left.departure_id, { status: "Open" }, new Date("2034-01-01"))],
    connection => connection.query("UPDATE users SET status = 'Locked' WHERE user_id = $1", [actors.RouteMgr.user_id]), 1);
  assert.equal(opening[0].status, "rejected");
  assert.equal(opening[0].reason.code, "RESOURCE_CONFLICT");
  assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: left.departure_id } })).status, "Draft");
  assert.equal(await db.auditLog.count({ where: { action: "DepartureStatusChanged" } }), 0);
  console.log("PASS: concurrent owner lock blocks opening and rolls back status/audit.");
} finally {
  await db?.$disconnect();
  await pool?.end();
  if (started) docker("rm", "--force", name);
}
