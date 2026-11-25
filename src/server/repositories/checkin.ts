import "server-only";
import type { CheckInStatus, Prisma } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

// Allowlisted manifest projection (PRD 3.3): no ticket_code, invoice/payment data, email or health declaration.
const passengerSelect = {
  detail_id: true, passenger_name: true, passenger_phone: true, emergency_contact: true,
  check_in_status: true, check_in_time: true,
  seat: { select: { seat: { select: { seat_name: true } },
    vehicle: { select: { dep_vehicle_id: true, vehicle: { select: { plate_number: true } } } } } },
  pickup: { select: { dep_pickup_id: true, pickup_time: true, pickup: { select: { name: true, address: true } } } },
} satisfies Prisma.InvoiceDetailSelect;
export type PassengerRow = Prisma.InvoiceDetailGetPayload<{ select: typeof passengerSelect }>;

// A passenger is a Valid ticket of a Paid invoice: unpaid holds and cancelled tickets never board.
const boarding = (departureId: number) =>
  ({ status: "Valid", invoice: { departure_id: departureId, status: "Paid" } }) satisfies Prisma.InvoiceDetailWhereInput;

export function findManifestDeparture(db: DataClient, departureId: number) {
  return db.departure.findUnique({ where: { departure_id: departureId },
    select: { departure_id: true, departure_date: true, status: true, trip: { select: { name: true } } } });
}

// Shared lock: a status change (O05/L02) or crew change locks the departure FOR UPDATE, so neither can
// slip between this check and the check-in write. Shared with other check-ins and P02 (also FOR SHARE).
export async function lockCheckInDeparture(tx: Transaction, departureId: number) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM departures WHERE departure_id = ${departureId} FOR SHARE`;
  return rows[0] ?? null;
}

// The same rule as the Leader departure list: an Active Leader profile assigned as Leader.
export function countLeaderAssignments(db: DataClient, departureId: number, userId: number) {
  return db.departureStaff.count({ where: { departure_id: departureId, role_in_trip: "Leader",
    staff: { user_id: userId, staff_type: "Leader", status: "Active" } } });
}

// Drivers and assistants only (PRD 3.3); Leaders already reach each other through operations.
export function findManifestCrew(db: DataClient, departureId: number) {
  return db.departureStaff.findMany({ where: { departure_id: departureId, role_in_trip: { in: ["Driver", "Assistant"] } },
    select: { role_in_trip: true, staff: { select: { full_name: true, phone: true } },
      vehicle: { select: { dep_vehicle_id: true, vehicle: { select: { plate_number: true } } } } },
    orderBy: [{ dep_vehicle_id: "asc" }, { role_in_trip: "asc" }, { dep_staff_id: "asc" }] });
}

export function findManifestPassengers(db: DataClient, departureId: number) {
  return db.invoiceDetail.findMany({ where: boarding(departureId), select: passengerSelect,
    orderBy: [{ pickup: { pickup_time: "asc" } }, { dep_pickup_id: "asc" }, { dep_seat_id: "asc" }, { detail_id: "asc" }] });
}

export function findTicketByCode(db: DataClient, ticketCode: string) {
  return db.invoiceDetail.findUnique({ where: { ticket_code: ticketCode },
    select: { detail_id: true, invoice: { select: { departure_id: true } } } });
}

// Row lock, then re-read: two scans of one ticket serialize here and the second sees the first one's result.
export async function lockTicket(tx: Transaction, detailId: number) {
  await tx.$queryRaw`SELECT detail_id FROM invoice_details WHERE detail_id = ${detailId} FOR UPDATE`;
  return tx.invoiceDetail.findUnique({ where: { detail_id: detailId },
    select: { ...passengerSelect, status: true, invoice: { select: { departure_id: true, status: true } } } });
}

export function setCheckIn(tx: Transaction, detailId: number, status: CheckInStatus, at: Date | null) {
  return tx.invoiceDetail.update({ where: { detail_id: detailId }, data: { check_in_status: status, check_in_time: at },
    select: passengerSelect });
}
