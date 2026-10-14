import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import { readCustomerInvoice } from "../src/server/services/account-data.ts";
import { listPublicTrips, readPublicTrip, listPublicPickups, listPublicDepartures,
  listManagedTrips, readManagedTrip, listManagedPickups, createTrip, updateTrip,
  createPickup, updatePickup } from "../src/server/services/catalog.ts";

let database, db, manager, admin, others;
const input = { name: "Núi Bà Đen", city: "Tây Ninh", location_name: "Núi Bà Đen", length_km: "8.50",
  base_price: "500000", description: "Tuyến tham khảo.", schedule_content: "Đón khách → trekking → trở về." };
before(async () => { database = await createTestDatabase(); db = database.client; });
beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles RESTART IDENTITY CASCADE");
  const actors = [];
  for (const role of ["RouteMgr", "Admin", "Customer", "Leader", "HRMgr", "Accountant"]) {
    const user = await db.user.create({ data: { email: `${role}@catalog.example.test`, password_hash: "unused-test-hash",
      full_name: role, phone: "0901234567", role } });
    actors.push({ user_id: user.user_id, role, auth_version: 0 });
  }
  [manager, admin, ...others] = actors;
});
after(async () => { await database?.close(); });

test("RouteMgr/Admin create and read trips with decimal DTOs, immutable provenance and safe price audit", async () => {
  const created = await createTrip(db, manager, { ...input, peak_height_m: null, difficulty_level: null });
  assert.equal(created.base_price, "500000");
  assert.equal(created.length_km, "8.50");
  assert.equal(created.peak_height_m, null);
  assert.equal(created.district, null);
  assert.equal(created.source_url, null);
  assert.deepEqual(await readPublicTrip(db, created.trip_id), created);
  assert.deepEqual(await readManagedTrip(db, admin, created.trip_id), created);
  const log = await db.auditLog.findFirst();
  assert.equal(log.action, "TripCreated");
  assert.equal(log.table_name, "trips");
  assert.deepEqual(JSON.parse(log.description), { action: "TripCreated", record_id: created.trip_id, base_price: "500000" });
  assert.ok(!JSON.stringify(created).includes("password"));
});

test("every unauthorized role, spoofed role, Locked user and revoked version is rejected inside catalog service", async () => {
  for (const actor of others) {
    await assert.rejects(createTrip(db, { ...actor, role: "Admin" }, input), { code: "FORBIDDEN", status: 403 });
    await assert.rejects(listManagedTrips(db, actor), { code: "FORBIDDEN" });
  }
  await assert.rejects(createTrip(db, null, input), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: manager.user_id }, data: { status: "Locked" } });
  await assert.rejects(createTrip(db, manager, input), { code: "UNAUTHENTICATED" });
  await db.user.update({ where: { user_id: admin.user_id }, data: { auth_version: 1 } });
  await assert.rejects(createTrip(db, admin, input), { code: "UNAUTHENTICATED" });
  assert.equal(await db.trip.count(), 0);
  assert.equal(await db.auditLog.count(), 0);
});

