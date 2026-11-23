import "server-only";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as checkin from "@/server/repositories/checkin";
import { checkInSchema, type CheckInResultDto, type ManifestDto, type ManifestPassengerDto } from "@/schemas/checkin";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

// L01 (SCRUM-37), PRD 3.3 and 5.4. A Leader sees a departure only while it is Confirmed, Running or Ended and
// only when assigned to it; Admin inherits the Leader rights for every departure in those statuses.
const visibleStatuses = ["Confirmed", "Running", "Ended"] as const;
type VisibleStatus = (typeof visibleStatuses)[number];
const isVisible = (status: string | undefined): status is VisibleStatus => visibleStatuses.some((value) => value === status);

function passenger(row: checkin.PassengerRow): ManifestPassengerDto {
  return { detail_id: row.detail_id, seat_name: row.seat.seat.seat_name, passenger_name: row.passenger_name,
    passenger_phone: row.passenger_phone, emergency_contact: row.emergency_contact,
    pickup: { dep_pickup_id: row.pickup.dep_pickup_id, name: row.pickup.pickup.name, address: row.pickup.pickup.address,
      pickup_time: row.pickup.pickup_time.toISOString() },
    vehicle: { dep_vehicle_id: row.seat.vehicle.dep_vehicle_id, plate_number: row.seat.vehicle.vehicle.plate_number },
    check_in_status: row.check_in_status, check_in_time: row.check_in_time?.toISOString() ?? null };
}

async function leader(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Leader"]);
  return actor;
}
// Out of scope and nonexistent look the same (404), so a Leader cannot probe other departures.
async function assertCrew(db: AuthDatabase, actor: Actor, departureId: number, status: string | undefined): Promise<VisibleStatus> {
  if (!isVisible(status)) throw new AppError("NOT_FOUND", 404);
  if (actor.role !== "Admin" && !await checkin.countLeaderAssignments(db, departureId, actor.user_id)) {
    throw new AppError("NOT_FOUND", 404);
  }
  return status;
}

export async function readManifest(db: Database, identity: Actor, departureId: number, now?: Date): Promise<ManifestDto> {
  if (!Number.isSafeInteger(departureId) || departureId < 1 || departureId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  return inTransaction(db, async (tx) => {
    const actor = await leader(tx, identity);
    const departure = await checkin.findManifestDeparture(tx, departureId);
    const status = await assertCrew(tx, actor, departureId, departure?.status);
    const passengers = (await checkin.findManifestPassengers(tx, departureId)).map(passenger);
    const crew = (await checkin.findManifestCrew(tx, departureId)).flatMap((row) =>
      row.role_in_trip === "Leader" ? [] : [{ role_in_trip: row.role_in_trip, full_name: row.staff.full_name, phone: row.staff.phone,
        vehicle: { dep_vehicle_id: row.vehicle.dep_vehicle_id, plate_number: row.vehicle.vehicle.plate_number } }]);
    const count = (value: ManifestPassengerDto["check_in_status"]) => passengers.filter((item) => item.check_in_status === value).length;
    return {
      departure: { departure_id: departureId, trip_name: departure!.trip.name, departure_date: departure!.departure_date.toISOString(),
        status, check_in_open: status !== "Ended" },
      summary: { total: passengers.length, checked_in: count("CheckedIn"), absent: count("Absent"), pending: count("Pending") },
      crew, passengers, server_time: (now ?? new Date()).toISOString(),
    };
  }, { isolationLevel: "RepeatableRead" });
}

// Lock order: departure FOR SHARE -> ticket FOR UPDATE, the same prefix as P02 (departure before invoice rows).
// A repeated scan or mark returns the stored result unchanged, so retries and double scans are stable.
export async function checkIn(db: Database, identity: Actor, input: unknown, now?: Date): Promise<CheckInResultDto> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const command = parsed.data;
  return inTransaction(db, async (tx) => {
    const actor = await leader(tx, identity);
    const departure = await checkin.lockCheckInDeparture(tx, command.departure_id);
    const status = await assertCrew(tx, actor, command.departure_id, departure?.status);
    if (status === "Ended") throw new AppError("CHECKIN_CLOSED", 409);

    let detailId: number;
    if (command.action === "CheckIn") {
      const found = await checkin.findTicketByCode(tx, command.ticket_code);
      if (!found) throw new AppError("TICKET_NOT_FOUND", 404);
      if (found.invoice.departure_id !== command.departure_id) throw new AppError("TICKET_WRONG_DEPARTURE", 409);
      detailId = found.detail_id;
    } else {
      detailId = command.detail_id;
    }
    const ticket = await checkin.lockTicket(tx, detailId);
    // MarkAbsent targets a manifest row: another departure's row is simply not in this manifest.
    if (!ticket || ticket.invoice.departure_id !== command.departure_id) throw new AppError("NOT_FOUND", 404);
    if (ticket.status !== "Valid" || ticket.invoice.status !== "Paid") throw new AppError("TICKET_NOT_VALID", 409);

    if (command.action === "CheckIn") {
      // Absent -> CheckedIn is allowed: a late passenger who shows the QR boards.
      if (ticket.check_in_status === "CheckedIn") return { result: "AlreadyCheckedIn", changed: false, passenger: passenger(ticket) };
      // Read the clock after the locks, so a scan that waited is stamped when it actually committed.
      const row = await checkin.setCheckIn(tx, ticket.detail_id, "CheckedIn", now ?? new Date());
      return { result: "CheckedIn", changed: true, passenger: passenger(row) };
    }
    // A scanned QR is the proof of boarding; it is never overwritten by a manual Absent.
    if (ticket.check_in_status === "CheckedIn") throw new AppError("ALREADY_CHECKED_IN", 409);
    if (ticket.check_in_status === "Absent") return { result: "AlreadyAbsent", changed: false, passenger: passenger(ticket) };
    const row = await checkin.setCheckIn(tx, ticket.detail_id, "Absent", null);
    return { result: "MarkedAbsent", changed: true, passenger: passenger(row) };
  });
}

export const checkInService = bindDb({ readManifest, checkIn });
