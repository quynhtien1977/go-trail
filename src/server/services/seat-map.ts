import "server-only";
import type { SeatMapDto } from "@/schemas/seat-map";
import { AppError } from "@/server/errors";
import type { Database } from "@/server/repositories/database";
import { findPublicSeatMap } from "@/server/repositories/seat-map";
import { bindDb } from "./bind-db";

export type { SeatMapDto } from "@/schemas/seat-map";

// Public: never select invoice_id, buyer, passenger or plate data, only what a seat picker draws.
export async function readPublicSeatMap(db: Database, departureId: number, now = new Date()): Promise<SeatMapDto> {
  if (!Number.isInteger(departureId) || departureId < 1 || departureId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  const departure = await findPublicSeatMap(db, departureId, now);
  if (!departure) throw new AppError("NOT_FOUND", 404);
  return { departure_id: departure.departure_id, vehicles: departure.vehicles.map((item) => ({
    dep_vehicle_id: item.dep_vehicle_id, vehicle_type: item.vehicle.vehicle_type,
    seats: item.seats.map(({ dep_seat_id, status, locked_until, seat }) => ({ dep_seat_id, ...seat,
      // An expired hold is free to take now; cleanup of the row can happen later.
      status: status === "Locked" && locked_until !== null && locked_until <= now ? "Available" : status }))
      .sort((a, b) => a.floor_level - b.floor_level || a.y_position - b.y_position || a.x_position - b.x_position
        || a.dep_seat_id - b.dep_seat_id) })) };
}

export const seatMapService = bindDb({ readPublicSeatMap });
