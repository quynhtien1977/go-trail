import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { endLeaderDeparture } from "../src/server/services/departures.ts";

let database, db, leaderUser, otherLeaderUser, adminUser, routeMgrUser, customerUser;
let trip, departure, staffLeader, assignedVehicle;

before(async () => {
  database = await createTestDatabase();
  db = database.client;
});

beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff, audit_logs RESTART IDENTITY CASCADE");

  const leader = await db.user.create({
    data: { email: "leader@example.test", password_hash: "hash", full_name: "Leader One", phone: "0901111111", role: "Leader" },
  });
  leaderUser = { user_id: leader.user_id, role: "Leader", auth_version: 0 };

  const otherLeader = await db.user.create({
    data: { email: "other_leader@example.test", password_hash: "hash", full_name: "Leader Two", phone: "0902222222", role: "Leader" },
  });
  otherLeaderUser = { user_id: otherLeader.user_id, role: "Leader", auth_version: 0 };

  const admin = await db.user.create({
    data: { email: "admin@example.test", password_hash: "hash", full_name: "Admin", phone: "0903333333", role: "Admin" },
  });
  adminUser = { user_id: admin.user_id, role: "Admin", auth_version: 0 };

  const routeMgr = await db.user.create({
    data: { email: "routemgr@example.test", password_hash: "hash", full_name: "Route Manager", phone: "0904444444", role: "RouteMgr" },
  });
  routeMgrUser = { user_id: routeMgr.user_id, role: "RouteMgr", auth_version: 0 };

  const customer = await db.user.create({
    data: { email: "customer@example.test", password_hash: "hash", full_name: "Customer", phone: "0905555555", role: "Customer" },
  });
  customerUser = { user_id: customer.user_id, role: "Customer", auth_version: 0 };

  staffLeader = await db.staff.create({
    data: { user_id: leader.user_id, full_name: "Leader One", phone: "0901111111", staff_type: "Leader", status: "Active" },
  });

  trip = await db.trip.create({
    data: { name: "Tour Đèo Hải Vân", city: "Đà Nẵng", location_name: "Hải Vân", length_km: "12.0", base_price: "600000", description: "Mô tả", schedule_content: "Lịch trình" },
  });

  const vehicle = await db.vehicle.create({
    data: { plate_number: "43B-123.45", vehicle_type: "Xe 29 chỗ", seat_count: 1, seats: { create: [{ seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 }] } },
    include: { seats: true },
  });

  departure = await db.departure.create({
    data: {
      trip_id: trip.trip_id,
      departure_date: new Date("2026-11-20T08:00:00Z"),
      booking_deadline: new Date("2026-11-19T18:00:00Z"),
      min_passengers: 1,
      status: "Running",
      invoice_owner_user_id: routeMgr.user_id,
    },
  });

  assignedVehicle = await db.departureVehicle.create({
    data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id },
  });

  await db.departureStaff.create({
    data: {
      departure_id: departure.departure_id,
      dep_vehicle_id: assignedVehicle.dep_vehicle_id,
      staff_id: staffLeader.staff_id,
      role_in_trip: "Leader",
    },
  });
});

after(async () => {
  await database?.close();
});

test("Assigned Leader can transition a Running departure to Ended", async () => {
  const result = await endLeaderDeparture(db, leaderUser, departure.departure_id);
  assert.equal(result.status, "Ended");
  assert.equal(result.departure_id, departure.departure_id);

  const updatedInDb = await db.departure.findUnique({ where: { departure_id: departure.departure_id } });
  assert.equal(updatedInDb?.status, "Ended");

  const audit = await db.auditLog.findFirst({ where: { action: "DepartureStatusChanged" } });
  assert.ok(audit);
  assert.equal(audit?.user_id, leaderUser.user_id);
  assert.deepEqual(JSON.parse(audit?.description ?? "{}"), {
    action: "DepartureStatusChanged",
    record_id: departure.departure_id,
    from: "Running",
    to: "Ended",
  });
});

