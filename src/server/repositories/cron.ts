import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Transaction } from "./database";

export type DepartureToClose = { departure_id: number; reason: "deadline" | "sold_out" };

// Lock invoice IDs first, in the same order as booking and payment. Busy rows are retried on the next invocation.
export async function lockExpiredInvoices(tx: Transaction, now: Date, limit: number): Promise<number[]> {
  const rows = await tx.$queryRaw<{ invoice_id: number }[]>`
    SELECT i.invoice_id FROM invoices i
    WHERE i.status = 'Pending' AND i.expires_at <= ${now.toISOString()}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM invoice_details t WHERE t.invoice_id = i.invoice_id AND t.status = 'Valid')
      AND NOT EXISTS (SELECT 1 FROM departure_seats s WHERE s.invoice_id = i.invoice_id AND s.status = 'Sold')
    ORDER BY i.invoice_id LIMIT ${limit} FOR UPDATE OF i SKIP LOCKED`;
  return rows.map(row => row.invoice_id);
}

export async function lockInvoiceSeats(tx: Transaction, invoiceIds: number[]): Promise<void> {
  if (!invoiceIds.length) return;
  await tx.$queryRaw`SELECT dep_seat_id FROM departure_seats WHERE invoice_id IN (${Prisma.join(invoiceIds)})
    ORDER BY dep_seat_id FOR UPDATE`;
}

// Recheck after acquiring locks, so stale snapshots cannot release a paid or valid ticket.
export async function recheckExpiredInvoices(tx: Transaction, invoiceIds: number[], now: Date): Promise<number[]> {
  if (!invoiceIds.length) return [];
  const rows = await tx.$queryRaw<{ invoice_id: number }[]>`
    SELECT i.invoice_id FROM invoices i
    WHERE i.invoice_id IN (${Prisma.join(invoiceIds)}) AND i.status = 'Pending' AND i.expires_at <= ${now.toISOString()}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM invoice_details t WHERE t.invoice_id = i.invoice_id AND t.status = 'Valid')
      AND NOT EXISTS (SELECT 1 FROM departure_seats s WHERE s.invoice_id = i.invoice_id AND s.status = 'Sold')
    ORDER BY i.invoice_id`;
  return rows.map(row => row.invoice_id);
}

// Lock only departures; never wait on invoices while holding a departure lock.
export async function lockClosableDepartures(tx: Transaction, now: Date, limit: number): Promise<number[]> {
  const rows = await tx.$queryRaw<{ departure_id: number }[]>`
    SELECT d.departure_id FROM departures d WHERE d.status = 'Open' AND (
      d.booking_deadline <= ${now.toISOString()}::timestamptz OR (
        EXISTS (SELECT 1 FROM departure_vehicles v JOIN departure_seats s ON s.dep_vehicle_id = v.dep_vehicle_id WHERE v.departure_id = d.departure_id)
        AND NOT EXISTS (SELECT 1 FROM departure_vehicles v JOIN departure_seats s ON s.dep_vehicle_id = v.dep_vehicle_id
                        WHERE v.departure_id = d.departure_id AND s.status <> 'Sold')
      )) ORDER BY d.departure_id LIMIT ${limit} FOR UPDATE OF d SKIP LOCKED`;
  return rows.map(row => row.departure_id);
}

export async function recheckClosableDepartures(tx: Transaction, ids: number[], now: Date): Promise<DepartureToClose[]> {
  if (!ids.length) return [];
  return tx.$queryRaw<DepartureToClose[]>`
    SELECT d.departure_id, CASE WHEN d.booking_deadline <= ${now.toISOString()}::timestamptz THEN 'deadline' ELSE 'sold_out' END AS reason
    FROM departures d WHERE d.departure_id IN (${Prisma.join(ids)}) AND d.status = 'Open' AND (
      d.booking_deadline <= ${now.toISOString()}::timestamptz OR (
        EXISTS (SELECT 1 FROM departure_vehicles v JOIN departure_seats s ON s.dep_vehicle_id = v.dep_vehicle_id WHERE v.departure_id = d.departure_id)
        AND NOT EXISTS (SELECT 1 FROM departure_vehicles v JOIN departure_seats s ON s.dep_vehicle_id = v.dep_vehicle_id
                        WHERE v.departure_id = d.departure_id AND s.status <> 'Sold')
      )) ORDER BY d.departure_id`;
}

export async function closeLockedDepartures(tx: Transaction, ids: number[]): Promise<number> {
  const result = await tx.departure.updateMany({ where: { departure_id: { in: ids }, status: "Open" }, data: { status: "Closed" } });
  return result.count;
}
