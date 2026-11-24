import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStaffInvoiceSearchParams,
  buildStaffTicketSearchParams,
  clampPageNumber,
  describeInvoicePaymentAndCheckIn,
  formatResponsibleStaffSnapshot,
  invoiceManagementCapabilities,
  invoiceManagementReadScope,
  mapCustomerDetailToManagedInvoices,
  mapStaffInvoiceDetailToView,
  mapStaffInvoiceSummaryToView,
  mapStaffManagementPage,
  mapStaffTicketToView,
  normalizeInvoiceManagementQuery,
  staffInvoiceSource,
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

const baseQuery = normalizeInvoiceManagementQuery({}, "Admin");

test("buildStaffInvoiceSearchParams sends only non-empty strict params with pageSize=10", () => {
  const emptyParams = buildStaffInvoiceSearchParams(baseQuery);
  assert.equal(emptyParams.toString(), "page=1&pageSize=10");

  const filteredParams = buildStaffInvoiceSearchParams(
    normalizeInvoiceManagementQuery(
      {
        page: 2,
        q: " GT123 ",
        invoiceStatus: "Paid",
        departureId: 7,
        responsibleUserId: 3,
      },
      "Admin",
    ),
  );
  assert.equal(filteredParams.get("page"), "2");
  assert.equal(filteredParams.get("pageSize"), "10");
  assert.equal(filteredParams.get("status"), "Paid");
  assert.equal(filteredParams.get("departure_id"), "7");
  assert.equal(filteredParams.get("responsible_user_id"), "3");
  assert.equal(filteredParams.get("search"), "GT123");
  assert.equal([...filteredParams.keys()].length, 6);
});

test("buildStaffTicketSearchParams classifies full ticket_code, phone digits, and passenger_name", () => {
  const fullCode = "TK0123456789ABCDEF0123";
  const byTicketCode = buildStaffTicketSearchParams({ ...baseQuery, q: ` ${fullCode} ` });
  assert.equal(byTicketCode.get("ticket_code"), fullCode);
  assert.equal(byTicketCode.get("passenger_phone"), null);
  assert.equal(byTicketCode.get("passenger_name"), null);

  const lowerCode = "tk0123456789abcdef0123";
  const byLowerTicketCode = buildStaffTicketSearchParams({ ...baseQuery, q: lowerCode });
  assert.equal(byLowerTicketCode.get("ticket_code"), lowerCode);

  const partialCode = buildStaffTicketSearchParams({ ...baseQuery, q: "TK012345" });
  assert.equal(partialCode.get("ticket_code"), null);
  assert.equal(partialCode.get("passenger_name"), "TK012345");

  const byPhone = buildStaffTicketSearchParams({ ...baseQuery, q: " 0901234567 " });
  assert.equal(byPhone.get("passenger_phone"), "0901234567");
  assert.equal(byPhone.get("ticket_code"), null);
  assert.equal(byPhone.get("passenger_name"), null);

  const byName = buildStaffTicketSearchParams({
    ...baseQuery,
    q: " Nguyễn Minh Anh ",
    ticketStatus: "Valid",
    checkInStatus: "CheckedIn",
    departureId: 5,
  });
  assert.equal(byName.get("passenger_name"), "Nguyễn Minh Anh");
  assert.equal(byName.get("status"), "Valid");
  assert.equal(byName.get("check_in_status"), "CheckedIn");
  assert.equal(byName.get("departure_id"), "5");
});

