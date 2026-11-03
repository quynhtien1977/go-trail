import "server-only";
import type { DataClient } from "./database";

// Select only the seat-picker projection; expiry stays internal to the service mapping.
export function findPublicSeatMap(db: DataClient, departureId: number, now: Date) {
  return db.departure.findFirst({
    where: { departure_id: departureId, status: "Open", is_demo: false,
      booking_deadline: { gt: now }, departure_date: { gt: now }, trip: { is_active: true } },
    select: { departure_id: true, vehicles: { orderBy: { dep_vehicle_id: "asc" }, select: { dep_vehicle_id: true,
      vehicle: { select: { vehicle_type: true } },
      seats: { select: { dep_seat_id: true, status: true, locked_until: true,
        seat: { select: { seat_name: true, floor_level: true, x_position: true, y_position: true } } } } } } },
  });
}
