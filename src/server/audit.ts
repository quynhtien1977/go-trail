import "server-only";
import { z } from "zod";
import type { AuthDatabase } from "./auth/authorization";
import { userRoles } from "@/schemas/auth";
import { vehicleStatuses } from "@/schemas/fleet";
import { AppError } from "./errors";
import { insertAudit } from "./repositories/audit";

const id = z.number().int().positive().max(2147483647);
const departureStatuses = ["Draft", "Open", "Closed", "Confirmed", "Running", "Ended", "Cancelled", "Rescheduled"] as const;
const amount = z.string().regex(/^(0|[1-9]\d{0,13})$/);
const eventSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("RoleChanged"), record_id: id, from: z.enum(userRoles), to: z.enum(userRoles) }),
  z.strictObject({ action: z.literal("AccountStatusChanged"), record_id: id,
    from: z.enum(["Active", "Locked"]), to: z.enum(["Active", "Locked"]) }),
  z.strictObject({ action: z.literal("DepartureStatusChanged"), record_id: id,
    from: z.enum(departureStatuses), to: z.enum(departureStatuses) }),
  z.strictObject({ action: z.literal("MoneyRecorded"), record_id: id,
    table_name: z.enum(["payments", "refunds", "departure_costs", "vehicle_maintenance"]), amount: z.string().regex(/^(0|[1-9]\d{0,13})$/) }),
  z.strictObject({ action: z.literal("DepartureOwnerChanged"), record_id: id, from: id.nullable(), to: id }),
  z.strictObject({ action: z.literal("LeaderAccountCreated"), record_id: id }),
  z.strictObject({ action: z.literal("VehicleStatusChanged"), record_id: id,
    from: z.enum(vehicleStatuses), to: z.enum(vehicleStatuses) }),
  z.strictObject({ action: z.literal("TripCreated"), record_id: id, base_price: amount }),
  z.strictObject({ action: z.literal("TripPriceChanged"), record_id: id, from: amount, to: amount }),
  z.strictObject({ action: z.literal("TripAvailabilityChanged"), record_id: id, from: z.boolean(), to: z.boolean() }),
]);
export type AuditEvent = z.infer<typeof eventSchema>;

// Call with the same transaction as the business change. Do not call after commit.
// Allowlisted structured events cannot carry passwords, banking details or request dumps.
export async function writeAudit(tx: AuthDatabase, actorId: number, input: AuditEvent): Promise<void> {
  const event = eventSchema.safeParse(input);
  if (!event.success || !id.safeParse(actorId).success) throw new AppError("INVALID_INPUT", 422);
  const value = event.data;
  const table_name = value.action === "MoneyRecorded" ? value.table_name
    : value.action === "DepartureStatusChanged" || value.action === "DepartureOwnerChanged" ? "departures"
      : value.action === "VehicleStatusChanged" ? "vehicles"
      : value.action === "TripCreated" || value.action === "TripPriceChanged" || value.action === "TripAvailabilityChanged" ? "trips" : "users";
  await insertAudit(tx, { user_id: actorId, action: value.action, table_name,
    record_id: String(value.record_id), description: JSON.stringify(value) });
}
