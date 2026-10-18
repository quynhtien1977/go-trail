import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";

export type SeatMapDto = {
  departure_id: number;
  vehicles: { dep_vehicle_id: number; vehicle_type: string; seats: {
    dep_seat_id: number; seat_name: string; floor_level: number; x_position: number; y_position: number;
    status: "Available" | "Locked" | "Sold" }[] }[];
};

// Public: never select invoice_id, buyer, passenger or plate data, only what a seat picker draws.
export async function readPublicSeatMap(db: PrismaClient, departureId: number, now = new Date()): Promise<SeatMapDto> {
  if (!Number.isInteger(departureId) || departureId < 1 || departureId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  const departure = await db.departure.findFirst({
    // Same visibility as listPublicDepartures: open, real and still on sale.
    where: { departure_id: departureId, status: "Open", is_demo: false, booking_deadline: { gt: now }, trip: { is_active: true } },
    select: { departure_id: true, vehicles: { orderBy: { dep_vehicle_id: "asc" }, select: { dep_vehicle_id: true,
      vehicle: { select: { vehicle_type: true } },
      seats: { select: { dep_seat_id: true, status: true, locked_until: true,
        seat: { select: { seat_name: true, floor_level: true, x_position: true, y_position: true } } } } } } },
  });
  if (!departure) throw new AppError("NOT_FOUND", 404);
  return { departure_id: departure.departure_id, vehicles: departure.vehicles.map((item) => ({
    dep_vehicle_id: item.dep_vehicle_id, vehicle_type: item.vehicle.vehicle_type,
    seats: item.seats.map(({ dep_seat_id, status, locked_until, seat }) => ({ dep_seat_id, ...seat,
      // An expired hold is free to take now; cleanup of the row can happen later.
      status: status === "Locked" && locked_until !== null && locked_until <= now ? "Available" : status }))
      .sort((a, b) => a.floor_level - b.floor_level || a.y_position - b.y_position || a.x_position - b.x_position
        || a.dep_seat_id - b.dep_seat_id) })) };
}
