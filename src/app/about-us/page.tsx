"use client";

import { useMemo, useState } from "react";
import { SessionContext } from "next-auth/react";
import type { Session } from "next-auth";
import { StaffInvoiceShell } from "@/components/invoices/staff-invoice-shell";
import { InvoiceManagementWorkspace } from "@/components/invoices/invoice-management-workspace";
import type { InvoiceManagementPageResult, InvoiceManagementSource, ManagedInvoiceView, ManagedTicketView } from "@/lib/invoice-management-ui";

const sampleInvoices: ManagedInvoiceView[] = [
  {
    invoiceId: 108, paymentCode: "TB000108", departureId: 301, tripName: "Trail Bus – Bà Đen",
    departureAt: "2026-11-21T22:30:00.000Z", customerId: 21, customerName: "Trần Khách Trekking",
    customerEmail: "khach.trek@gotrail.local", customerPhone: "0901234567", status: "Paid", totalAmount: "466000",
    createdAt: "2026-11-16T03:00:00.000Z", expiresAt: "2026-11-16T03:15:00.000Z",
    responsibleNameSnapshot: "Phạm Quản Lý Tuyến", responsibleRoleSnapshot: "RouteMgr",
    tickets: [
      { detailId: 901, seatName: "A01", passengerName: "Trần Khách Trekking", pickupName: "Nhà văn hóa Thanh Niên Q.1", pickupAt: "2026-11-21T22:00:00.000Z", unitPrice: "233000", status: "Valid", checkInStatus: "CheckedIn" },
      { detailId: 902, seatName: "A02", passengerName: "Lê Bạn Đồng Hành", pickupName: "Ngã tư Hàng Xanh", pickupAt: "2026-11-21T22:20:00.000Z", unitPrice: "233000", status: "Valid", checkInStatus: "Pending" },
    ],
  },
  {
    invoiceId: 109, paymentCode: "TB000109", departureId: 302, tripName: "Trail Bus – Chứa Chan",
    departureAt: "2026-11-22T22:00:00.000Z", customerId: 22, customerName: "Nguyễn Minh Anh",
    status: "Pending", totalAmount: "186000", createdAt: "2026-11-18T08:10:00.000Z", expiresAt: "2026-11-18T08:25:00.000Z",
    responsibleNameSnapshot: "Phạm Quản Lý Tuyến", responsibleRoleSnapshot: "RouteMgr",
    tickets: [{ detailId: 903, seatName: "B04", passengerName: "Nguyễn Minh Anh", pickupName: "Nhà văn hóa Thanh Niên Q.1", pickupAt: "2026-11-22T21:45:00.000Z", unitPrice: "186000", status: "Pending", checkInStatus: "Pending" }],
  },
  {
    invoiceId: 110, paymentCode: "TB000110", departureId: 301, tripName: "Trail Bus – Bà Đen",
    departureAt: "2026-11-21T22:30:00.000Z", customerId: 23, customerName: "Hoàng Gia Huy",
    status: "Paid", totalAmount: "233000", createdAt: "2026-11-15T10:00:00.000Z", expiresAt: "2026-11-15T10:15:00.000Z",
    responsibleNameSnapshot: "Đặng Điều Phối Tuyến", responsibleRoleSnapshot: "RouteMgr",
    tickets: [{ detailId: 904, seatName: "C03", passengerName: "Hoàng Gia Huy", pickupName: "Ngã tư Hàng Xanh", pickupAt: "2026-11-21T22:20:00.000Z", unitPrice: "233000", status: "Valid", checkInStatus: "Absent" }],
  },
];

const sampleTickets: ManagedTicketView[] = sampleInvoices.flatMap((inv) =>
  inv.tickets.map((t) => ({
    detailId: t.detailId, invoiceId: inv.invoiceId, paymentCode: inv.paymentCode, invoiceStatus: inv.status,
    departureId: inv.departureId, tripName: inv.tripName, departureAt: inv.departureAt, customerId: inv.customerId,
    customerName: inv.customerName, passengerName: t.passengerName, seatName: t.seatName, pickupName: t.pickupName,
    pickupAt: t.pickupAt, unitPrice: t.unitPrice, status: t.status, checkInStatus: t.checkInStatus,
    responsibleNameSnapshot: inv.responsibleNameSnapshot, responsibleRoleSnapshot: inv.responsibleRoleSnapshot,
  })),
);

export default function InvoicePreviewHarness() {
  const [scenario, setScenario] = useState<"admin-ready" | "routemgr-assigned">("admin-ready");
  const session: Session = useMemo(() => ({
    expires: "2026-12-31T00:00:00.000Z",
    user: {
      id: scenario === "routemgr-assigned" ? "3" : "1",
      user_id: scenario === "routemgr-assigned" ? 3 : 1,
      name: scenario === "routemgr-assigned" ? "Phạm Quản Lý Tuyến" : "Vũ Quản Trị Hệ Thống",
      email: "preview@gotrail.local",
      role: scenario === "routemgr-assigned" ? "RouteMgr" : "Admin",
      status: "Active",
      auth_version: 0,
    },
  }), [scenario]);

  const source: InvoiceManagementSource = useMemo(() => ({
    async readManagementPage(): Promise<InvoiceManagementPageResult> {
      const invoices = scenario === "routemgr-assigned"
        ? sampleInvoices.filter((i) => i.responsibleNameSnapshot === "Phạm Quản Lý Tuyến")
        : sampleInvoices;
      const tickets = scenario === "routemgr-assigned"
        ? sampleTickets.filter((t) => t.responsibleNameSnapshot === "Phạm Quản Lý Tuyến")
        : sampleTickets;
      return {
        invoices, tickets,
        departures: [{ departureId: 301, tripName: "Trail Bus – Bà Đen", departureAt: "2026-11-21T22:30:00.000Z" }],
        responsibleStaffOptions: [{ userId: 3, fullName: "Phạm Quản Lý Tuyến" }, { userId: 5, fullName: "Đặng Điều Phối Tuyến" }],
        page: 1, totalPages: 1, totalInvoices: invoices.length, totalTickets: tickets.length,
      };
    },
  }), [scenario]);

  const value = useMemo(() => ({ data: session, status: "authenticated" as const, update: async () => session }), [session]);

  return (
    <SessionContext.Provider value={value}>
      <div className="border-b border-neutral-300 bg-neutral-100 px-4 py-2 text-xs">
        <select id="preview-scenario" value={scenario} onChange={(e) => setScenario(e.target.value as "admin-ready" | "routemgr-assigned")} className="min-h-9 rounded border border-[#6B7280] bg-white px-2 text-xs font-semibold">
          <option value="admin-ready">Admin</option>
          <option value="routemgr-assigned">RouteMgr</option>
        </select>
      </div>
      <StaffInvoiceShell>
        <InvoiceManagementWorkspace source={source} />
      </StaffInvoiceShell>
    </SessionContext.Provider>
  );
}
