import "server-only";
import type { Prisma, InvoiceStatus, TicketStatus, CheckInStatus } from "@/generated/prisma/client";
import type { DataClient } from "./database";

export type InvoiceFilters = {
  responsibleUserId?: number;
  status?: InvoiceStatus;
  departureId?: number;
  search?: string;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  pageSize: number;
};

export type TicketFilters = {
  responsibleUserId?: number;
  ownedDepartureUserId?: number;
  ticketCode?: string;
  departureId?: number;
  passengerPhone?: string;
  passengerName?: string;
  checkInStatus?: CheckInStatus;
  status?: TicketStatus;
  page: number;
  pageSize: number;
};

export async function pageStaffInvoices(db: DataClient, filters: InvoiceFilters) {
  const where: Prisma.InvoiceWhereInput = {
    ...(filters.responsibleUserId !== undefined ? { responsible_user_id: filters.responsibleUserId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.departureId ? { departure_id: filters.departureId } : {}),
    ...(filters.fromDate || filters.toDate ? {
      created_at: {
        ...(filters.fromDate ? { gte: filters.fromDate } : {}),
        ...(filters.toDate ? { lte: filters.toDate } : {}),
      },
    } : {}),
    ...(filters.search ? {
      OR: [
        { payment_code: { contains: filters.search, mode: "insensitive" } },
        { customer: { full_name: { contains: filters.search, mode: "insensitive" } } },
        { customer: { phone: { contains: filters.search } } },
      ],
    } : {}),
  };

  const rows = await db.invoice.findMany({
    where,
    select: {
      invoice_id: true,
      payment_code: true,
      total_amount: true,
      status: true,
      expires_at: true,
      created_at: true,
      responsible_user_id: true,
      responsible_name_snapshot: true,
      responsible_role_snapshot: true,
      customer: { select: { user_id: true, full_name: true, phone: true } },
      departure: {
        select: {
          departure_id: true,
          departure_date: true,
          trip: { select: { name: true } },
        },
      },
      _count: { select: { details: true } },
    },
    orderBy: [{ created_at: "desc" }, { invoice_id: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  const totalItems = await db.invoice.count({ where });
  return { rows, totalItems };
}

export function findStaffInvoiceDetail(db: DataClient, invoiceId: number, responsibleUserId?: number) {
  return db.invoice.findFirst({
    where: {
      invoice_id: invoiceId,
      ...(responsibleUserId !== undefined ? { responsible_user_id: responsibleUserId } : {}),
    },
    select: {
      invoice_id: true,
      payment_code: true,
      total_amount: true,
      status: true,
      expires_at: true,
      created_at: true,
      responsible_user_id: true,
      responsible_name_snapshot: true,
      responsible_role_snapshot: true,
      customer: { select: { user_id: true, full_name: true, phone: true } },
      departure: {
        select: {
          departure_id: true,
          departure_date: true,
          trip: { select: { name: true } },
        },
      },
      details: {
        orderBy: [{ dep_seat_id: "asc" }, { detail_id: "asc" }],
        select: {
          detail_id: true,
          dep_seat_id: true,
          passenger_name: true,
          passenger_phone: true,
          emergency_contact: true,
          unit_price: true,
          status: true,
          check_in_status: true,
          check_in_time: true,
          seat: { select: { seat: { select: { seat_name: true } } } },
          pickup: {
            select: {
              dep_pickup_id: true,
              pickup_time: true,
              pickup: { select: { name: true, address: true } },
            },
          },
        },
      },
      payments: {
        orderBy: [{ created_at: "desc" }],
        select: {
          payment_id: true,
          amount: true,
          status: true,
          created_at: true,
        },
      },
    },
  });
}

export async function pageStaffTickets(db: DataClient, filters: TicketFilters) {
  const scopeCondition: Prisma.InvoiceDetailWhereInput = {};
  if (filters.responsibleUserId !== undefined || filters.ownedDepartureUserId !== undefined) {
    scopeCondition.OR = [
      ...(filters.responsibleUserId !== undefined ? [{ invoice: { responsible_user_id: filters.responsibleUserId } }] : []),
      ...(filters.ownedDepartureUserId !== undefined ? [{ invoice: { departure: { invoice_owner_user_id: filters.ownedDepartureUserId } } }] : []),
    ];
  }

  const where: Prisma.InvoiceDetailWhereInput = {
    ...scopeCondition,
    ...(filters.ticketCode ? { ticket_code: filters.ticketCode } : {}),
    ...(filters.departureId ? { invoice: { departure_id: filters.departureId } } : {}),
    ...(filters.passengerPhone ? { passenger_phone: { contains: filters.passengerPhone } } : {}),
    ...(filters.passengerName ? { passenger_name: { contains: filters.passengerName, mode: "insensitive" } } : {}),
    ...(filters.checkInStatus ? { check_in_status: filters.checkInStatus } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const rows = await db.invoiceDetail.findMany({
    where,
    select: {
      detail_id: true,
      invoice_id: true,
      passenger_name: true,
      passenger_phone: true,
      unit_price: true,
      status: true,
      check_in_status: true,
      check_in_time: true,
      seat: { select: { seat: { select: { seat_name: true } } } },
      invoice: {
        select: {
          payment_code: true,
          status: true,
          responsible_name_snapshot: true,
          departure: {
            select: {
              departure_id: true,
              departure_date: true,
              trip: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ detail_id: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  const totalItems = await db.invoiceDetail.count({ where });
  return { rows, totalItems };
}
