import "server-only";
import type { DataClient } from "./database";

export function findPublicDeparturePickups(db: DataClient, departureId: number, now: Date) {
  return db.departure.findFirst({
    where: { departure_id: departureId, status: "Open", is_demo: false,
      booking_deadline: { gt: now }, departure_date: { gt: now }, trip: { is_active: true } },
    select: { departure_id: true, trip_id: true, pickups: {
      where: { pickup: { is_active: true } }, orderBy: [{ pickup_time: "asc" }, { dep_pickup_id: "asc" }],
      select: { dep_pickup_id: true, pickup_id: true, pickup_time: true,
        pickup: { select: { trip_id: true, name: true, address: true } } },
    } },
  });
}
