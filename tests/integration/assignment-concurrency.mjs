import { verifySupplyRace } from "./supply-race.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { assignStaff, assignVehicle } from "../../src/server/services/assignments.ts";
import { updateAccountAccess } from "../../src/server/services/accounts.ts";
import { updateDeparture } from "../../src/server/services/departures.ts";
import { updateSetting } from "../../src/server/services/admin.ts";

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

  const assigned = await db.departureStaff.findFirstOrThrow({ where: { staff_id: staff.staff_id } });
  await verifySupplyRace(db, actors.HRMgr, assigned.departure_id, staff.staff_id, whileBlocked);
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

  // SCRUM-49: a ratio change and a Closed -> Confirmed transition must serialize, without freezing independent departures.
  await db.systemSetting.upsert({ where: { setting_key: "LEADER_RATIO" },
    create: { setting_key: "LEADER_RATIO", setting_value: "15", description: "Fixture" }, update: { setting_value: "15" } });
  const ratioCustomer = await db.user.create({ data: { email: "ratio-buyer@concurrency.example.test", password_hash: "unused",
    full_name: "Buyer", phone: "0901234567", role: "Customer" } });
  const ratioLeader = await db.user.create({ data: { email: "ratio-leader@concurrency.example.test", password_hash: "unused",
    full_name: "Leader", phone: "0901234567", role: "Leader" } });
  const ratioCrew = [
    await db.staff.create({ data: { full_name: "Driver", phone: "0901234567", staff_type: "Driver", license_number: "RATIO-D",
      license_class: "D", license_expiry: new Date("2036-01-01") } }),
    await db.staff.create({ data: { full_name: "Assistant", phone: "0901234567", staff_type: "Assistant" } }),
    await db.staff.create({ data: { full_name: "Leader", phone: "0901234567", staff_type: "Leader", user_id: ratioLeader.user_id } }),
  ];
  async function ratioFixture(suffix) {
    const dep = await makeDeparture();
    const vehicle = await db.vehicle.create({ data: { plate_number: `RATIO-${suffix}`, vehicle_type: "Fixture", seat_count: 2,
      seats: { create: [0, 1].map(i => ({ seat_name: `A0${i + 1}`, floor_level: 1, x_position: i, y_position: 0 })) } } });
    await assignVehicle(db, actors.HRMgr, dep.departure_id, { vehicle_id: vehicle.vehicle_id });
    // Independent fixture departure days avoid busy-staff checks from the previous fixture.
    for (const person of ratioCrew) await assignStaff(db, actors.HRMgr, dep.departure_id,
      { vehicle_id: vehicle.vehicle_id, staff_id: person.staff_id, role_in_trip: person.staff_type });
    const pickupRow = await db.departurePickup.findFirstOrThrow({ where: { departure_id: dep.departure_id } });
    const invoice = await db.invoice.create({ data: { customer_id: ratioCustomer.user_id, departure_id: dep.departure_id,
      payment_code: `RATIO-${suffix}`, total_amount: "1000000", status: "Paid", expires_at: new Date("2034-01-01") } });
    const seats = await db.departureSeat.findMany({ where: { vehicle: { departure_id: dep.departure_id } } });
    for (const seat of seats) {
      await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id }, data: { status: "Sold", invoice_id: invoice.invoice_id } });
      await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: seat.dep_seat_id, dep_pickup_id: pickupRow.dep_pickup_id,
        passenger_name: "Passenger", passenger_phone: "0901234567", emergency_contact: "Contact", health_declaration: true, unit_price: "500000", status: "Valid" } });
    }
    await db.departure.update({ where: { departure_id: dep.departure_id }, data: { status: "Closed" } });
    return dep;
  }
  async function waitForOneLock() {
    for (let i = 0; i < 80; i++) {
      const result = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [applicationName]);
      if (result.rows[0].n >= 1) return;
      await delay(25);
    }
    throw new Error("Expected first transaction to wait before starting its competitor");
  }
  let ratioDep = await ratioFixture("CONFIRM-FIRST");
  const confirmFirst = await whileBlocked("SELECT departure_id FROM departures WHERE departure_id=$1 FOR UPDATE", [ratioDep.departure_id],
    () => [updateDeparture(db, actors.Admin, ratioDep.departure_id, { status: "Confirmed" }, new Date("2034-01-01")),
      (async () => { await waitForOneLock(); return updateSetting(db, actors.Admin, "LEADER_RATIO", { setting_value: "1" }); })()], undefined, 2);
  assert.equal(confirmFirst[0].status, "fulfilled");
  assert.equal(confirmFirst[1].status, "rejected"); assert.equal(confirmFirst[1].reason.code, "RESOURCE_CONFLICT");
  assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "LEADER_RATIO" } })).setting_value, "15");
  assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: ratioDep.departure_id } })).status, "Confirmed");
  // End the first fixture to release its crew for the second scenario; isolated test database only.
  await db.departure.update({ where: { departure_id: ratioDep.departure_id }, data: { status: "Ended" } });
  ratioDep = await ratioFixture("RATIO-FIRST");
  const ratioFirst = await whileBlocked("SELECT setting_key FROM system_settings WHERE setting_key='LEADER_RATIO' FOR UPDATE", [],
    () => [updateSetting(db, actors.Admin, "LEADER_RATIO", { setting_value: "1" }),
      (async () => { await waitForOneLock(); return updateDeparture(db, actors.Admin, ratioDep.departure_id,
        { status: "Confirmed" }, new Date("2034-01-01")); })()], undefined, 2);
  assert.equal(ratioFirst[0].status, "fulfilled");
  assert.equal(ratioFirst[1].status, "rejected"); assert.equal(ratioFirst[1].reason.code, "RESOURCE_CONFLICT");
  assert.equal((await db.departure.findUniqueOrThrow({ where: { departure_id: ratioDep.departure_id } })).status, "Closed");
  assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "LEADER_RATIO" } })).setting_value, "1");
  console.log("PASS: concurrent ratio changes and confirmation serialize in both lock orders, preserving the Leader minimum.");

  // A request that passed authorization before waiting must not mutate settings after that account is locked.
  await db.systemSetting.upsert({ where: { setting_key: "MAX_SEATS_PER_INVOICE" },
    create: { setting_key: "MAX_SEATS_PER_INVOICE", setting_value: "10", description: "Fixture" }, update: { setting_value: "10" } });
  for (const [key, initial, next, lockSql, revoke] of [
    ["LEADER_RATIO", "1", "2", "SELECT pg_advisory_xact_lock(717049)", { status: "Locked" }],
    ["MAX_SEATS_PER_INVOICE", "10", "9", "SELECT setting_key FROM system_settings WHERE setting_key='MAX_SEATS_PER_INVOICE' FOR UPDATE", { role: "Customer" }],
  ]) {
    const victim = await db.user.create({ data: { role: "Admin", email: `revoked-${key}@concurrency.example.test`,
      password_hash: "unused", full_name: "Revoked admin", phone: "0901234567" } });
    const identity = { user_id: victim.user_id, role: "Admin", auth_version: victim.auth_version };
    const revoked = await whileBlocked(lockSql, [], () => [updateSetting(db, identity, key, { setting_value: next })],
      () => updateAccountAccess(db, actors.Admin, victim.user_id, revoke), 1);
    assert.equal(revoked[0].status, "rejected", `${key}: the revoked Admin must not change a setting`);
    assert.equal(revoked[0].reason.code, "UNAUTHENTICATED");
    assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: key } })).setting_value, initial);
    assert.equal(await db.auditLog.count({ where: { user_id: victim.user_id, action: "SettingChanged" } }), 0);
  }
  console.log("PASS: locked or demoted Admin sessions cannot change settings after waiting on the ratio or setting lock.");

  const concurrentAdmin = await db.user.create({ data: { role: "Admin", email: "late-revocation@concurrency.example.test",
    password_hash: "unused", full_name: "Concurrent admin", phone: "0901234567" } });
  const concurrentIdentity = { user_id: concurrentAdmin.user_id, role: "Admin", auth_version: concurrentAdmin.auth_version };
  const settingFirst = await whileBlocked("LOCK TABLE audit_logs IN ACCESS EXCLUSIVE MODE", [], () => [
    updateSetting(db, concurrentIdentity, "MAX_SEATS_PER_INVOICE", { setting_value: "9" }),
    (async () => { await waitForOneLock(); return updateAccountAccess(db, actors.Admin, concurrentAdmin.user_id, { status: "Locked" }); })(),
  ], undefined, 2);
  assert.ok(settingFirst.every(result => result.status === "fulfilled"), "setting change commits before the queued account lock");
  assert.equal((await db.systemSetting.findUniqueOrThrow({ where: { setting_key: "MAX_SEATS_PER_INVOICE" } })).setting_value, "9");
  assert.equal((await db.user.findUniqueOrThrow({ where: { user_id: concurrentAdmin.user_id } })).status, "Locked");
  assert.equal(await db.auditLog.count({ where: { user_id: concurrentAdmin.user_id, action: "SettingChanged" } }), 1);
  console.log("PASS: locking an Admin waits for an already authorized setting change to commit, then revokes the account.");

  const secondAdmin = await db.user.create({ data: { role: "Admin", email: "second@admin.example.test",
    password_hash: "unused", full_name: "Second admin", phone: "0901234567" } });
  const demotions = await whileBlocked("SELECT pg_advisory_xact_lock(717002)", [], () => [
    updateAccountAccess(db, actors.Admin, secondAdmin.user_id, { role: "Customer" }),
    updateAccountAccess(db, secondAdmin, actors.Admin.user_id, { role: "Customer" }),
  ], undefined, 2);
  assert.equal(demotions.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.user.count({ where: { role: "Admin", status: "Active" } }), 1);
  console.log("PASS: simultaneous Admin demotions preserve one active Admin.");
} finally {
  await db?.$disconnect();
  await pool?.end();
  if (started) docker("rm", "--force", name);
}