test("M01 DTO mappers map invoice summary, detail, ticket results, departures, and totals faithfully", () => {
  const summaryDto = {
    invoice_id: 4,
    payment_code: "GT09CCC8402F",
    total_amount: "986000",
    status: "Paid",
    expires_at: "2026-11-23T15:48:00.000Z",
    created_at: "2026-11-23T15:33:00.000Z",
    responsible_name_snapshot: "Demo RouteMgr",
    responsible_role_snapshot: "RouteMgr",
    customer: { user_id: 1, full_name: "Demo Customer", phone: "0000000000" },
    departure: {
      departure_id: 5,
      trip_name: "Trekking Núi Bà Đen",
      departure_date: "2026-12-20T00:00:00.000Z",
    },
    ticket_count: 2,
  };

  const summaryView = mapStaffInvoiceSummaryToView(summaryDto);
  assert.equal(summaryView.invoiceId, 4);
  assert.equal(summaryView.paymentCode, "GT09CCC8402F");
  assert.equal(summaryView.ticketCount, 2);
  assert.deepEqual(summaryView.tickets, []);
  assert.equal(summaryView.customerEmail, null);

  const detailDto = {
    ...summaryDto,
    tickets: [
      {
        detail_id: 8,
        dep_seat_id: 65,
        seat_name: "A1",
        passenger_name: "Nguyễn Minh Anh",
        passenger_phone: "0901234567",
        emergency_contact: "0909999999",
        unit_price: "493000",
        status: "Valid",
        check_in_status: "CheckedIn",
        check_in_time: "2026-12-20T01:00:00.000Z",
        pickup: {
          dep_pickup_id: 10,
          name: "Điểm khởi hành trung tâm TP.HCM",
          address: "177 Phan Chu Trinh",
          pickup_time: "2026-12-19T23:00:00.000Z",
        },
      },
    ],
    payments: [],
  };
  const detailView = mapStaffInvoiceDetailToView(detailDto);
  assert.equal(detailView.tickets.length, 1);
  assert.equal(detailView.tickets[0].seatName, "A1");
  assert.equal(detailView.tickets[0].pickupName, "Điểm khởi hành trung tâm TP.HCM");
  assert.equal(detailView.tickets[0].pickupAddress, "177 Phan Chu Trinh");
  assert.equal(detailView.tickets[0].pickupAt, "2026-12-19T23:00:00.000Z");
  assert.equal(detailView.tickets[0].unitPrice, "493000");

  const ticketDto = {
    detail_id: 8,
    invoice_id: 4,
    passenger_name: "Nguyễn Minh Anh",
    passenger_phone: "0901234567",
    unit_price: "493000",
    status: "Valid",
    check_in_status: "Pending",
    check_in_time: null,
    seat_name: "A1",
    departure: summaryDto.departure,
    invoice: {
      payment_code: "GT09CCC8402F",
      status: "Paid",
      responsible_name_snapshot: "Demo RouteMgr",
    },
  };
  const ticketView = mapStaffTicketToView(ticketDto);
  assert.equal(ticketView.customerId, null);
  assert.equal(ticketView.customerName, "—");
  assert.equal(ticketView.responsibleRoleSnapshot, null);
  assert.equal(ticketView.pickupName, null);
  assert.equal(ticketView.pickupAddress, null);
  assert.equal(ticketView.pickupAt, null);
  assert.equal(ticketView.responsibleNameSnapshot, "Demo RouteMgr");
  assert.equal("ticket_code" in ticketView, false);

  const pageResult = mapStaffManagementPage(
    { ...baseQuery, page: 1 },
    { items: [summaryDto, { ...summaryDto, invoice_id: 3 }], pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 } },
    { items: [ticketDto], pagination: { page: 1, pageSize: 10, totalItems: 12, totalPages: 2 } },
  );
  assert.equal(pageResult.departures.length, 1);
  assert.equal(pageResult.departures[0].departureId, 5);
  assert.deepEqual(pageResult.responsibleStaffOptions, []);
  assert.equal(pageResult.totalInvoices, 2);
  assert.equal(pageResult.totalTickets, 12);
  assert.equal(pageResult.totalPages, 2);
});

test("staffInvoiceSource queries M01 list and detail endpoints with strict parameters", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), cache: init?.cache });
    if (String(url).startsWith("/api/staff/invoices?")) {
      return new Response(JSON.stringify({ data: { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } } }), { status: 200 });
    }
    if (String(url).startsWith("/api/staff/tickets?")) {
      return new Response(JSON.stringify({ data: { items: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Not found" } }), { status: 404 });
  };
  try {
    const controller = new AbortController();
    const res = await staffInvoiceSource.readManagementPage(
      { ...baseQuery, q: "TK0123456789ABCDEF0123" },
      controller.signal,
    );
    assert.equal(res.totalInvoices, 0);
    assert.equal(res.totalTickets, 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].cache, "no-store");
    assert.equal(calls[0].url, "/api/staff/invoices?page=1&pageSize=10&search=TK0123456789ABCDEF0123");
    assert.equal(calls[1].url, "/api/staff/tickets?page=1&pageSize=10&ticket_code=TK0123456789ABCDEF0123");

    await assert.rejects(
      staffInvoiceSource.readInvoiceDetail(999, controller.signal),
      (err) => err?.status === 404 && err?.code === "NOT_FOUND",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
