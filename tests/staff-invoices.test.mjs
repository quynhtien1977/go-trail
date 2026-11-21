import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import {
  listStaffInvoices,
  readStaffInvoice,
  searchStaffTickets,
} from "../src/server/services/staff-invoices.ts";

let database, db, routeMgr1, routeMgr2, adminUser, customerUser, leaderUser;
let trip, departure1, departure2, invoice1, invoice2, ticket1, ticket2;

before(async () => {
  database = await createTestDatabase();
  db = database.client;
});

beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff, invoices, invoice_details, payments, audit_logs RESTART IDENTITY CASCADE");

  const r1 = await db.user.create({
    data: { email: "rm1@staff.test", password_hash: "hash", full_name: "Route Manager 1", phone: "0901111111", role: "RouteMgr" },
  });
  routeMgr1 = { user_id: r1.user_id, role: "RouteMgr", auth_version: 0 };

  const r2 = await db.user.create({
    data: { email: "rm2@staff.test", password_hash: "hash", full_name: "Route Manager 2", phone: "0902222222", role: "RouteMgr" },
  });
  routeMgr2 = { user_id: r2.user_id, role: "RouteMgr", auth_version: 0 };

  const admin = await db.user.create({
    data: { email: "admin@staff.test", password_hash: "hash", full_name: "Admin User", phone: "0903333333", role: "Admin" },
  });
  adminUser = { user_id: admin.user_id, role: "Admin", auth_version: 0 };

  const customer = await db.user.create({
    data: { email: "customer@staff.test", password_hash: "hash", full_name: "Nguyễn Văn Khách", phone: "0904444444", role: "Customer" },
  });
  customerUser = { user_id: customer.user_id, role: "Customer", auth_version: 0 };

  const leader = await db.user.create({
    data: { email: "leader@staff.test", password_hash: "hash", full_name: "Leader User", phone: "0905555555", role: "Leader" },
  });
  leaderUser = { user_id: leader.user_id, role: "Leader", auth_version: 0 };

  trip = await db.trip.create({
    data: { name: "Tour Tà Năng", city: "Lâm Đồng", location_name: "Tà Năng", length_km: "30.0", base_price: "1500000", description: "Trekking", schedule_content: "Lịch trình" },
  });

  const vehicle = await db.vehicle.create({
    data: {
      plate_number: "51B-123.99",
      vehicle_type: "Xe 29 chỗ",
      seat_count: 2,
      seats: {
        create: [
          { seat_name: "A01", floor_level: 1, x_position: 0, y_position: 0 },
          { seat_name: "A02", floor_level: 1, x_position: 1, y_position: 0 },
        ],
      },
    },
    include: { seats: true },
  });

  departure1 = await db.departure.create({
    data: {
      trip_id: trip.trip_id,
      departure_date: new Date("2026-11-25T08:00:00Z"),
      booking_deadline: new Date("2026-11-24T18:00:00Z"),
      min_passengers: 1,
      status: "Open",
      invoice_owner_user_id: r1.user_id,
    },
  });

  departure2 = await db.departure.create({
    data: {
      trip_id: trip.trip_id,
      departure_date: new Date("2026-11-26T08:00:00Z"),
      booking_deadline: new Date("2026-11-25T18:00:00Z"),
      min_passengers: 1,
      status: "Open",
      invoice_owner_user_id: r2.user_id,
    },
  });

  const dep1Vehicle = await db.departureVehicle.create({
    data: { departure_id: departure1.departure_id, vehicle_id: vehicle.vehicle_id },
  });
  const dep2Vehicle = await db.departureVehicle.create({
    data: { departure_id: departure2.departure_id, vehicle_id: vehicle.vehicle_id },
  });

  const dep1Pickup = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Ngã tư Hàng Xanh", address: "Bình Thạnh" } });
  const dep1PickupPoint = await db.departurePickup.create({
    data: { departure_id: departure1.departure_id, pickup_id: dep1Pickup.pickup_id, pickup_time: new Date("2026-11-25T07:00:00Z") },
  });

  const dep2PickupPoint = await db.departurePickup.create({
    data: { departure_id: departure2.departure_id, pickup_id: dep1Pickup.pickup_id, pickup_time: new Date("2026-11-26T07:00:00Z") },
  });

  invoice1 = await db.invoice.create({
    data: {
      customer_id: customer.user_id,
      departure_id: departure1.departure_id,
      payment_code: "TB1001",
      total_amount: "1500000",
      status: "Paid",
      expires_at: new Date("2026-11-25T00:00:00Z"),
      responsible_user_id: r1.user_id,
      responsible_name_snapshot: "Route Manager 1",
      responsible_role_snapshot: "RouteMgr",
    },
  });

  invoice2 = await db.invoice.create({
    data: {
      customer_id: customer.user_id,
      departure_id: departure2.departure_id,
      payment_code: "TB1002",
      total_amount: "1500000",
      status: "Pending",
      expires_at: new Date("2026-11-26T00:00:00Z"),
      responsible_user_id: r2.user_id,
      responsible_name_snapshot: "Route Manager 2",
      responsible_role_snapshot: "RouteMgr",
    },
  });

  const seat1 = await db.departureSeat.create({
    data: { dep_vehicle_id: dep1Vehicle.dep_vehicle_id, seat_id: vehicle.seats[0].seat_id, status: "Sold", invoice_id: invoice1.invoice_id },
  });
  const seat2 = await db.departureSeat.create({
    data: { dep_vehicle_id: dep2Vehicle.dep_vehicle_id, seat_id: vehicle.seats[1].seat_id, status: "Sold", invoice_id: invoice2.invoice_id },
  });

  ticket1 = await db.invoiceDetail.create({
    data: {
      invoice_id: invoice1.invoice_id,
      dep_seat_id: seat1.dep_seat_id,
      dep_pickup_id: dep1PickupPoint.dep_pickup_id,
      passenger_name: "Khách Một",
      passenger_phone: "0908888888",
      emergency_contact: "0909999999",
      health_declaration: true,
      unit_price: "1500000",
      status: "Valid",
      ticket_code: "TK-001",
      check_in_status: "Pending",
    },
  });

  await db.payment.create({
    data: {
      invoice_id: invoice1.invoice_id,
      amount: "1500000",
      transaction_id: "TX-1001",
      reference_code: "REF-1001",
      status: "Success",
      raw_payload: "{}",
    },
  });

  ticket2 = await db.invoiceDetail.create({
    data: {
      invoice_id: invoice2.invoice_id,
      dep_seat_id: seat2.dep_seat_id,
      dep_pickup_id: dep2PickupPoint.dep_pickup_id,
      passenger_name: "Khách Hai",
      passenger_phone: "0907777777",
      emergency_contact: "0909999999",
      health_declaration: true,
      unit_price: "1500000",
      status: "Pending",
      ticket_code: "TK-002",
      check_in_status: "Pending",
    },
  });
});

