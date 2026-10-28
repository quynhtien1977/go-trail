import "server-only";
import type { DepartureStatus, Prisma, StaffType } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

const assignmentSelect = { departure_id: true, status: true, invoice_owner_user_id: true,
  vehicles: { orderBy: { dep_vehicle_id: "asc" }, select: { dep_vehicle_id: true, vehicle_id: true,
    vehicle: { select: { plate_number: true, seat_count: true } }, _count: { select: { seats: true } },
    staff: { orderBy: { dep_staff_id: "asc" }, select: { dep_staff_id: true, staff_id: true, role_in_trip: true,
      staff: { select: { full_name: true, user_id: true, status: true, staff_type: true } } } } } },
} satisfies Prisma.DepartureSelect;
export type AssignmentRow = Prisma.DepartureGetPayload<{ select: typeof assignmentSelect }>;
export function findAssignments(db: DataClient, departureId: number) {
  return db.departure.findUnique({ where: { departure_id: departureId }, select: assignmentSelect });
}
export function findVehicle(db: DataClient, departureId: number, vehicleId: number) {
  return db.departureVehicle.findUnique({ where: { departure_id_vehicle_id: { departure_id: departureId, vehicle_id: vehicleId } },
    select: { dep_vehicle_id: true } });
}
export async function ensureVehicleSeats(tx: Transaction, departureId: number, vehicleId: number, seatIds: number[]) {
  const assignment = await tx.departureVehicle.upsert({ where: { departure_id_vehicle_id: { departure_id: departureId, vehicle_id: vehicleId } },
    create: { departure_id: departureId, vehicle_id: vehicleId }, update: {}, select: { dep_vehicle_id: true } });
  await tx.departureSeat.createMany({ skipDuplicates: true, data: seatIds.map((seat_id) => ({ dep_vehicle_id: assignment.dep_vehicle_id, seat_id })) });
}
export function countUsedSeats(db: DataClient, depVehicleId: number) {
  return db.departureSeat.count({ where: { dep_vehicle_id: depVehicleId,
    OR: [{ status: { not: "Available" } }, { tickets: { some: {} } }] } });
}
export async function removeVehicle(tx: Transaction, depVehicleId: number) {
  await tx.departureStaff.deleteMany({ where: { dep_vehicle_id: depVehicleId } });
  await tx.departureSeat.deleteMany({ where: { dep_vehicle_id: depVehicleId } });
  await tx.departureVehicle.delete({ where: { dep_vehicle_id: depVehicleId } });
}
export async function lockStaff(tx: Transaction, staffId: number) {
  await tx.$queryRaw`SELECT staff_id FROM staff WHERE staff_id = ${staffId} FOR UPDATE`;
  return tx.staff.findUnique({ where: { staff_id: staffId }, select: {
    staff_type: true, status: true, license_number: true, license_expiry: true, user_id: true,
  } });
}
export type StaffRow = NonNullable<Awaited<ReturnType<typeof lockStaff>>>;
export function findStaffAssignment(db: DataClient, departureId: number, staffId: number, role: StaffType) {
  return db.departureStaff.findUnique({ where: { departure_id_staff_id_role_in_trip: { departure_id: departureId, staff_id: staffId, role_in_trip: role } },
    select: { dep_vehicle_id: true } });
}
export function countBusyStaff(db: DataClient, departureId: number, staffId: number, range: { gte: Date; lt: Date }, excludedStatuses: readonly DepartureStatus[]) {
  return db.departureStaff.count({ where: { staff_id: staffId,
    departure: { departure_id: { not: departureId }, status: { notIn: [...excludedStatuses] }, departure_date: range } } });
}
export function countDrivers(db: DataClient, depVehicleId: number) {
  return db.departureStaff.count({ where: { dep_vehicle_id: depVehicleId, role_in_trip: "Driver" } });
}
export function insertStaff(tx: Transaction, data: { departure_id: number; staff_id: number; role_in_trip: StaffType; dep_vehicle_id: number }) {
  return tx.departureStaff.create({ data });
}
export function findStaffAssignmentById(db: DataClient, departureId: number, assignmentId: number) {
  return db.departureStaff.findFirst({ where: { dep_staff_id: assignmentId, departure_id: departureId }, select: { staff_id: true } });
}
export function removeStaff(tx: Transaction, departureId: number, assignmentId: number) {
  return tx.departureStaff.deleteMany({ where: { dep_staff_id: assignmentId, departure_id: departureId } });
}
export function listResources(db: DataClient, departureId: number) {
  return db.departureVehicle.findMany({ where: { departure_id: departureId }, orderBy: { vehicle_id: "asc" },
    select: { dep_vehicle_id: true, vehicle_id: true, seats: { select: { seat_id: true } },
      staff: { select: { staff_id: true, role_in_trip: true } } } });
}
