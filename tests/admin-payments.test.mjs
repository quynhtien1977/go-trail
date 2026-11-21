import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { createTestDatabase } from "./helpers/test-database.mjs";
import {
  listAdminPayments,
  readAdminPayment,
} from "../src/server/services/admin-payments.ts";

let database, db, adminUser, routeMgrUser, customerUser;
let trip, departure, invoice1, invoice2, paymentUnderpaid, paymentUnmatched, paymentOverpaidSuccess;

before(async () => {
  database = await createTestDatabase();
  db = database.client;
});

beforeEach(async () => {
  await database.sql.exec("TRUNCATE users, trips, vehicles, staff, invoices, invoice_details, payments, audit_logs RESTART IDENTITY CASCADE");

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
      departure_date: new Date("2026-11-28T08:00:00Z"),
      booking_deadline: new Date("2026-11-27T18:00:00Z"),
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
      expires_at: new Date("2026-11-28T00:00:00Z"),
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
      expires_at: new Date("2026-11-28T00:00:00Z"),
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

after(async () => {
  await database?.close();
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
  assert.equal(unmatchedItem.invoice, null);
});

test("Admin sees overpayment difference on B04 Success payment", async () => {
  const page = await listAdminPayments(db, adminUser, { status: "Success" });
  assert.equal(page.items.length, 1);
  const overpaidItem = page.items[0];
  assert.equal(overpaidItem.transaction_id, "TX-OVERPAID");
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