after(async () => {
  await database?.close();
});

test("RouteMgr sees only invoices where they are responsible_user_id", async () => {
  const result1 = await listStaffInvoices(db, routeMgr1);
  assert.equal(result1.items.length, 1);
  assert.equal(result1.items[0].invoice_id, invoice1.invoice_id);
  assert.equal(result1.items[0].payment_code, "TB1001");
  assert.equal(result1.items[0].responsible_name_snapshot, "Route Manager 1");
  assert.equal(result1.items[0].total_amount, "1500000");

  const result2 = await listStaffInvoices(db, routeMgr2);
  assert.equal(result2.items.length, 1);
  assert.equal(result2.items[0].invoice_id, invoice2.invoice_id);
  assert.equal(result2.items[0].payment_code, "TB1002");
});

test("Admin can see all invoices and filter by responsible_user_id or status", async () => {
  const allInvoices = await listStaffInvoices(db, adminUser);
  assert.equal(allInvoices.items.length, 2);

  const filteredByRm2 = await listStaffInvoices(db, adminUser, { responsible_user_id: routeMgr2.user_id });
  assert.equal(filteredByRm2.items.length, 1);
  assert.equal(filteredByRm2.items[0].invoice_id, invoice2.invoice_id);

  const paidOnly = await listStaffInvoices(db, adminUser, { status: "Paid" });
  assert.equal(paidOnly.items.length, 1);
  assert.equal(paidOnly.items[0].status, "Paid");
});

test("RouteMgr can read details of an invoice they are responsible for, but gets 404 for another manager's invoice", async () => {
  const ownDetail = await readStaffInvoice(db, routeMgr1, invoice1.invoice_id);
  assert.equal(ownDetail.invoice_id, invoice1.invoice_id);
  assert.equal(ownDetail.customer.full_name, "Nguyễn Văn Khách");
  assert.equal(ownDetail.tickets.length, 1);
  assert.equal(ownDetail.tickets[0].seat_name, "A01");
  assert.equal(ownDetail.tickets[0].ticket_code, "TK-001");
  assert.equal(ownDetail.payments.length, 1);
  assert.equal(ownDetail.payments[0].transaction_id, "TX-1001");

  await assert.rejects(
    readStaffInvoice(db, routeMgr1, invoice2.invoice_id),
    { code: "NOT_FOUND" }
  );

  const adminRead = await readStaffInvoice(db, adminUser, invoice2.invoice_id);
  assert.equal(adminRead.invoice_id, invoice2.invoice_id);
});

test("searchStaffTickets allows RouteMgr to find tickets in their scope and Admin to find all", async () => {
  const rm1Search = await searchStaffTickets(db, routeMgr1, { ticket_code: "TK" });
  assert.equal(rm1Search.items.length, 1);
  assert.equal(rm1Search.items[0].ticket_code, "TK-001");

  const adminSearch = await searchStaffTickets(db, adminUser, { ticket_code: "TK" });
  assert.equal(adminSearch.items.length, 2);

  const phoneSearch = await searchStaffTickets(db, adminUser, { passenger_phone: "0908888888" });
  assert.equal(phoneSearch.items.length, 1);
  assert.equal(phoneSearch.items[0].passenger_name, "Khách Một");
});

test("RBAC: Customer, Leader, HRMgr cannot access staff invoice or ticket endpoints", async () => {
  for (const actor of [customerUser, leaderUser]) {
    await assert.rejects(listStaffInvoices(db, actor), { code: "FORBIDDEN" });
    await assert.rejects(readStaffInvoice(db, actor, invoice1.invoice_id), { code: "FORBIDDEN" });
    await assert.rejects(searchStaffTickets(db, actor), { code: "FORBIDDEN" });
  }
});
