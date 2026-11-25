import "server-only";
import type { DeparturePickupsDto } from "@/schemas/departure-pickups";
import { AppError } from "@/server/errors";
import type { Database } from "@/server/repositories/database";
import { findPublicDeparturePickups } from "@/server/repositories/departure-pickups";
import { bindDb } from "./bind-db";

export async function readPublicDeparturePickups(db: Database, departureId: number, now = new Date()): Promise<DeparturePickupsDto> {
  if (!Number.isInteger(departureId) || departureId < 1 || departureId > 2147483647) throw new AppError("INVALID_INPUT", 422);
  const departure = await findPublicDeparturePickups(db, departureId, now);
  if (!departure) throw new AppError("NOT_FOUND", 404);
  return { departure_id: departure.departure_id, pickups: departure.pickups
    // Legacy FK constraints alone do not guarantee the pickup belongs to this departure's trip.
    .filter(item => item.pickup.trip_id === departure.trip_id)
    .map(({ dep_pickup_id, pickup_id, pickup_time, pickup }) => ({ dep_pickup_id, pickup_id,
      name: pickup.name, address: pickup.address, pickup_time: pickup_time.toISOString() })) };
}

export const departurePickupService = bindDb({ readPublicDeparturePickups });
