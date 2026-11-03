import "server-only";
import type { Prisma, DepartureStatus } from "@/generated/prisma/client";
import type { z } from "zod";
import type { createVehicleSchema, updateVehicleSchema, createSeatSchema, updateSeatSchema, vehicleQuerySchema, SeatDto } from "@/schemas/fleet";
import type { DataClient } from "./database";

const seatSelect = { seat_id: true, vehicle_id: true, seat_name: true, floor_level: true,
  x_position: true, y_position: true, is_active: true } as const;
const summarySelect = { vehicle_id: true, plate_number: true, vehicle_type: true, seat_count: true, status: true } as const;
const vehicleSelect = { ...summarySelect, seats: { select: seatSelect,
  orderBy: [{ floor_level: "asc" }, { y_position: "asc" }, { x_position: "asc" }, { seat_id: "asc" }] } } satisfies Prisma.VehicleSelect;
const maintenanceSelect = { maintenance_id: true, vehicle_id: true, start_date: true, end_date: true,
  description: true, cost: true } as const;
export type MaintenanceRow = Prisma.VehicleMaintenanceGetPayload<{ select: typeof maintenanceSelect }>;

export function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export async function lockVehicleForUpdate(tx: Prisma.TransactionClient, id: number) {
  // Serializes layout, status, maintenance and assignment checks for one vehicle.
  const rows = await tx.$queryRaw<{ vehicle_id: number }[]>`SELECT vehicle_id FROM vehicles WHERE vehicle_id = ${id} FOR UPDATE`;
  if (!rows.length) return null;
  return tx.vehicle.findUniqueOrThrow({ where: { vehicle_id: id }, select: vehicleSelect });
}

export function countAssignments(db: DataClient, vehicleId: number, excludedStatuses: readonly DepartureStatus[],
  range?: { gte: Date; lt: Date }, exceptDepartureId?: number) {
  return db.departureVehicle.count({ where: { vehicle_id: vehicleId,
    departure: { status: { notIn: [...excludedStatuses] }, ...(range ? { departure_date: range } : {}),
      ...(exceptDepartureId !== undefined ? { departure_id: { not: exceptDepartureId } } : {}) } } });
}

export function findSeatAtPosition(db: DataClient, vehicleId: number, seat: Pick<SeatDto, "floor_level" | "x_position" | "y_position">, exceptSeatId?: number) {
  return db.vehicleSeat.findFirst({ where: { vehicle_id: vehicleId, is_active: true,
    floor_level: seat.floor_level, x_position: seat.x_position, y_position: seat.y_position,
    ...(exceptSeatId ? { seat_id: { not: exceptSeatId } } : {}) }, select: { seat_id: true } });
}

export function countActiveSeats(db: DataClient, vehicleId: number) {
  return db.vehicleSeat.count({ where: { vehicle_id: vehicleId, is_active: true } });
}

export function setSeatCount(db: DataClient, vehicleId: number, seat_count: number) {
  return db.vehicle.update({ where: { vehicle_id: vehicleId }, data: { seat_count } });
}

export async function findVehiclesPage(db: DataClient, query: z.infer<typeof vehicleQuerySchema>) {
  const where = query.status ? { status: query.status } : {};
  const items = await db.vehicle.findMany({ where, select: summarySelect, orderBy: { vehicle_id: "asc" },
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.vehicle.count({ where }) };
}

export function findVehicle(db: DataClient, vehicleId: number) {
  return db.vehicle.findUnique({ where: { vehicle_id: vehicleId }, select: vehicleSelect });
}

export function insertVehicle(db: DataClient, data: Omit<z.infer<typeof createVehicleSchema>, "seats">, seats: z.infer<typeof createVehicleSchema>["seats"]) {
  return db.vehicle.create({ data: { ...data, seat_count: seats.length, seats: { create: seats } }, select: vehicleSelect });
}

export function updateVehicle(db: DataClient, vehicleId: number, data: z.infer<typeof updateVehicleSchema>) {
  return db.vehicle.update({ where: { vehicle_id: vehicleId }, data, select: vehicleSelect });
}

export function insertSeat(db: DataClient, vehicleId: number, data: z.infer<typeof createSeatSchema>) {
  return db.vehicleSeat.create({ data: { ...data, vehicle_id: vehicleId }, select: seatSelect });
}

export function findSeatForVehicle(db: DataClient, vehicleId: number, seatId: number) {
  return db.vehicleSeat.findFirst({ where: { seat_id: seatId, vehicle_id: vehicleId }, select: seatSelect });
}

export function updateSeat(db: DataClient, seatId: number, data: z.infer<typeof updateSeatSchema>) {
  return db.vehicleSeat.update({ where: { seat_id: seatId }, data, select: seatSelect });
}

export function countVehicle(db: DataClient, vehicleId: number) {
  return db.vehicle.count({ where: { vehicle_id: vehicleId } });
}

export async function findMaintenancePage(db: DataClient, vehicleId: number, query: { page: number; pageSize: number }) {
  const where = { vehicle_id: vehicleId };
  const items = await db.vehicleMaintenance.findMany({ where, select: maintenanceSelect,
    orderBy: [{ start_date: "desc" }, { maintenance_id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.vehicleMaintenance.count({ where }) };
}

export function insertMaintenance(db: DataClient, vehicleId: number, data: { start_date: Date; end_date: Date; description: string; cost: string }) {
  return db.vehicleMaintenance.create({ data: { ...data, vehicle_id: vehicleId }, select: maintenanceSelect });
}

export function countMaintenanceOnDay(db: DataClient, vehicleId: number, day: Date) {
  return db.vehicleMaintenance.count({ where: { vehicle_id: vehicleId,
    start_date: { lte: day }, end_date: { gte: day } } });
}
