import assert from "node:assert/strict";
import { test } from "node:test";
import { issuedTicketCode, privateReadScope, invoiceLookupPath, ticketViewFromDto, paymentReviewViewFromDto, adminPaymentSearch,
  ticketSearch, customerTicketSource, adminPaymentSource } from "../src/lib/payment-ui.ts";
import { ticketQuerySchema } from "../src/schemas/ticket.ts";
import { adminPaymentQuerySchema } from "../src/schemas/admin-payment.ts";
import { BookingClientError } from "../src/lib/booking-client.ts";

test("only a Paid invoice plus a Valid ticket exposes its server-issued opaque QR payload", () => {
  const ticket = { invoiceStatus: "Paid", status: "Valid", issuedCode: " issued-code-from-server " };
  assert.equal(issuedTicketCode(ticket), " issued-code-from-server ", "encode the exact issued value, never reconstruct an ID");
  for (const invoiceStatus of ["Pending", "Expired", "Cancelled"]) assert.equal(issuedTicketCode({ ...ticket, invoiceStatus }), null);
  for (const status of ["Pending", "Cancelled"]) assert.equal(issuedTicketCode({ ...ticket, status }), null);
  for (const issuedCode of [null, "", "   "]) assert.equal(issuedTicketCode({ ...ticket, issuedCode }), null);
});

test("private list UI scopes are unavailable before auth and change when account or role changes", () => {
  assert.equal(privateReadScope("tickets", "loading", { user_id: 7, role: "Customer" }), null);
  assert.equal(privateReadScope("tickets", "unauthenticated", { user_id: 7, role: "Customer" }), null);
  assert.equal(privateReadScope("tickets", "authenticated", { user_id: 7, role: "Customer" }), "tickets:Customer:7");
  assert.notEqual(privateReadScope("tickets", "authenticated", { user_id: 8, role: "Customer" }), "tickets:Customer:7");
  for (const role of ["Customer", "Leader", "RouteMgr", "HRMgr"]) assert.equal(privateReadScope("payments", "authenticated", { user_id: 7, role }), null);
  assert.equal(privateReadScope("payments", "authenticated", { user_id: 7, role: "Admin" }), "payments:Admin:7");
  assert.equal(privateReadScope("tickets", "authenticated", { user_id: 7, role: "Leader" }), null);
});

test("invoice lookup only links to an existing checkout route for a canonical positive int ID", () => {
  assert.equal(invoiceLookupPath("28"), "/checkout/invoices/28");
  for (const value of ["0", "-1", "01", "1.5", "../admin", "https://bad.invalid", "2147483648", ""]) assert.equal(invoiceLookupPath(value), null);
});

// P05 data sources: map the real P04/P03 DTOs, and send only query parameters the strict server schemas accept.
const ticketDto = { detail_id: 5, invoice_id: 3, invoice_status: "Paid", invoice_expires_at: "2035-01-01T00:15:00.000Z", hold_expired: false,
  status: "Valid", check_in_status: "Pending", ticket_code: "TK0123456789ABCDEF0123", trip_name: "Núi Bà Đen", departure_id: 9,
  departure_date: "2035-01-02T02:00:00.000Z", passenger_name: "Khách A", seat_name: "B03",
  pickup: { name: "Bến xe", address: "292 Đinh Bộ Lĩnh", pickup_time: "2035-01-01T22:30:00.000Z" }, unit_price: "500000",
  responsible_name_snapshot: "Nhân viên phụ trách" };
const paymentDto = { payment_id: 11, transaction_id: "93001", reference_code: "FT1", payment_method: "Transfer", amount: "400000",
  status: "NeedsReview", created_at: "2035-01-01T01:00:00.000Z", review_reason: "underpaid",
  invoice: { invoice_id: 3, payment_code: "GTAB12CD34EF", total_amount: "500000", status: "Pending", created_at: "2035-01-01T00:00:00.000Z",
    expires_at: "2035-01-01T00:15:00.000Z", difference: "-100000", responsible_name_snapshot: "Nhân viên phụ trách",
    customer: { user_id: 1, full_name: "Khách", email: "k@example.test", phone: "0900000000" },
    departure: { departure_id: 9, trip_name: "Núi Bà Đen", departure_date: "2035-01-02T02:00:00.000Z", status: "Open" } } };

