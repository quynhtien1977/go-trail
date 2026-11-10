import "server-only";
import type { z } from "zod";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as customers from "@/server/repositories/customers";
import type { Page } from "@/schemas/catalog";
import { customerQuerySchema, type CustomerBookingDto, type CustomerBookingsDto,
  type CustomerDetailDto, type CustomerSummaryDto } from "@/schemas/customer";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

// One page of history per customer; the directory is for support lookups, not reporting exports.
const historyLimit = 50;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
// Admin reads every Customer; RouteMgr is limited to the customers of invoices they are responsible for (PRD 3.3).
async function directoryReader(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["RouteMgr"]);
  return { actor, scope: actor.role === "Admin" ? {} : { responsible_user_id: actor.user_id } };
}
function summary(row: customers.CustomerRow): CustomerSummaryDto {
  return { user_id: row.user_id, full_name: row.full_name, email: row.email, phone: row.phone,
    status: row.status, created_at: row.created_at.toISOString(),
    invoice_count: row._count.invoices, last_booking_at: row.invoices[0]?.created_at.toISOString() ?? null };
}
// Passenger phone/emergency contact stay in the Leader manifest; ticket codes stay in P04.
function booking(row: customers.CustomerBookingRow): CustomerBookingDto {
  return { invoice_id: row.invoice_id, departure_id: row.departure_id, status: row.status,
    total_amount: row.total_amount.toFixed(0), created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(), responsible_name_snapshot: row.responsible_name_snapshot,
    responsible_role_snapshot: row.responsible_role_snapshot, trip_name: row.departure.trip.name,
    departure_date: row.departure.departure_date.toISOString(),
    tickets: row.details.map((ticket) => ({ detail_id: ticket.detail_id, seat_name: ticket.seat.seat.seat_name,
      passenger_name: ticket.passenger_name, status: ticket.status, check_in_status: ticket.check_in_status })) };
}

export async function listCustomers(db: Database, identity: Actor, input: unknown = {}): Promise<Page<CustomerSummaryDto>> {
  const query = parse(customerQuerySchema, input);
  return inTransaction(db, async (tx) => {
    const { scope } = await directoryReader(tx, identity);
    const result = await customers.findCustomerPage(tx, query, scope);
    return { items: result.items.map(summary), pagination: { page: query.page, pageSize: query.pageSize,
      totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / query.pageSize) } };
  }, { isolationLevel: "RepeatableRead" });
}

// A customer outside the reader's scope is reported as NOT_FOUND so the directory cannot be probed for existence.
export async function readCustomer(db: Database, identity: Actor, userId: number): Promise<CustomerDetailDto> {
  assertId(userId);
  return inTransaction(db, async (tx) => {
    const { scope } = await directoryReader(tx, identity);
    const row = await customers.findCustomer(tx, userId, scope);
    if (!row) throw new AppError("NOT_FOUND", 404);
    const history = await customers.findCustomerBookings(tx, userId, scope, historyLimit);
    return { customer: summary(row), bookings: history.map(booking) };
  }, { isolationLevel: "RepeatableRead" });
}

// Customers read their own history only; the actor id is the filter, never a client-supplied id.
export async function listOwnBookings(db: Database, identity: Actor): Promise<CustomerBookingsDto> {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Customer"]);
  const history = await customers.findCustomerBookings(db, actor.user_id, {}, historyLimit);
  return { customer_id: actor.user_id, bookings: history.map(booking) };
}

export const customersService = bindDb({ listCustomers, readCustomer, listOwnBookings });
