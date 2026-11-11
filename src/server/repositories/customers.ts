import "server-only";
import type { Prisma, UserStatus } from "@/generated/prisma/client";
import type { DataClient } from "./database";

// RouteMgr reads only the invoices they are responsible for; Admin passes an empty scope and reads all.
export type InvoiceScope = { responsible_user_id?: number };
export type CustomerPageQuery = { q?: string; status?: UserStatus; page: number; pageSize: number };

const bookingSelect = {
  invoice_id: true, departure_id: true, status: true, total_amount: true, created_at: true, expires_at: true,
  responsible_name_snapshot: true, responsible_role_snapshot: true,
  departure: { select: { departure_date: true, trip: { select: { name: true } } } },
  details: {
    orderBy: [{ dep_seat_id: "asc" }, { detail_id: "asc" }],
    select: { detail_id: true, passenger_name: true, status: true, check_in_status: true,
      seat: { select: { seat: { select: { seat_name: true } } } } },
  },
} satisfies Prisma.InvoiceSelect;
export type CustomerBookingRow = Prisma.InvoiceGetPayload<{ select: typeof bookingSelect }>;

// Never selects password_hash or auth_version; the directory is a read-only projection.
const customerSelect = (scope: InvoiceScope) => ({
  user_id: true, email: true, full_name: true, phone: true, status: true, created_at: true,
  _count: { select: { invoices: { where: scope } } },
  invoices: { where: scope, orderBy: { created_at: "desc" }, take: 1, select: { created_at: true } },
}) satisfies Prisma.UserSelect;
export type CustomerRow = Prisma.UserGetPayload<{ select: ReturnType<typeof customerSelect> }>;

// Staff accounts are managed through STAFF/accounts, so the directory stays limited to Customer rows.
function customerWhere(scope: InvoiceScope, query?: { q?: string; status?: UserStatus }): Prisma.UserWhereInput {
  return {
    role: "Customer",
    ...(scope.responsible_user_id === undefined ? {} : { invoices: { some: scope } }),
    ...(query?.status ? { status: query.status } : {}),
    ...(query?.q ? { OR: [
      { full_name: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
      { phone: { contains: query.q } },
    ] } : {}),
  };
}

export async function findCustomerPage(db: DataClient, query: CustomerPageQuery, scope: InvoiceScope) {
  const where = customerWhere(scope, query);
  const items = await db.user.findMany({ where, select: customerSelect(scope), orderBy: { user_id: "asc" },
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.user.count({ where }) };
}

export function findCustomer(db: DataClient, userId: number, scope: InvoiceScope) {
  return db.user.findFirst({ where: { user_id: userId, ...customerWhere(scope) }, select: customerSelect(scope) });
}

export function findCustomerBookings(db: DataClient, userId: number, scope: InvoiceScope, take: number) {
  return db.invoice.findMany({ where: { customer_id: userId, ...scope }, select: bookingSelect,
    orderBy: [{ created_at: "desc" }, { invoice_id: "desc" }], take });
}
