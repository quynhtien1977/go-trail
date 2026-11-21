import "server-only";
import type { z } from "zod";
import type { Database } from "@/server/repositories/database";
import * as staffInvoices from "@/server/repositories/staff-invoices";
import {
  staffInvoiceQuerySchema,
  staffTicketQuerySchema,
  type StaffInvoiceSummaryDto,
  type StaffInvoiceDetailDto,
  type StaffTicketSearchResultDto,
} from "@/schemas/staff-invoice";
import type { Page } from "@/schemas/catalog";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}

function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}

async function staffInvoiceActor(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["RouteMgr"]);
  return actor;
}

export async function listStaffInvoices(
  db: Database,
  identity: Actor,
  input: unknown = {}
): Promise<Page<StaffInvoiceSummaryDto>> {
  const query = parse(staffInvoiceQuerySchema, input);
  const actor = await staffInvoiceActor(db, identity);

  const responsibleUserId = actor.role === "Admin" ? query.responsible_user_id : actor.user_id;

  const { rows, totalItems } = await staffInvoices.pageStaffInvoices(db, {
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    departureId: query.departure_id,
    responsibleUserId,
    search: query.search,
    fromDate: query.from_date ? new Date(query.from_date) : undefined,
    toDate: query.to_date ? new Date(query.to_date) : undefined,
  });

  const items: StaffInvoiceSummaryDto[] = rows.map((row) => ({
    invoice_id: row.invoice_id,
    payment_code: row.payment_code,
    total_amount: row.total_amount.toFixed(0),
    status: row.status,
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
    responsible_name_snapshot: row.responsible_name_snapshot,
    responsible_role_snapshot: row.responsible_role_snapshot,
    customer: {
      user_id: row.customer.user_id,
      full_name: row.customer.full_name,
      phone: row.customer.phone,
    },
    departure: {
      departure_id: row.departure.departure_id,
      trip_name: row.departure.trip.name,
      departure_date: row.departure.departure_date.toISOString(),
    },
    ticket_count: row._count.details,
  }));

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function readStaffInvoice(
  db: Database,
  identity: Actor,
  invoiceId: number
): Promise<StaffInvoiceDetailDto> {
  assertId(invoiceId);
  const actor = await staffInvoiceActor(db, identity);

  const responsibleUserId = actor.role === "Admin" ? undefined : actor.user_id;
  const row = await staffInvoices.findStaffInvoiceDetail(db, invoiceId, responsibleUserId);
  if (!row) throw new AppError("NOT_FOUND", 404);

  return {
    invoice_id: row.invoice_id,
    payment_code: row.payment_code,
    total_amount: row.total_amount.toFixed(0),
    status: row.status,
    expires_at: row.expires_at.toISOString(),
    created_at: row.created_at.toISOString(),
    responsible_name_snapshot: row.responsible_name_snapshot,
    responsible_role_snapshot: row.responsible_role_snapshot,
    customer: {
      user_id: row.customer.user_id,
      full_name: row.customer.full_name,
      phone: row.customer.phone,
    },
    departure: {
      departure_id: row.departure.departure_id,
      trip_name: row.departure.trip.name,
      departure_date: row.departure.departure_date.toISOString(),
    },
    ticket_count: row.details.length,
    tickets: row.details.map((d) => ({
      detail_id: d.detail_id,
      dep_seat_id: d.dep_seat_id,
      seat_name: d.seat.seat.seat_name,
      passenger_name: d.passenger_name,
      passenger_phone: d.passenger_phone,
      emergency_contact: d.emergency_contact,
      health_declaration: d.health_declaration,
      unit_price: d.unit_price.toFixed(0),
      ticket_code: d.ticket_code,
      status: d.status,
      check_in_status: d.check_in_status,
      check_in_time: d.check_in_time ? d.check_in_time.toISOString() : null,
      pickup: {
        dep_pickup_id: d.pickup.dep_pickup_id,
        name: d.pickup.pickup.name,
        address: d.pickup.pickup.address,
        pickup_time: d.pickup.pickup_time.toISOString(),
      },
    })),
    payments: row.payments.map((p) => ({
      payment_id: p.payment_id,
      transaction_id: p.transaction_id,
      reference_code: p.reference_code,
      amount: p.amount.toFixed(0),
      status: p.status,
      created_at: p.created_at.toISOString(),
    })),
  };
}

export async function searchStaffTickets(
  db: Database,
  identity: Actor,
  input: unknown = {}
): Promise<Page<StaffTicketSearchResultDto>> {
  const query = parse(staffTicketQuerySchema, input);
  const actor = await staffInvoiceActor(db, identity);

  const scopeFilter = actor.role === "Admin" ? {} : {
    responsibleUserId: actor.user_id,
    ownedDepartureUserId: actor.user_id,
  };

  const { rows, totalItems } = await staffInvoices.pageStaffTickets(db, {
    ...scopeFilter,
    page: query.page,
    pageSize: query.pageSize,
    ticketCode: query.ticket_code,
    departureId: query.departure_id,
    passengerPhone: query.passenger_phone,
    passengerName: query.passenger_name,
    checkInStatus: query.check_in_status,
    status: query.status,
  });

  const items: StaffTicketSearchResultDto[] = rows.map((row) => ({
    detail_id: row.detail_id,
    invoice_id: row.invoice_id,
    ticket_code: row.ticket_code,
    passenger_name: row.passenger_name,
    passenger_phone: row.passenger_phone,
    unit_price: row.unit_price.toFixed(0),
    status: row.status,
    check_in_status: row.check_in_status,
    check_in_time: row.check_in_time ? row.check_in_time.toISOString() : null,
    seat_name: row.seat.seat.seat_name,
    departure: {
      departure_id: row.invoice.departure.departure_id,
      trip_name: row.invoice.departure.trip.name,
      departure_date: row.invoice.departure.departure_date.toISOString(),
    },
    invoice: {
      payment_code: row.invoice.payment_code,
      status: row.invoice.status,
      responsible_name_snapshot: row.invoice.responsible_name_snapshot,
    },
  }));

  return {
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export const staffInvoiceService = bindDb({
  listStaffInvoices,
  readStaffInvoice,
  searchStaffTickets,
});
