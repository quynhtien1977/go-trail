import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampPageNumber,
  describeInvoicePaymentAndCheckIn,
  formatResponsibleStaffSnapshot,
  invoiceManagementCapabilities,
  invoiceManagementReadScope,
  mapCustomerDetailToManagedInvoices,
  normalizeInvoiceManagementQuery,
} from "../src/lib/invoice-management-ui.ts";

test("invoiceManagementCapabilities enforces PRD 3.2/3.3 matrix for Admin, RouteMgr and other roles", () => {
  const admin = invoiceManagementCapabilities("Admin");
  assert.equal(admin.canAccessWorkspace, true);
  assert.equal(admin.canFilterByResponsibleStaff, true);
  assert.equal(admin.canReadAllInvoices, true);

  const routeMgr = invoiceManagementCapabilities("RouteMgr");
  assert.equal(routeMgr.canAccessWorkspace, true);
  assert.equal(routeMgr.canFilterByResponsibleStaff, false);
  assert.equal(routeMgr.canReadAllInvoices, false);

  for (const role of ["HRMgr", "Leader", "Customer", "Guest", "", "Accountant"]) {
    const cap = invoiceManagementCapabilities(role);
    assert.equal(cap.canAccessWorkspace, false);
    assert.equal(cap.canFilterByResponsibleStaff, false);
    assert.equal(cap.canReadAllInvoices, false);
  }
});

test("invoiceManagementReadScope isolates session state by authentication, role and user_id", () => {
  assert.equal(invoiceManagementReadScope("loading", { user_id: 3, role: "RouteMgr" }), null);
  assert.equal(invoiceManagementReadScope("unauthenticated", { user_id: 3, role: "RouteMgr" }), null);
  assert.equal(invoiceManagementReadScope("authenticated", { user_id: 0, role: "RouteMgr" }), null);
  assert.equal(invoiceManagementReadScope("authenticated", { user_id: 3, role: "RouteMgr" }), "staff-invoices:RouteMgr:3");
  assert.equal(invoiceManagementReadScope("authenticated", { user_id: 1, role: "Admin" }), "staff-invoices:Admin:1");
  assert.notEqual(
    invoiceManagementReadScope("authenticated", { user_id: 3, role: "RouteMgr" }),
    invoiceManagementReadScope("authenticated", { user_id: 8, role: "RouteMgr" }),
  );
  for (const role of ["HRMgr", "Leader", "Customer"]) {
    assert.equal(invoiceManagementReadScope("authenticated", { user_id: 5, role }), null);
  }
});

test("normalizeInvoiceManagementQuery strips responsibleUserId for non-Admin and normalizes filters", () => {
  const routeMgrQuery = normalizeInvoiceManagementQuery(
    {
      page: 2,
      q: "  TB000123  ",
      invoiceStatus: "Paid",
      ticketStatus: "Valid",
      checkInStatus: "CheckedIn",
      departureId: 42,
      responsibleUserId: 99,
    },
    "RouteMgr",
  );
  assert.equal(routeMgrQuery.responsibleUserId, null, "RouteMgr must never filter by another employee");
  assert.equal(routeMgrQuery.q, "TB000123");
  assert.equal(routeMgrQuery.page, 2);
  assert.equal(routeMgrQuery.departureId, 42);

  const adminQuery = normalizeInvoiceManagementQuery(
    {
      page: -3,
      q: "  Nguyễn Văn A ",
      invoiceStatus: "Pending",
      ticketStatus: "all",
      checkInStatus: "all",
      departureId: null,
      responsibleUserId: 15,
    },
    "Admin",
  );
  assert.equal(adminQuery.responsibleUserId, 15, "Admin may filter by a specific responsible staff member");
  assert.equal(adminQuery.page, 1);
  assert.equal(adminQuery.q, "Nguyễn Văn A");
});

test("formatResponsibleStaffSnapshot uses only API snapshot fields and never claims payment approval", () => {
  const withSnapshot = formatResponsibleStaffSnapshot({
    responsibleNameSnapshot: "Phạm Quản Lý Tuyến",
    responsibleRoleSnapshot: "RouteMgr",
  });
  assert.equal(withSnapshot.nameLabel, "Phạm Quản Lý Tuyến");
  assert.equal(withSnapshot.roleLabel, "Quản lý Tuyến & Web (RouteMgr)");
  assert.doesNotMatch(withSnapshot.attributionNote, /đã duyệt tiền$/i);
  assert.match(withSnapshot.attributionNote, /không đồng nghĩa/i);

  const legacyNull = formatResponsibleStaffSnapshot({
    responsibleNameSnapshot: null,
    responsibleRoleSnapshot: null,
  });
  assert.equal(legacyNull.nameLabel, "Chưa ghi nhận nhân viên phụ trách (dữ liệu lịch sử)");
  assert.equal(legacyNull.roleLabel, null);
});

