import "server-only";
import type { Prisma, PaymentStatus } from "@/generated/prisma/client";
import type { DataClient } from "./database";

export type AdminPaymentFilters = {
  status?: PaymentStatus;
  transactionId?: string;
  referenceCode?: string;
  paymentCode?: string;
  fromDate?: Date;
  toDate?: Date;
  page: number;
  pageSize: number;
};

const paymentSelect = {
  payment_id: true,
  transaction_id: true,
  reference_code: true,
  payment_method: true,
  amount: true,
  status: true,
  raw_payload: true,
  created_at: true,
  invoice: {
    select: {
      invoice_id: true,
      payment_code: true,
      total_amount: true,
      status: true,
      created_at: true,
      expires_at: true,
      responsible_name_snapshot: true,
      customer: {
        select: {
          user_id: true,
          full_name: true,
          email: true,
          phone: true,
        },
      },
      departure: {
        select: {
          departure_id: true,
          departure_date: true,
          status: true,
          trip: { select: { name: true } },
        },
      },
      seats: {
        select: {
          dep_seat_id: true,
          status: true,
          invoice_id: true,
        },
      },
      _count: { select: { details: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

export async function pageAdminPayments(db: DataClient, filters: AdminPaymentFilters) {
  const where: Prisma.PaymentWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.transactionId ? { transaction_id: { contains: filters.transactionId, mode: "insensitive" } } : {}),
    ...(filters.referenceCode ? { reference_code: { contains: filters.referenceCode, mode: "insensitive" } } : {}),
    ...(filters.paymentCode ? { invoice: { payment_code: { contains: filters.paymentCode, mode: "insensitive" } } } : {}),
    ...(filters.fromDate || filters.toDate ? {
      created_at: {
        ...(filters.fromDate ? { gte: filters.fromDate } : {}),
        ...(filters.toDate ? { lte: filters.toDate } : {}),
      },
    } : {}),
  };

  const rows = await db.payment.findMany({
    where,
    select: paymentSelect,
    orderBy: [{ created_at: "desc" }, { payment_id: "desc" }],
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  const totalItems = await db.payment.count({ where });
  return { rows, totalItems };
}

export function findAdminPayment(db: DataClient, paymentId: number) {
  return db.payment.findUnique({
    where: { payment_id: paymentId },
    select: paymentSelect,
  });
}