test("public and managed lists filter/paginate deterministically without leaking relations", async () => {
  for (const name of ["Bà Đen A", "Bà Đen B", "Bà Đen C"]) await createTrip(db, manager, { ...input, name });
  await createTrip(db, admin, { ...input, name: "Núi khác", city: "Đồng Nai" });
  const first = await listPublicTrips(db, { q: "bà đen", city: "tây ninh", pageSize: "2" });
  assert.deepEqual(first.pagination, { page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
  assert.deepEqual(first.items.map((row) => row.name), ["Bà Đen A", "Bà Đen B"]);
  const second = await listManagedTrips(db, manager, { q: "bà đen", city: "tây ninh", page: "2", pageSize: "2" });
  assert.deepEqual(second.items.map((row) => row.name), ["Bà Đen C"]);
  assert.equal("departures" in first.items[0], false);
  assert.equal((await listPublicTrips(db, { q: "%" })).pagination.totalItems, 0);
});

test("city filter matches literal city names rather than interpreting LIKE wildcards", async () => {
  await createTrip(db, manager, { ...input, city: "City_Name" });
  assert.equal((await listPublicTrips(db, { city: "city_name" })).pagination.totalItems, 1);
  for (const city of ["%", "City%Name", "City\\_Name"]) {
    assert.equal((await listPublicTrips(db, { city })).pagination.totalItems, 0);
  }
});

test("PATCH preserves omitted nullable fields and import provenance; only changed price receives a price event", async () => {
  const saved = await db.trip.create({ data: { ...input, district: "Khu vực núi", difficulty_level: "Chưa xác minh",
    peak_height_m: 986, source_url: "https://gotrail.vn/bus/trail-bus-ba-den/", source_fetched_at: new Date("2026-10-11") } });
  const updated = await updateTrip(db, manager, saved.trip_id, { name: "Tên mới", base_price: "600000" });
  assert.equal(updated.district, "Khu vực núi");
  assert.equal(updated.peak_height_m, 986);
  assert.equal(updated.source_url, saved.source_url);
  assert.equal(updated.base_price, "600000");
  const log = await db.auditLog.findFirst();
  assert.deepEqual(JSON.parse(log.description), { action: "TripPriceChanged", record_id: saved.trip_id, from: "500000", to: "600000" });
  await updateTrip(db, admin, saved.trip_id, { base_price: "600000", district: null });
  assert.equal(await db.auditLog.count(), 1);
  assert.equal((await readPublicTrip(db, saved.trip_id)).district, null);
  await assert.rejects(updateTrip(db, manager, saved.trip_id, { source_url: null }), { code: "INVALID_INPUT" });
});

test("catalog mutations validate all IDs and inputs even when called outside a handler", async () => {
  for (const id of [0, -1, 1.5, 2147483648]) {
    await assert.rejects(readPublicTrip(db, id), { code: "INVALID_INPUT" });
    await assert.rejects(updateTrip(db, manager, id, { name: "Tên" }), { code: "INVALID_INPUT" });
  }
  await assert.rejects(updateTrip(db, manager, 99, {}), { code: "INVALID_INPUT" });
  await assert.rejects(createTrip(db, manager, { ...input, base_price: "-1" }), { code: "INVALID_INPUT" });
  await assert.rejects(readPublicTrip(db, 99), { code: "NOT_FOUND" });
  await assert.rejects(createPickup(db, manager, 99, { name: "Điểm", address: "Địa chỉ" }), { code: "NOT_FOUND" });
});

test("pickup edits are scoped to their trip, retire without losing schedule FK and can be restored", async () => {
  const trip = await createTrip(db, manager, input);
  const other = await createTrip(db, manager, { ...input, name: "Tuyến khác" });
  const pickup = await createPickup(db, manager, trip.trip_id, { name: "Điểm đón", address: "Địa chỉ cũ" });
  const departure = await db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2030-01-01"),
    booking_deadline: new Date("2029-12-31"), min_passengers: 6 } });
  const schedule = await db.departurePickup.create({ data: { departure_id: departure.departure_id, pickup_id: pickup.pickup_id,
    pickup_time: new Date("2030-01-01") } });
  await assert.rejects(updatePickup(db, manager, other.trip_id, pickup.pickup_id, { address: "Sai tuyến" }), { code: "NOT_FOUND" });
  await assert.rejects(updatePickup(db, manager, trip.trip_id, pickup.pickup_id, { trip_id: other.trip_id }), { code: "INVALID_INPUT" });
  await assert.rejects(updatePickup(db, others[2], trip.trip_id, pickup.pickup_id, { is_active: false }), { code: "FORBIDDEN" });
  const retired = await updatePickup(db, manager, trip.trip_id, pickup.pickup_id, { is_active: false });
  assert.equal(retired.is_active, false);
  assert.equal((await listPublicPickups(db, trip.trip_id)).pagination.totalItems, 0);
  assert.equal((await listManagedPickups(db, manager, trip.trip_id)).items[0].pickup_id, pickup.pickup_id);
  assert.equal((await db.departurePickup.findUnique({ where: { dep_pickup_id: schedule.dep_pickup_id } })).pickup_id, pickup.pickup_id);
  await updatePickup(db, admin, trip.trip_id, pickup.pickup_id, { is_active: true, address: "Địa chỉ mới" });
  assert.equal((await listPublicPickups(db, trip.trip_id)).items[0].address, "Địa chỉ mới");
});