test("describeInvoicePaymentAndCheckIn strictly separates payment, ticket validity and check-in states", () => {
  const paidPendingCheckIn = describeInvoicePaymentAndCheckIn({
    invoiceStatus: "Paid",
    ticketStatus: "Valid",
    checkInStatus: "Pending",
  });
  assert.equal(paidPendingCheckIn.invoiceStatusLabel, "Đã thanh toán");
  assert.equal(paidPendingCheckIn.ticketStatusLabel, "Vé hợp lệ");
  assert.equal(paidPendingCheckIn.checkInStatusLabel, "Chưa điểm danh");
  assert.equal(paidPendingCheckIn.invoiceStatusTone, "success");
  assert.equal(paidPendingCheckIn.checkInStatusTone, "neutral");

  const paidAbsent = describeInvoicePaymentAndCheckIn({
    invoiceStatus: "Paid",
    ticketStatus: "Valid",
    checkInStatus: "Absent",
  });
  assert.equal(paidAbsent.invoiceStatusLabel, "Đã thanh toán");
  assert.equal(paidAbsent.ticketStatusLabel, "Vé hợp lệ");
  assert.equal(paidAbsent.checkInStatusLabel, "Vắng mặt");
  assert.equal(paidAbsent.invoiceStatusTone, "success");
  assert.equal(paidAbsent.checkInStatusTone, "danger");

  const pendingHold = describeInvoicePaymentAndCheckIn({
    invoiceStatus: "Pending",
    ticketStatus: "Pending",
    checkInStatus: "Pending",
  });
  assert.equal(pendingHold.invoiceStatusLabel, "Chờ thanh toán");
  assert.equal(pendingHold.ticketStatusLabel, "Chờ phát hành vé");
  assert.equal(pendingHold.invoiceStatusTone, "warning");
});

test("mapCustomerDetailToManagedInvoices maps CustomerDetailDto bookings while preserving snapshots and states", () => {
  const detail = {
    customer: {
      user_id: 21,
      full_name: "Trần Khách Trekking",
      email: "khach@example.com",
      phone: "0901234567",
      status: "Active",
      created_at: "2026-10-01T00:00:00.000Z",
      invoice_count: 1,
      last_booking_at: "2026-11-10T03:00:00.000Z",
    },
    bookings: [
      {
        invoice_id: 108,
        departure_id: 305,
        status: "Paid",
        total_amount: "466000",
        created_at: "2026-11-10T03:00:00.000Z",
        expires_at: "2026-11-10T03:15:00.000Z",
        responsible_name_snapshot: "Phạm Quản Lý Tuyến",
        responsible_role_snapshot: "RouteMgr",
        trip_name: "Trail Bus – Bà Đen",
        departure_date: "2026-11-22T22:30:00.000Z",
        tickets: [
          {
            detail_id: 901,
            seat_name: "A01",
            passenger_name: "Trần Khách Trekking",
            status: "Valid",
            check_in_status: "CheckedIn",
          },
          {
            detail_id: 902,
            seat_name: "A02",
            passenger_name: "Lê Bạn Đồng Hành",
            status: "Valid",
            check_in_status: "Pending",
          },
        ],
      },
    ],
  };

  const invoices = mapCustomerDetailToManagedInvoices(detail);
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].invoiceId, 108);
  assert.equal(invoices[0].customerId, 21);
  assert.equal(invoices[0].customerName, "Trần Khách Trekking");
  assert.equal(invoices[0].responsibleNameSnapshot, "Phạm Quản Lý Tuyến");
  assert.equal(invoices[0].tickets.length, 2);
  assert.equal(invoices[0].tickets[0].checkInStatus, "CheckedIn");
  assert.equal(invoices[0].tickets[1].checkInStatus, "Pending");
  assert.equal(clampPageNumber(5, 2), 2);
  assert.equal(clampPageNumber(1, 0), 1);
});
