import assert from "node:assert/strict";
import { test } from "node:test";
import { issuedTicketCode, privateReadScope, invoiceLookupPath } from "../src/lib/payment-ui.ts";

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