test("public departures show only real Open/future/unexpired rows with effective Decimal price and UTC dates", async () => {
  const trip = await createTrip(db, manager, input);
  const now = new Date("2029-12-01T00:00:00Z");
  const common = { trip_id: trip.trip_id, departure_date: new Date("2030-01-01T22:00:00Z"), booking_deadline: new Date("2029-12-31"), min_passengers: 6 };
  const valid = await db.departure.create({ data: { ...common, status: "Open", price_override: "650000" } });
  await db.departure.create({ data: { ...common, status: "Open" } });
  for (const status of ["Draft", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"]) await db.departure.create({ data: { ...common, status } });
  await db.departure.create({ data: { ...common, status: "Open", is_demo: true } });
  await db.departure.create({ data: { ...common, status: "Open", booking_deadline: now } });
  await db.departure.create({ data: { ...common, status: "Open", departure_date: now, booking_deadline: now } });
  const result = await listPublicDepartures(db, trip.trip_id, { pageSize: "1" }, now);
  assert.equal(result.pagination.totalItems, 2);
  assert.equal(result.items[0].departure_id, valid.departure_id);
  assert.equal(result.items[0].price, "650000");
  assert.equal(result.items[0].departure_date, "2030-01-01T22:00:00.000Z");
  assert.equal((await listPublicDepartures(db, trip.trip_id, { page: "2", pageSize: "1" }, now)).items[0].price, "500000");
  for (const key of ["invoices", "staff", "vehicles", "is_demo", "customer_id", "price_override"]) assert.equal(key in result.items[0], false);
});

test("trip/price changes roll back if durable audit recording fails", async () => {
  const trip = await createTrip(db, manager, input);
  await database.sql.exec(`CREATE FUNCTION reject_catalog_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.table_name = 'trips' THEN RAISE EXCEPTION 'isolated audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_catalog_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_catalog_audit();`);
  try {
    await assert.rejects(updateTrip(db, manager, trip.trip_id, { base_price: "700000" }));
    await assert.rejects(updateTrip(db, manager, trip.trip_id, { is_active: false }));
    await assert.rejects(createTrip(db, manager, { ...input, name: "Rollback" }));
    assert.equal((await readPublicTrip(db, trip.trip_id)).base_price, "500000");
    assert.equal(await db.trip.count(), 1);
    assert.equal(await db.auditLog.count(), 1);
  } finally { await database.sql.exec("DROP TRIGGER reject_catalog_audit ON audit_logs; DROP FUNCTION reject_catalog_audit();"); }
});

test("archiving a trip hides every public entry while preserving old departures/pickups and supports restoration", async () => {
  const trip = await createTrip(db, manager, input);
  const pickup = await createPickup(db, manager, trip.trip_id, { name: "Điểm đón", address: "Địa chỉ" });
  const departure = await db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2030-01-01"),
    booking_deadline: new Date("2029-12-31"), min_passengers: 6, status: "Open" } });
  const scheduledPickup = await db.departurePickup.create({ data: { departure_id: departure.departure_id,
    pickup_id: pickup.pickup_id, pickup_time: new Date("2030-01-01") } });
  const vehicle = await db.vehicle.create({ data: { plate_number: "ARCHIVE-FIXTURE", vehicle_type: "Fixture", seat_count: 1 } });
  const seat = await db.vehicleSeat.create({ data: { vehicle_id: vehicle.vehicle_id, seat_name: "A1", floor_level: 1, x_position: 0, y_position: 0 } });
  const assignment = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
  const invoice = await db.invoice.create({ data: { customer_id: others[0].user_id, departure_id: departure.departure_id,
    payment_code: "ARCHIVE_FIXTURE", total_amount: "500000", status: "Paid", expires_at: new Date("2029-12-31") } });
  const departureSeat = await db.departureSeat.create({ data: { dep_vehicle_id: assignment.dep_vehicle_id,
    seat_id: seat.seat_id, status: "Sold", invoice_id: invoice.invoice_id } });
  const ticket = await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: departureSeat.dep_seat_id,
    dep_pickup_id: scheduledPickup.dep_pickup_id, passenger_name: "Fixture Customer", passenger_phone: "0901234567",
    emergency_contact: "Fixture", health_declaration: true, unit_price: "500000", status: "Valid", ticket_code: "ARCHIVE_TICKET" } });
  await updateTrip(db, manager, trip.trip_id, { base_price: "700000" });
  const locked = await updateTrip(db, manager, trip.trip_id, { is_active: false });
  assert.equal(locked.is_active, false);
  assert.equal((await listPublicTrips(db)).pagination.totalItems, 0);
  for (const read of [() => readPublicTrip(db, trip.trip_id), () => listPublicPickups(db, trip.trip_id),
    () => listPublicDepartures(db, trip.trip_id)]) await assert.rejects(read(), { code: "NOT_FOUND" });
  assert.equal((await listManagedTrips(db, admin)).items[0].is_active, false);
  assert.equal((await readManagedTrip(db, manager, trip.trip_id)).trip_id, trip.trip_id);
  assert.equal((await listManagedPickups(db, manager, trip.trip_id)).items[0].pickup_id, pickup.pickup_id);
  assert.equal((await db.departure.findUnique({ where: { departure_id: departure.departure_id } })).status, "Open");
  assert.deepEqual(await db.invoice.findUnique({ where: { invoice_id: invoice.invoice_id } }), invoice);
  assert.deepEqual(await db.invoiceDetail.findUnique({ where: { detail_id: ticket.detail_id } }), ticket);
  assert.deepEqual(await db.departureSeat.findUnique({ where: { dep_seat_id: departureSeat.dep_seat_id } }), departureSeat);
  assert.equal((await readCustomerInvoice(db, others[0], invoice.invoice_id)).total_amount, "500000");
  await updateTrip(db, manager, trip.trip_id, { is_active: false });
  assert.equal(await db.auditLog.count({ where: { action: "TripAvailabilityChanged" } }), 1);
  await updateTrip(db, admin, trip.trip_id, { is_active: true });
  assert.equal((await listPublicTrips(db)).pagination.totalItems, 1);
  assert.equal((await readPublicTrip(db, trip.trip_id)).is_active, true);
});