test("Ending is idempotent: retry on already Ended departure succeeds safely without duplicate audit", async () => {
  await endLeaderDeparture(db, leaderUser, departure.departure_id);
  const auditCountBefore = await db.auditLog.count({ where: { action: "DepartureStatusChanged" } });
  assert.equal(auditCountBefore, 1);

  const retryResult = await endLeaderDeparture(db, leaderUser, departure.departure_id);
  assert.equal(retryResult.status, "Ended");

  const auditCountAfter = await db.auditLog.count({ where: { action: "DepartureStatusChanged" } });
  assert.equal(auditCountAfter, 1);
});

test("Non-Running departures reject transition to Ended with 409 RESOURCE_CONFLICT", async () => {
  for (const status of ["Draft", "Open", "Closed", "Confirmed"]) {
    await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status } });
    await assert.rejects(
      endLeaderDeparture(db, leaderUser, departure.departure_id),
      { code: "RESOURCE_CONFLICT" },
      `Should reject from ${status}`
    );
  }
});

test("Unassigned Leader is rejected with 403 FORBIDDEN", async () => {
  await assert.rejects(
    endLeaderDeparture(db, otherLeaderUser, departure.departure_id),
    { code: "FORBIDDEN" }
  );
});

test("Assigned Leader with Inactive staff record is rejected with 403 FORBIDDEN", async () => {
  await db.staff.update({ where: { staff_id: staffLeader.staff_id }, data: { status: "Inactive" } });
  await assert.rejects(
    endLeaderDeparture(db, leaderUser, departure.departure_id),
    { code: "FORBIDDEN" }
  );
});

test("Non-Leader roles without Admin privileges are rejected with 403 FORBIDDEN", async () => {
  await assert.rejects(endLeaderDeparture(db, customerUser, departure.departure_id), { code: "FORBIDDEN" });
  await assert.rejects(endLeaderDeparture(db, routeMgrUser, departure.departure_id), { code: "FORBIDDEN" });
});

test("Admin can end a Running departure even without being in departure staff", async () => {
  const result = await endLeaderDeparture(db, adminUser, departure.departure_id);
  assert.equal(result.status, "Ended");
});

test("Paid invoices, Valid tickets, and Sold seats remain intact when departure is Ended", async () => {
  const vehicle = await db.vehicle.findFirstOrThrow({ where: { plate_number: "43B-123.45" }, include: { seats: true } });
  const invoice = await db.invoice.create({
    data: { customer_id: customerUser.user_id, departure_id: departure.departure_id, payment_code: "PAID-1", total_amount: "600000", status: "Paid", expires_at: new Date("2026-11-20T00:00:00Z") },
  });
  const depSeat = await db.departureSeat.create({
    data: { dep_vehicle_id: assignedVehicle.dep_vehicle_id, seat_id: vehicle.seats[0].seat_id, status: "Sold", invoice_id: invoice.invoice_id },
  });
  const pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "P1", address: "A1" } });
  const depPickup = await db.departurePickup.create({ data: { departure_id: departure.departure_id, pickup_id: pickup.pickup_id, pickup_time: new Date("2026-11-20T07:00:00Z") } });
  const ticket = await db.invoiceDetail.create({
    data: {
      invoice_id: invoice.invoice_id,
      dep_seat_id: depSeat.dep_seat_id,
      dep_pickup_id: depPickup.dep_pickup_id,
      passenger_name: "Hành khách 1",
      passenger_phone: "0901234567",
      emergency_contact: "0907654321",
      health_declaration: true,
      unit_price: "600000",
      status: "Valid",
      ticket_code: "TICKET-123",
    },
  });

  await endLeaderDeparture(db, leaderUser, departure.departure_id);

  const checkInvoice = await db.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } });
  assert.equal(checkInvoice.status, "Paid");

  const checkSeat = await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: depSeat.dep_seat_id } });
  assert.equal(checkSeat.status, "Sold");

  const checkTicket = await db.invoiceDetail.findUniqueOrThrow({ where: { detail_id: ticket.detail_id } });
  assert.equal(checkTicket.status, "Valid");
});