test("P04 tickets map to cards; a Pending hold past its deadline reads as expired from the server's verdict", () => {
  const view = ticketViewFromDto(ticketDto);
  assert.deepEqual(view, { id: 5, invoiceId: 3, invoiceStatus: "Paid", status: "Valid", issuedCode: "TK0123456789ABCDEF0123",
    tripName: "Núi Bà Đen", departureAt: "2035-01-02T02:00:00.000Z", passengerName: "Khách A", seatLabel: "B03", pickupName: "Bến xe",
    pickupAddress: "292 Đinh Bộ Lĩnh", pickupAt: "2035-01-01T22:30:00.000Z", unitPrice: "500000", responsibleName: "Nhân viên phụ trách" });
  assert.equal(issuedTicketCode(view), "TK0123456789ABCDEF0123");
  const stale = ticketViewFromDto({ ...ticketDto, invoice_status: "Pending", hold_expired: true, status: "Pending", ticket_code: null });
  assert.equal(stale.invoiceStatus, "Expired");
  assert.equal(issuedTicketCode(stale), null);
  const live = ticketViewFromDto({ ...ticketDto, invoice_status: "Pending", hold_expired: false, status: "Pending", ticket_code: null });
  assert.equal(live.invoiceStatus, "Pending");
});

test("P03 payments map to review rows with a readable reason and the invoice snapshot", () => {
  const row = paymentReviewViewFromDto(paymentDto);
  assert.equal(row.reason, "Số tiền nhận thấp hơn tổng hóa đơn");
  assert.deepEqual(row.invoice, { id: 3, paymentCode: "GTAB12CD34EF", totalAmount: "500000", status: "Pending", tripName: "Núi Bà Đen",
    responsibleName: "Nhân viên phụ trách" });
  assert.equal(paymentReviewViewFromDto({ ...paymentDto, status: "Success", review_reason: "confirmed_success" }).reason, null);
  assert.equal(paymentReviewViewFromDto({ ...paymentDto, review_reason: "unmatched_payment_code", invoice: null }).invoice, null);
  for (const reason of ["unmatched_payment_code", "underpaid", "invoice_already_paid", "invoice_not_payable", "departure_not_selling",
    "no_tickets", "departure_already_started", "seats_taken", "unexplained"]) {
    assert.ok(paymentReviewViewFromDto({ ...paymentDto, review_reason: reason }).reason, reason);
  }
});

test("UI query parameters are exactly what the strict P04/P03 schemas accept", () => {
  for (const filter of ["all", "valid", "pending", "expired", "bogus"]) {
    const params = Object.fromEntries(ticketSearch({ page: 2, filter, query: "" }));
    assert.ok(ticketQuerySchema.safeParse(params).success, filter);
    assert.equal(params.status, ["valid", "pending", "expired"].includes(filter) ? filter : undefined);
  }
  assert.deepEqual(Object.fromEntries(adminPaymentSearch({ page: 1, filter: "NeedsReview", query: " 93001 " })),
    { page: "1", pageSize: "10", status: "NeedsReview", transaction_id: "93001" });
  assert.deepEqual(Object.fromEntries(adminPaymentSearch({ page: 3, filter: "all", query: "GTAB12" })),
    { page: "3", pageSize: "10", payment_code: "GTAB12" });
  for (const query of [{ page: 1, filter: "Success", query: "" }, { page: 1, filter: "all", query: "GTAB12" },
    { page: 1, filter: "NeedsReview", query: "93001" }]) {
    assert.ok(adminPaymentQuerySchema.safeParse(Object.fromEntries(adminPaymentSearch(query))).success, JSON.stringify(query));
  }
});

test("data sources read the private APIs without caching and keep HTTP failures distinguishable", async () => {
  const original = globalThis.fetch;
  const calls = [];
  const reply = (status, body) => async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
  try {
    globalThis.fetch = reply(200, { data: { items: [ticketDto], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } } });
    const tickets = await customerTicketSource({ page: 1, filter: "valid", query: "" }, new AbortController().signal);
    assert.equal(calls.at(-1).url, "/api/account/tickets?page=1&pageSize=10&status=valid");
    assert.equal(calls.at(-1).init.cache, "no-store");
    assert.deepEqual([tickets.page, tickets.totalPages, tickets.totalItems, tickets.items[0].id], [1, 1, 1, 5]);

    globalThis.fetch = reply(200, { data: { items: [paymentDto], pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 } } });
    const payments = await adminPaymentSource({ page: 1, filter: "NeedsReview", query: "" }, new AbortController().signal);
    assert.equal(calls.at(-1).url, "/api/admin/payments?page=1&pageSize=10&status=NeedsReview");
    assert.equal(payments.items[0].reason, "Số tiền nhận thấp hơn tổng hóa đơn");

    globalThis.fetch = reply(401, { error: { code: "UNAUTHENTICATED", message: "Vui lòng đăng nhập lại." } });
    await assert.rejects(customerTicketSource({ page: 1, filter: "all", query: "" }, new AbortController().signal),
      (error) => error instanceof BookingClientError && error.status === 401);
    globalThis.fetch = reply(200, { nothing: true });
    await assert.rejects(adminPaymentSource({ page: 1, filter: "all", query: "" }, new AbortController().signal),
      (error) => error instanceof BookingClientError && error.status === 502);
  } finally { globalThis.fetch = original; }
});
