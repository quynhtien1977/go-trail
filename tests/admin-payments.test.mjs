import { readDashboard } from "../src/server/services/dashboard.ts";
import { readRevenue } from "../src/server/services/revenue.ts";
import assert from "node:assert/strict";
import { describe, before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import {
  listAdminPayments,
  readAdminPayment,
} from "../src/server/services/admin-payments.ts";
import { recordSepayPayment } from "../src/server/services/payments.ts";
import { updateSupplyItem } from "../src/server/services/inventory.ts";
import { SEPAY_TEST_KEY, sepayAuth } from "./helpers/sepay.mjs";

let database, db, adminUser, routeMgrUser, customerUser;
let trip, departure, invoice1, invoice2, paymentUnderpaid, paymentUnmatched, paymentOverpaidSuccess;

before(async () => {
  database = await createTestDatabase();
  db = database.client;
});
after(async () => {
  await database?.close();
});

// P03 (SCRUM-33). Hooks live inside describe because `npm test` runs with --test-isolation=none,
// where a top-level beforeEach would rebuild this fixture before every test of every file.
describe("P03 Admin payment reconciliation (SCRUM-33)", () => {
  test("Q02 dashboard matches Q01 for expired Pending invoices and rejects invalid dates", async () => {
    const period = { from_date: "2000-01-01", to_date: "2099-12-31", trip_id: String(trip.trip_id) };
    await db.$executeRaw`UPDATE invoices SET expires_at = ${"2020-01-01T00:00:00Z"}::timestamptz WHERE invoice_id IN (${invoice1.invoice_id}, ${invoice2.invoice_id})`;
    const before = await db.invoice.findMany({ orderBy: { invoice_id: "asc" } });
    const report = await readRevenue(db, adminUser, period);
    const dashboard = await readDashboard(db, adminUser, period);
    assert.deepEqual(dashboard.revenue, report.totals);
    assert.equal(dashboard.revenue.pending, 0);
    assert.equal(dashboard.revenue.expired, 1);
    assert.equal(dashboard.revenue.paid, 1);
    assert.deepEqual(await db.invoice.findMany({ orderBy: { invoice_id: "asc" } }), before);
    for (const from_date of ["0000-01-01", "0001-01-01"]) {
      await assert.rejects(readDashboard(db, adminUser, { from_date, to_date: "2020-01-01" }), { code: "INVALID_INPUT", status: 422 });
    }
  });

  test("Q02 scopes departure and supply totals to each RouteMgr without exposing personal data", async () => {
    const otherManager = await db.user.create({ data: { role: "RouteMgr", email: "other-manager@q02.example.test",
      password_hash: "fixture", full_name: "Other manager", phone: "0902222211" } });
    const otherTrip = await db.trip.create({ data: { name: "Other trail", city: "Test", location_name: "Test",
      length_km: "5", base_price: "2000000", description: "Test", schedule_content: "Test" } });
    const otherDeparture = await db.departure.create({ data: { trip_id: otherTrip.trip_id,
      departure_date: new Date("2035-11-28T08:00:00Z"), booking_deadline: new Date("2035-11-27T18:00:00Z"),
      min_passengers: 1, status: "Open", invoice_owner_user_id: otherManager.user_id } });
    const item = await db.supplyItem.create({ data: { name: "Scoped supply", category: "Drink", unit: "bottle" } });
    await db.$executeRaw`INSERT INTO supply_transactions (item_id, created_by_user_id, txn_type, quantity, departure_id, idempotency_key, created_at) VALUES
      (${item.item_id}, ${adminUser.user_id}, 'Receive', 10, NULL, 'q02-scoped-receive', ${"2035-11-28T03:00:00Z"}::timestamptz),
      (${item.item_id}, ${adminUser.user_id}, 'Issue', 2, ${departure.departure_id}, 'q02-scoped-issue-first', ${"2035-11-28T03:00:00Z"}::timestamptz),
      (${item.item_id}, ${adminUser.user_id}, 'Issue', 7, ${otherDeparture.departure_id}, 'q02-scoped-issue-other', ${"2035-11-28T03:00:00Z"}::timestamptz)`;
    await db.$executeRaw`UPDATE departures SET departure_date = ${"2035-11-28T03:00:00Z"}::timestamptz`;
    const period = { from_date: "2035-11-28", to_date: "2035-11-28" };
    const first = await readDashboard(db, routeMgrUser, period);
    const otherActor = { user_id: otherManager.user_id, role: "RouteMgr", auth_version: 0 };
    const second = await readDashboard(db, otherActor, period);
    const admin = await readDashboard(db, adminUser, period);
    assert.deepEqual([first.operations.departures, second.operations.departures, admin.operations.departures], [1, 1, 2]);
    assert.deepEqual([first.supplies_in_period.items[0].issued, second.supplies_in_period.items[0].issued,
      admin.supplies_in_period.items[0].issued], [2, 7, 9]);
    for (const result of [first, second]) {
      assert.ok(!("revenue" in result) && !("warehouse_low_stock_now" in result));
      assert.doesNotMatch(JSON.stringify(result), /customer_id|full_name|phone|email|payment_code/i);
    }
    await assert.rejects(readDashboard(db, routeMgrUser, { ...period, departure_id: String(otherDeparture.departure_id) }),
      { code: "NOT_FOUND", status: 404 });
  });

  test("Q02 pages warehouse alerts by item and restricts HR to resources", async () => {
    const hr = await db.user.create({ data: { role: "HRMgr", email: "warehouse@test.invalid",
      password_hash: "unused", full_name: "Warehouse", phone: "0901111112" } });
    await db.supplyItem.createMany({ data: Array.from({ length: 51 }, (_, index) => ({
      name: `Alert ${index}`, category: "Gear", unit: "box", low_stock_threshold: 0,
    })) });
    const period = { from_date: "2035-11-28", to_date: "2035-11-28" };
    const item = await db.supplyItem.findFirstOrThrow({ where: { name: "Alert 0" } });
    const base = { item_id: item.item_id, created_by_user_id: hr.user_id };
    await db.supplyTransaction.createMany({ data: [
      { ...base, txn_type: "Receive", quantity: 10, idempotency_key: "dashboard-receive", created_at: new Date("2035-11-25T12:00:00Z") },
      { ...base, txn_type: "Issue", departure_id: departure.departure_id, quantity: 4, idempotency_key: "dashboard-issue-1", created_at: new Date("2035-11-28T12:00:00Z") },
      { ...base, txn_type: "Return", departure_id: departure.departure_id, quantity: 1, idempotency_key: "dashboard-return-1", created_at: new Date("2035-11-28T12:00:00Z") },
    ] });
    await db.supplyItem.update({ where: { item_id: item.item_id }, data: { low_stock_threshold: 7 } });
    const first = await readDashboard(db, hr, period);
    const allocation = first.supplies_in_period.items.find(row => row.item_id === item.item_id);
    assert.deepEqual([allocation.issued, allocation.returned], [4, 1]);
    assert.equal(first.warehouse_low_stock_now.items.find(row => row.item_id === item.item_id).on_hand, 7);
    assert.ok(!("revenue" in first) && !("passengers" in first));
    assert.equal(first.warehouse_low_stock_now.items.length, 50);
    const after = first.warehouse_low_stock_now.next_cursor;
    const next = await readDashboard(db, hr, { ...period, stock_after: String(after) });
    assert.equal(next.warehouse_low_stock_now.items.length, 1);
    assert.ok(next.warehouse_low_stock_now.items[0].item_id > after);
    assert.equal(next.warehouse_low_stock_now.next_cursor, null);
    await assert.rejects(readDashboard(db, customerUser, period), { code: "FORBIDDEN" });
  });

  test("Q02 alerts for unconfigured items only when empty and respects a custom threshold", async () => {
    const item = (name, threshold, active = true) => db.supplyItem.create({ data: {
      name, category: "Drink", unit: "bottle", low_stock_threshold: threshold, is_active: active,
    } });
    const empty = await item("Unset empty", null);
    const stocked = await item("Unset stocked", null);
    const atLimit = await item("At custom limit", 2);
    const aboveLimit = await item("Above custom limit", 2);
    const zero = await item("Explicit zero", 0);
    const retired = await item("Retired empty", null, false);
    await db.supplyTransaction.createMany({ data: [
      { item_id: stocked.item_id, quantity: 1, txn_type: "Receive", created_by_user_id: adminUser.user_id, idempotency_key: "q02-receive-stocked" },
      { item_id: atLimit.item_id, quantity: 2, txn_type: "Receive", created_by_user_id: adminUser.user_id, idempotency_key: "q02-receive-at-limit" },
      { item_id: aboveLimit.item_id, quantity: 3, txn_type: "Receive", created_by_user_id: adminUser.user_id, idempotency_key: "q02-receive-above-limit" },
    ] });
    const period = { from_date: "2000-01-01", to_date: "2099-12-31" };
    const before = await db.supplyItem.findMany({ orderBy: { item_id: "asc" } });
    const first = (await readDashboard(db, adminUser, period)).warehouse_low_stock_now.items;
    assert.deepEqual(first.map(row => row.item_id), [empty.item_id, atLimit.item_id, zero.item_id]);
    assert.deepEqual([first[0].low_stock_threshold, first[0].on_hand], [null, 0]);
    assert.deepEqual([first[1].low_stock_threshold, first[1].on_hand], [2, 2]);
    assert.deepEqual([first[2].low_stock_threshold, first[2].on_hand], [0, 0]);
    assert.ok(!first.some(row => [stocked.item_id, aboveLimit.item_id, retired.item_id].includes(row.item_id)));
    assert.deepEqual(await db.supplyItem.findMany({ orderBy: { item_id: "asc" } }), before);

    await updateSupplyItem(db, adminUser, stocked.item_id, { low_stock_threshold: 1 });
    assert.ok((await readDashboard(db, adminUser, period)).warehouse_low_stock_now.items.some(row => row.item_id === stocked.item_id));
    await updateSupplyItem(db, adminUser, stocked.item_id, { low_stock_threshold: null });
    assert.ok(!(await readDashboard(db, adminUser, period)).warehouse_low_stock_now.items.some(row => row.item_id === stocked.item_id));
  });

  test("Q01 counts each paid fare once, separates surplus and respects local midnight", async () => {
    const date = new Date("2035-11-27T17:00:00Z");
    await db.invoice.update({ where: { invoice_id: invoice1.invoice_id }, data: { status: "Paid" } });
    await db.payment.create({ data: { invoice_id: invoice1.invoice_id, transaction_id: "second-fare",
      amount: "2000000", reference_code: "paid", status: "Success", raw_payload: "{}", created_at: date } });
    const query = { from_date: "2035-11-28", to_date: "2035-11-28", trip_id: String(trip.trip_id) };
    await db.$executeRaw`UPDATE payments SET created_at = ${date.toISOString()}::timestamptz WHERE invoice_id IS NOT NULL`;
    const report = await readRevenue(db, adminUser, query);
    const adminDashboard = await readDashboard(db, adminUser, query);
    assert.deepEqual(adminDashboard.revenue, report.totals);
    assert.equal(adminDashboard.operations.departures, 1);
    const item = await db.supplyItem.create({ data: { name: "Water", category: "Drink", unit: "bottle", low_stock_threshold: 2 } });
    const lowStock = (await readDashboard(db, adminUser, query)).warehouse_low_stock_now;
    assert.equal(lowStock.items.find(row => row.item_id === item.item_id).on_hand, 0);
    const manager = await readDashboard(db, routeMgrUser, { ...query, departure_id: String(departure.departure_id) });
    assert.ok(!("revenue" in manager) && !("warehouse_low_stock_now" in manager));
    await db.departure.update({ where: { departure_id: departure.departure_id }, data: { invoice_owner_user_id: null } });
    await assert.rejects(readDashboard(db, routeMgrUser, { ...query, departure_id: String(departure.departure_id) }), { code: "NOT_FOUND" });
    const empty = await readDashboard(db, routeMgrUser, query);
    assert.equal(empty.operations.seats, 0);
    assert.equal(empty.operations.departures, 0);
    assert.equal(report.totals.ticket_revenue, "4000000");
    assert.equal(report.totals.received, "4100000");
    assert.equal(report.totals.surplus, "100000");
    assert.equal(report.totals.needs_review_amount, "1500000");
    assert.equal(report.groups[0].bucket, "2035-11-28");
    const previous = await readRevenue(db, adminUser, { ...query, from_date: "2035-11-27", to_date: "2035-11-27" });
    assert.equal(previous.totals.ticket_revenue, "0");
    assert.deepEqual(previous.groups, []);
    await assert.rejects(readRevenue(db, routeMgrUser, query), { code: "FORBIDDEN" });
  });

  test("Q01 classifies overdue holds at the reporting instant without modifying invoices", async () => {
    const extraInvoice = (code, status) => db.invoice.create({ data: {
      customer_id: customerUser.user_id, departure_id: departure.departure_id,
      payment_code: code, total_amount: "2000000", status, expires_at: new Date("2035-11-28T00:00:00Z"),
    } });
    const overdue = await extraInvoice("TB-REPORT-OVERDUE", "Pending");
    const active = await extraInvoice("TB-REPORT-ACTIVE", "Pending");
    await extraInvoice("TB-REPORT-CLEANED", "Expired");
    const query = { from_date: "2000-01-01", to_date: "2099-12-31", trip_id: String(trip.trip_id) };

    // PostgreSQL CURRENT_TIMESTAMP is fixed for the transaction, so the exact-expiry case is deterministic.
    await db.$transaction(async (tx) => {
      // Keep every event in one Vietnam calendar day even if this test runs at midnight.
      await tx.$executeRaw`UPDATE invoices SET created_at = ${"2020-01-01T03:00:00Z"}::timestamptz`;
      await tx.$executeRaw`UPDATE payments SET created_at = ${"2020-01-01T03:00:00Z"}::timestamptz`;
      await tx.$executeRaw`UPDATE invoices SET expires_at = CURRENT_TIMESTAMP WHERE invoice_id = ${invoice1.invoice_id}`;
      await tx.$executeRaw`UPDATE invoices SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE invoice_id IN (${overdue.invoice_id}, ${invoice2.invoice_id})`;
      await tx.$executeRaw`UPDATE invoices SET expires_at = CURRENT_TIMESTAMP + INTERVAL '1 minute' WHERE invoice_id = ${active.invoice_id}`;
      const snapshot = await tx.invoice.findMany({ orderBy: { invoice_id: "asc" } });

      for (const group_by of ["day", "trip", "departure"]) {
        const report = await readRevenue(tx, adminUser, { ...query, group_by });
        assert.equal(report.totals.pending, 1, group_by);
        assert.equal(report.totals.expired, 3, group_by);
        assert.equal(report.totals.paid, 1, group_by);
        assert.equal(report.groups.length, 1, group_by);
        assert.equal(report.groups[0].expired, 3, group_by);
      }
      assert.deepEqual(await tx.invoice.findMany({ orderBy: { invoice_id: "asc" } }), snapshot);

      await tx.invoice.update({ where: { invoice_id: invoice1.invoice_id }, data: { status: "Expired" } });
      const afterCleanup = await readRevenue(tx, adminUser, query);
      assert.equal(afterCleanup.totals.pending, 1);
      assert.equal(afterCleanup.totals.expired, 3);
      assert.equal(afterCleanup.totals.paid, 1);
    }, { timeout: 20000 });
  });

  test("Q01 rejects calendar dates whose Vietnam-day boundaries PostgreSQL cannot represent", async () => {
    for (const query of [
      { from_date: "0000-01-01", to_date: "2020-01-01" },
      { from_date: "0000-01-01", to_date: "0000-12-31" },
      { from_date: "0001-01-01", to_date: "2020-01-01" },
    ]) {
      await assert.rejects(readRevenue(db, adminUser, query), { code: "INVALID_INPUT", status: 422 });
    }
    const earliest = await readRevenue(db, adminUser, { from_date: "0001-01-02", to_date: "0001-01-02" });
    const latest = await readRevenue(db, adminUser, { from_date: "9999-12-31", to_date: "9999-12-31" });
    assert.equal(earliest.totals.ticket_revenue, "0");
    assert.equal(latest.totals.ticket_revenue, "0");
  });

  test("Q01 groups current invoice status by creation day and revenue by receipt day", async () => {
    await db.$executeRaw`UPDATE invoices SET created_at = ${"2020-01-01T03:00:00Z"}::timestamptz WHERE invoice_id = ${invoice2.invoice_id}`;
    await db.$executeRaw`UPDATE payments SET created_at = ${"2020-01-02T03:00:00Z"}::timestamptz WHERE payment_id = ${paymentOverpaidSuccess.payment_id}`;
    const creationDay = await readRevenue(db, adminUser, { from_date: "2020-01-01", to_date: "2020-01-01" });
    const receiptDay = await readRevenue(db, adminUser, { from_date: "2020-01-02", to_date: "2020-01-02" });
    assert.equal(creationDay.totals.paid, 1);
    assert.equal(creationDay.totals.ticket_revenue, "0");
    assert.equal(receiptDay.totals.paid, 0);
    assert.equal(receiptDay.totals.ticket_revenue, "2000000");
    assert.equal(receiptDay.totals.received, "2100000");
    assert.equal(receiptDay.totals.surplus, "100000");
  });

  beforeEach(async () => {
    await database.sql.exec("TRUNCATE supply_items, users, trips, vehicles, staff, invoices, invoice_details, payments, audit_logs RESTART IDENTITY CASCADE");

    const admin = await db.user.create({
      data: { email: "admin@payments.test", password_hash: "hash", full_name: "Admin User", phone: "0901111111", role: "Admin" },
    });
    adminUser = { user_id: admin.user_id, role: "Admin", auth_version: 0 };

    const routeMgr = await db.user.create({
      data: { email: "rm@payments.test", password_hash: "hash", full_name: "Route Manager", phone: "0902222222", role: "RouteMgr" },
    });
    routeMgrUser = { user_id: routeMgr.user_id, role: "RouteMgr", auth_version: 0 };

    const customer = await db.user.create({
      data: { email: "customer@payments.test", password_hash: "hash", full_name: "Customer User", phone: "0903333333", role: "Customer" },
    });
    customerUser = { user_id: customer.user_id, role: "Customer", auth_version: 0 };

    trip = await db.trip.create({
      data: { name: "Tour Bidoup", city: "Lâm Đồng", location_name: "Bidoup", length_km: "28.0", base_price: "2000000", description: "Vườn quốc gia", schedule_content: "Lịch trình" },
    });

    departure = await db.departure.create({
      data: {
        trip_id: trip.trip_id,
        departure_date: new Date("2035-11-28T08:00:00Z"),
        booking_deadline: new Date("2035-11-27T18:00:00Z"),
        min_passengers: 1,
        status: "Open",
        invoice_owner_user_id: routeMgr.user_id,
      },
    });

    invoice1 = await db.invoice.create({
      data: {
        customer_id: customer.user_id,
        departure_id: departure.departure_id,
        payment_code: "TB2001",
        total_amount: "2000000",
        status: "Pending",
        expires_at: new Date("2035-11-28T00:00:00Z"),
        responsible_user_id: routeMgr.user_id,
        responsible_name_snapshot: "Route Manager",
        responsible_role_snapshot: "RouteMgr",
      },
    });

    invoice2 = await db.invoice.create({
      data: {
        customer_id: customer.user_id,
        departure_id: departure.departure_id,
        payment_code: "TB2002",
        total_amount: "2000000",
        status: "Paid",
        expires_at: new Date("2035-11-28T00:00:00Z"),
        responsible_user_id: routeMgr.user_id,
        responsible_name_snapshot: "Route Manager",
        responsible_role_snapshot: "RouteMgr",
      },
    });

    // 1. Underpaid payment for invoice 1 (chuyển thiếu: 1,500,000 < 2,000,000) -> NeedsReview
    paymentUnderpaid = await db.payment.create({
      data: {
        invoice_id: invoice1.invoice_id,
        amount: "1500000",
        transaction_id: "TX-UNDER",
        reference_code: "REF-UNDER",
        status: "NeedsReview",
        raw_payload: JSON.stringify({ id: "TX-UNDER", transferAmount: 1500000, code: "TB2001" }),
      },
    });

    // 2. Unmatched payment (sai mã chuyển khoản, không có invoice) -> NeedsReview
    paymentUnmatched = await db.payment.create({
      data: {
        invoice_id: null,
        amount: "500000",
        transaction_id: "TX-UNMATCHED",
        reference_code: "REF-UNMATCHED",
        status: "NeedsReview",
        raw_payload: JSON.stringify({ id: "TX-UNMATCHED", transferAmount: 500000, code: "UNKNOWN_CODE" }),
      },
    });

    // 3. Overpayment confirmed under B04 (chuyển thừa: 2,100,000 > 2,000,000) -> Success
    paymentOverpaidSuccess = await db.payment.create({
      data: {
        invoice_id: invoice2.invoice_id,
        amount: "2100000",
        transaction_id: "TX-OVERPAID",
        reference_code: "REF-OVERPAID",
        status: "Success",
        raw_payload: JSON.stringify({ id: "TX-OVERPAID", transferAmount: 2100000, code: "TB2002" }),
      },
    });
  });

  test("Admin can list payments and inspect NeedsReview vs Success reconciliation records", async () => {
    const page = await listAdminPayments(db, adminUser);
    assert.equal(page.items.length, 3);
    assert.equal(page.pagination.totalItems, 3);

    const needsReviewOnly = await listAdminPayments(db, adminUser, { status: "NeedsReview" });
    assert.equal(needsReviewOnly.items.length, 2);

    const underpaidItem = needsReviewOnly.items.find((p) => p.transaction_id === "TX-UNDER");
    assert.ok(underpaidItem);
    assert.equal(underpaidItem.review_reason, "underpaid");
    assert.equal(underpaidItem.amount, "1500000");
    assert.equal(underpaidItem.invoice?.total_amount, "2000000");
    assert.equal(underpaidItem.invoice?.difference, "-500000");
    assert.equal(underpaidItem.invoice?.payment_code, "TB2001");
    assert.equal(underpaidItem.invoice?.customer.full_name, "Customer User");

    const unmatchedItem = needsReviewOnly.items.find((p) => p.transaction_id === "TX-UNMATCHED");
    assert.ok(unmatchedItem);
    assert.equal(unmatchedItem.review_reason, "unmatched_payment_code");
    assert.equal(unmatchedItem.payment_id, paymentUnmatched.payment_id);
    assert.equal(unmatchedItem.invoice, null);
    assert.ok(page.items.every((item) => !Object.hasOwn(item, "raw_payload")), "the raw SePay body is detail-only");
  });

  test("Admin sees overpayment difference on B04 Success payment", async () => {
    const page = await listAdminPayments(db, adminUser, { status: "Success" });
    assert.equal(page.items.length, 1);
    const overpaidItem = page.items[0];
    assert.equal(overpaidItem.transaction_id, "TX-OVERPAID");
    assert.equal(overpaidItem.payment_id, paymentOverpaidSuccess.payment_id);
    assert.equal(overpaidItem.amount, "2100000");
    assert.equal(overpaidItem.invoice?.total_amount, "2000000");
    assert.equal(overpaidItem.invoice?.difference, "100000");
    assert.equal(overpaidItem.review_reason, "confirmed_success");
  });

  test("readAdminPayment returns full payment details, invoice info, and raw payload", async () => {
    const detail = await readAdminPayment(db, adminUser, paymentUnderpaid.payment_id);
    assert.equal(detail.payment_id, paymentUnderpaid.payment_id);
    assert.equal(detail.transaction_id, "TX-UNDER");
    assert.equal(detail.amount, "1500000");
    assert.equal(detail.invoice?.payment_code, "TB2001");
    assert.equal(detail.invoice?.responsible_name_snapshot, "Route Manager");
    assert.ok(detail.raw_payload.includes("TX-UNDER"));

    await assert.rejects(readAdminPayment(db, adminUser, 999999), { code: "NOT_FOUND" });
  });

  test("RBAC: Only Admin can access payment reconciliation endpoints; RouteMgr and Customer are forbidden", async () => {
    await assert.rejects(listAdminPayments(db, routeMgrUser), { code: "FORBIDDEN" });
    await assert.rejects(listAdminPayments(db, customerUser), { code: "FORBIDDEN" });
    await assert.rejects(readAdminPayment(db, routeMgrUser, paymentUnderpaid.payment_id), { code: "FORBIDDEN" });
    await assert.rejects(readAdminPayment(db, customerUser, paymentUnderpaid.payment_id), { code: "FORBIDDEN" });
  });

  test("Review reasons replay P02: seats taken, invoice not payable, and a row the current state no longer explains", async () => {
    // Setup vehicle and seat
    const vehicle = await db.vehicle.create({
      data: { plate_number: "PAY-EXP", vehicle_type: "29", seat_count: 2 },
    });
    const seat1 = await db.vehicleSeat.create({
      data: { vehicle_id: vehicle.vehicle_id, seat_name: "B01", floor_level: 1, x_position: 0, y_position: 0 },
    });
    const seat2 = await db.vehicleSeat.create({
      data: { vehicle_id: vehicle.vehicle_id, seat_name: "B02", floor_level: 1, x_position: 1, y_position: 0 },
    });
    const depVehicle = await db.departureVehicle.create({
      data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id },
    });
    const depSeat1 = await db.departureSeat.create({
      data: { dep_vehicle_id: depVehicle.dep_vehicle_id, seat_id: seat1.seat_id, status: "Available", invoice_id: null },
    });
    const depSeat2 = await db.departureSeat.create({
      data: { dep_vehicle_id: depVehicle.dep_vehicle_id, seat_id: seat2.seat_id, status: "Sold", invoice_id: invoice2.invoice_id },
    });

    const pickup = await db.pickupPoint.create({
      data: { trip_id: trip.trip_id, name: "Điểm đón Expired", address: "Địa chỉ" },
    });
    const depPickup = await db.departurePickup.create({
      data: { departure_id: departure.departure_id, pickup_id: pickup.pickup_id, pickup_time: new Date("2035-11-28T07:00:00Z") },
    });

    // Invoice 3: Expired, seat is still Available (late payment, seats retained/free)
    const invoice3 = await db.invoice.create({
      data: {
        customer_id: customerUser.user_id,
        departure_id: departure.departure_id,
        payment_code: "TB2003",
        total_amount: "2000000",
        status: "Expired",
        expires_at: new Date("2035-11-20T00:00:00Z"),
        responsible_user_id: routeMgrUser.user_id,
        responsible_name_snapshot: "Route Manager",
        responsible_role_snapshot: "RouteMgr",
      },
    });
    await db.invoiceDetail.create({
      data: {
        invoice_id: invoice3.invoice_id,
        dep_seat_id: depSeat1.dep_seat_id,
        dep_pickup_id: depPickup.dep_pickup_id,
        passenger_name: "Khách trễ",
        passenger_phone: "0904444444",
        emergency_contact: "Người thân 0905555555",
        health_declaration: true,
        unit_price: "2000000",
        status: "Cancelled",
      },
    });
    const paymentLateRetained = await db.payment.create({
      data: {
        invoice_id: invoice3.invoice_id,
        amount: "2000000",
        transaction_id: "TX-LATE-RETAINED",
        reference_code: "REF-LATE-1",
        status: "NeedsReview",
        raw_payload: JSON.stringify({ id: "TX-LATE-RETAINED", transferAmount: 2000000, code: "TB2003" }),
      },
    });

    // Invoice 4: Expired, seat was taken by another invoice (depSeat2 is Sold to invoice2)
    const invoice4 = await db.invoice.create({
      data: {
        customer_id: customerUser.user_id,
        departure_id: departure.departure_id,
        payment_code: "TB2004",
        total_amount: "2000000",
        status: "Expired",
        expires_at: new Date("2035-11-20T00:00:00Z"),
        responsible_user_id: routeMgrUser.user_id,
        responsible_name_snapshot: "Route Manager",
        responsible_role_snapshot: "RouteMgr",
      },
    });
    await db.invoiceDetail.create({
      data: {
        invoice_id: invoice4.invoice_id,
        dep_seat_id: depSeat2.dep_seat_id,
        dep_pickup_id: depPickup.dep_pickup_id,
        passenger_name: "Khách mất ghế",
        passenger_phone: "0906666666",
        emergency_contact: "Người thân 0907777777",
        health_declaration: true,
        unit_price: "2000000",
        status: "Cancelled",
      },
    });
    const paymentSeatLost = await db.payment.create({
      data: {
        invoice_id: invoice4.invoice_id,
        amount: "2000000",
        transaction_id: "TX-SEAT-LOST",
        reference_code: "REF-LATE-2",
        status: "NeedsReview",
        raw_payload: JSON.stringify({ id: "TX-SEAT-LOST", transferAmount: 2000000, code: "TB2004" }),
      },
    });

    // Invoice 5: Cancelled invoice
    const invoice5 = await db.invoice.create({
      data: {
        customer_id: customerUser.user_id,
        departure_id: departure.departure_id,
        payment_code: "TB2005",
        total_amount: "2000000",
        status: "Cancelled",
        expires_at: new Date("2035-11-20T00:00:00Z"),
        responsible_user_id: routeMgrUser.user_id,
        responsible_name_snapshot: "Route Manager",
        responsible_role_snapshot: "RouteMgr",
      },
    });
    const paymentCancelled = await db.payment.create({
      data: {
        invoice_id: invoice5.invoice_id,
        amount: "2000000",
        transaction_id: "TX-CANCELLED",
        reference_code: "REF-CANCELLED",
        status: "NeedsReview",
        raw_payload: JSON.stringify({ id: "TX-CANCELLED", transferAmount: 2000000, code: "TB2005" }),
      },
    });

    // Full amount on an Expired invoice whose seat is still free on an open departure: P02 would have confirmed it
    // (PRD 5.2.1), so the current rows do not explain the hold-back. The API says so instead of guessing.
    const detailLate = await readAdminPayment(db, adminUser, paymentLateRetained.payment_id);
    assert.equal(detailLate.review_reason, "unexplained");
    assert.equal(detailLate.invoice?.ticket_count, 1);

    const detailLost = await readAdminPayment(db, adminUser, paymentSeatLost.payment_id);
    assert.equal(detailLost.review_reason, "seats_taken");

    const detailCancelled = await readAdminPayment(db, adminUser, paymentCancelled.payment_id);
    assert.equal(detailCancelled.review_reason, "invoice_not_payable");
  });

  test("Review reasons cover a second transfer, a closed departure, a departed trip and an invoice without tickets", async () => {
    const hold = (code, extra = {}) => db.invoice.create({ data: { customer_id: customerUser.user_id, departure_id: departure.departure_id,
      payment_code: code, total_amount: "2000000", status: "Expired", expires_at: new Date("2035-11-20T00:00:00Z"), ...extra } });
    const pay = (invoice, id, extra = {}) => db.payment.create({ data: { invoice_id: invoice.invoice_id, amount: "2000000",
      transaction_id: id, reference_code: `REF-${id}`, status: "NeedsReview", raw_payload: "{}", ...extra } });
    const reason = async (payment) => (await readAdminPayment(db, adminUser, payment.payment_id)).review_reason;

    // A second full transfer to an invoice another transfer already paid.
    assert.equal(await reason(await pay(invoice2, "TX-SECOND")), "invoice_already_paid");
    // An invoice whose tickets are gone cannot be confirmed.
    assert.equal(await reason(await pay(await hold("TB3001"), "TX-NO-TICKETS")), "no_tickets");

    const vehicle = await db.vehicle.create({ data: { plate_number: "PAY-REASON", vehicle_type: "29", seat_count: 1 } });
    const seat = await db.vehicleSeat.create({ data: { vehicle_id: vehicle.vehicle_id, seat_name: "C01", floor_level: 1, x_position: 0, y_position: 0 } });
    const bus = await db.departureVehicle.create({ data: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } });
    const free = await db.departureSeat.create({ data: { dep_vehicle_id: bus.dep_vehicle_id, seat_id: seat.seat_id } });
    const stop = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: "Reason stop", address: "Fixture" } });
    const depStop = await db.departurePickup.create({ data: { departure_id: departure.departure_id, pickup_id: stop.pickup_id,
      pickup_time: new Date("2035-11-28T07:00:00Z") } });
    const ticketed = await hold("TB3002");
    await db.invoiceDetail.create({ data: { invoice_id: ticketed.invoice_id, dep_seat_id: free.dep_seat_id, dep_pickup_id: depStop.dep_pickup_id,
      passenger_name: "Fixture", passenger_phone: "0900000000", emergency_contact: "Fixture", health_declaration: true,
      unit_price: "2000000", status: "Cancelled" } });
    // The money arrived after the departure time.
    assert.equal(await reason(await pay(ticketed, "TX-AFTER-DEPARTURE", { created_at: new Date("2035-11-28T09:00:00Z") })),
      "departure_already_started");
    const onTime = await pay(ticketed, "TX-ON-TIME");
    assert.equal(await reason(onTime), "unexplained");
    for (const status of ["Confirmed", "Running", "Ended"]) {
      await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status } });
      assert.equal(await reason(onTime), "departure_not_selling", status);
    }
    // Reading never repairs anything: the invoice, seat and payment are exactly as they were.
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { invoice_id: ticketed.invoice_id } })).status, "Expired");
    assert.equal((await db.departureSeat.findUniqueOrThrow({ where: { dep_seat_id: free.dep_seat_id } })).status, "Available");
    assert.equal((await db.payment.findUniqueOrThrow({ where: { payment_id: onTime.payment_id } })).status, "NeedsReview");
  });

  test("Admin payments list supports query filters and pagination", async () => {
    const filteredByTx = await listAdminPayments(db, adminUser, { transaction_id: "UNDER" });
    assert.equal(filteredByTx.items.length, 1);
    assert.equal(filteredByTx.items[0].transaction_id, "TX-UNDER");

    const filteredByRef = await listAdminPayments(db, adminUser, { reference_code: "REF-OVERPAID" });
    assert.equal(filteredByRef.items.length, 1);
    assert.equal(filteredByRef.items[0].reference_code, "REF-OVERPAID");

    const filteredByCode = await listAdminPayments(db, adminUser, { payment_code: "TB2001" });
    assert.equal(filteredByCode.items.length, 1);
    assert.equal(filteredByCode.items[0].invoice?.payment_code, "TB2001");

    const paged = await listAdminPayments(db, adminUser, { page: 1, pageSize: 2 });
    assert.equal(paged.items.length, 2);
    assert.equal(paged.pagination.pageSize, 2);
    assert.equal(paged.pagination.page, 1);
    assert.ok(paged.pagination.totalPages >= 2);

    // Validation: negative page or invalid payment ID rejects with INVALID_INPUT (422)
    await assert.rejects(listAdminPayments(db, adminUser, { page: 0 }), { code: "INVALID_INPUT" });
    await assert.rejects(readAdminPayment(db, adminUser, -1), { code: "INVALID_INPUT" });
  });

  // The reasons are a replay of P02, so check them against P02 itself: every case goes through the real webhook,
  // and the reason the API derives must name why that webhook held the money back.
  test("every reason matches why the real P02 webhook held the transfer back", async () => {
    process.env.SEPAY_API_KEY = SEPAY_TEST_KEY;
    let txn = 990000;
    const send = async (code, amount) => {
      await recordSepayPayment(db, sepayAuth, JSON.stringify({ id: ++txn, gateway: "Fixture", transactionDate: "2026-11-23 10:00:00",
        accountNumber: "0000000000", code, content: `${code} fixture`, transferType: "in", transferAmount: amount, accumulated: 0,
        subAccount: "", referenceCode: `REF${txn}`, description: "" }));
      const row = await db.payment.findFirstOrThrow({ orderBy: { payment_id: "desc" } });
      return { status: row.status, reason: (await readAdminPayment(db, adminUser, row.payment_id)).review_reason };
    };
    const vehicle = await db.vehicle.create({ data: { plate_number: "P02-REPLAY", vehicle_type: "29", seat_count: 5 } });
    async function seatsFor(dep, count) {
      const bus = await db.departureVehicle.create({ data: { departure_id: dep.departure_id, vehicle_id: vehicle.vehicle_id } });
      const stop = await db.pickupPoint.create({ data: { trip_id: trip.trip_id, name: `Stop ${dep.departure_id}`, address: "Fixture" } });
      const depStop = await db.departurePickup.create({ data: { departure_id: dep.departure_id, pickup_id: stop.pickup_id,
        pickup_time: dep.departure_date } });
      const list = [];
      for (let i = 0; i < count; i++) {
        const physical = await db.vehicleSeat.upsert({ where: { vehicle_id_seat_name: { vehicle_id: vehicle.vehicle_id, seat_name: `R0${i}` } },
          create: { vehicle_id: vehicle.vehicle_id, seat_name: `R0${i}`, floor_level: 1, x_position: i, y_position: 0 }, update: {} });
        list.push({ seat: await db.departureSeat.create({ data: { dep_vehicle_id: bus.dep_vehicle_id, seat_id: physical.seat_id } }), depStop });
      }
      return list;
    }
    // Mirrors a live hold: Pending invoice, its seat Locked by it, one Pending ticket.
    async function held(dep, { seat, depStop }, code) {
      const invoice = await db.invoice.create({ data: { customer_id: customerUser.user_id, departure_id: dep.departure_id, payment_code: code,
        total_amount: "2000000", status: "Pending", expires_at: new Date("2035-11-20T00:00:00Z") } });
      await db.departureSeat.update({ where: { dep_seat_id: seat.dep_seat_id },
        data: { status: "Locked", invoice_id: invoice.invoice_id, locked_until: new Date("2035-11-20T00:00:00Z") } });
      await db.invoiceDetail.create({ data: { invoice_id: invoice.invoice_id, dep_seat_id: seat.dep_seat_id, dep_pickup_id: depStop.dep_pickup_id,
        passenger_name: "Fixture", passenger_phone: "0900000000", emergency_contact: "Fixture", health_declaration: true,
        unit_price: "2000000", status: "Pending" } });
      return invoice;
    }
    const open = await seatsFor(departure, 5);

    assert.deepEqual(await send("GTNOPE000001", 2000000), { status: "NeedsReview", reason: "unmatched_payment_code" });
    await held(departure, open[0], "GTSHORT00001");
    assert.deepEqual(await send("GTSHORT00001", 1999999), { status: "NeedsReview", reason: "underpaid" });
    assert.deepEqual(await send("TB2002", 2000000), { status: "NeedsReview", reason: "invoice_already_paid" });
    assert.deepEqual(await send("TB2001", 2000000), { status: "NeedsReview", reason: "no_tickets" });
    const cancelled = await held(departure, open[1], "GTCANCEL0001");
    await db.invoice.update({ where: { invoice_id: cancelled.invoice_id }, data: { status: "Cancelled" } });
    assert.deepEqual(await send("GTCANCEL0001", 2000000), { status: "NeedsReview", reason: "invoice_not_payable" });
    await held(departure, open[2], "GTTAKEN00001");
    await db.departureSeat.update({ where: { dep_seat_id: open[2].seat.dep_seat_id },
      data: { status: "Sold", invoice_id: invoice2.invoice_id, locked_until: null } });
    assert.deepEqual(await send("GTTAKEN00001", 2000000), { status: "NeedsReview", reason: "seats_taken" });
    await held(departure, open[3], "GTPAID000001");
    assert.deepEqual(await send("GTPAID000001", 2000100), { status: "Success", reason: "confirmed_success" });
    await held(departure, open[4], "GTCLOSED0001");
    await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status: "Confirmed" } });
    assert.deepEqual(await send("GTCLOSED0001", 2000000), { status: "NeedsReview", reason: "departure_not_selling" });
    // Reopened later: the seat is still Locked by this invoice, so nothing in the current rows explains the hold-back.
    await db.departure.update({ where: { departure_id: departure.departure_id }, data: { status: "Open" } });
    const closedRow = await db.payment.findFirstOrThrow({ where: { invoice: { payment_code: "GTCLOSED0001" } } });
    assert.equal((await readAdminPayment(db, adminUser, closedRow.payment_id)).review_reason, "unexplained",
      "a seat this invoice still holds is not a taken seat");

    // A departure whose time has passed while it is still open: P02 reads the clock after its locks.
    const departed = await db.departure.create({ data: { trip_id: trip.trip_id, status: "Open", min_passengers: 1,
      departure_date: new Date("2026-01-02T00:00:00Z"), booking_deadline: new Date("2026-01-01T00:00:00Z") } });
    await held(departed, (await seatsFor(departed, 1))[0], "GTLATE000001");
    assert.deepEqual(await send("GTLATE000001", 2000000), { status: "NeedsReview", reason: "departure_already_started" });
    // Both true at once: P02 looks at the tickets before the clock, and so must the replay.
    await db.invoice.create({ data: { customer_id: customerUser.user_id, departure_id: departed.departure_id, payment_code: "GTEMPTY00001",
      total_amount: "2000000", status: "Pending", expires_at: new Date("2035-11-20T00:00:00Z") } });
    assert.deepEqual(await send("GTEMPTY00001", 2000000), { status: "NeedsReview", reason: "no_tickets" });
  });
});