test("database refuses new/reopened departures on archived trips while allowing existing trips to finish/cancel", async () => {
  const trip = await createTrip(db, manager, input);
  const closed = await db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2030-01-01"),
    booking_deadline: new Date("2029-12-31"), min_passengers: 6, status: "Closed" } });
  const open = await db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2030-01-02"),
    booking_deadline: new Date("2030-01-01"), min_passengers: 6, status: "Open" } });
  await updateTrip(db, manager, trip.trip_id, { is_active: false });
  await assert.rejects(database.sql.query(`INSERT INTO departures(trip_id,departure_date,booking_deadline,min_passengers)
    VALUES($1,'2030-01-01','2029-12-31',6)`, [trip.trip_id]), { code: "23514" });
  await assert.rejects(database.sql.query("UPDATE departures SET status='Open' WHERE departure_id=$1", [closed.departure_id]), { code: "23514" });
  await db.departure.update({ where: { departure_id: open.departure_id }, data: { status: "Open", min_passengers: 7 } });
  assert.equal((await db.departure.findUnique({ where: { departure_id: open.departure_id } })).min_passengers, 7);
  const otherTrip = await createTrip(db, manager, { ...input, name: "Inactive parent" });
  await updateTrip(db, manager, otherTrip.trip_id, { is_active: false });
  await assert.rejects(database.sql.query("UPDATE departures SET trip_id=$1 WHERE departure_id=$2", [otherTrip.trip_id, closed.departure_id]), { code: "23514" });
  await db.departure.update({ where: { departure_id: closed.departure_id }, data: { status: "Cancelled" } });
  assert.equal((await db.departure.findUnique({ where: { departure_id: closed.departure_id } })).status, "Cancelled");
  await updateTrip(db, manager, trip.trip_id, { is_active: true });
  const draft = await db.departure.create({ data: { trip_id: trip.trip_id, departure_date: new Date("2030-01-02"),
    booking_deadline: new Date("2030-01-01"), min_passengers: 6 } });
  await db.departure.update({ where: { departure_id: draft.departure_id }, data: { status: "Open" } });
});
