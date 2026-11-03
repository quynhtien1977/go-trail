import "server-only";
import type { DepartureStatus, Prisma, StaffStatus, StaffType } from "@/generated/prisma/client";
import type { DataClient, Transaction } from "./database";

const staffSelect = { staff_id: true, full_name: true, phone: true, staff_type: true, license_number: true,
  license_class: true, license_expiry: true, status: true,
  user: { select: { user_id: true, email: true, status: true } } } satisfies Prisma.StaffSelect;
export type StaffRow = Prisma.StaffGetPayload<{ select: typeof staffSelect }>;

export function findStaff(db: DataClient, staffId: number) {
  return db.staff.findUnique({ where: { staff_id: staffId }, select: staffSelect });
}
// Same row lock as assignments, so profile edits and crew assignment serialize on the STAFF row.
export async function lockStaff(tx: Transaction, staffId: number) {
  await tx.$queryRaw`SELECT staff_id FROM staff WHERE staff_id = ${staffId} FOR UPDATE`;
  return findStaff(tx, staffId);
}
export async function findStaffPage(db: DataClient, query: { staff_type?: StaffType; status?: StaffStatus; page: number; pageSize: number }) {
  const where = { ...(query.staff_type ? { staff_type: query.staff_type } : {}), ...(query.status ? { status: query.status } : {}) };
  const items = await db.staff.findMany({ where, select: staffSelect, orderBy: { staff_id: "asc" },
    skip: (query.page - 1) * query.pageSize, take: query.pageSize });
  return { items, totalItems: await db.staff.count({ where }) };
}
export async function insertUser(tx: Transaction, data: Prisma.UserUncheckedCreateInput) {
  try {
    return await tx.user.create({ data, select: { user_id: true } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return null;
    throw error;
  }
}
export function insertStaff(tx: Transaction, data: Prisma.StaffUncheckedCreateInput) {
  return tx.staff.create({ data, select: staffSelect });
}
export function updateStaff(tx: Transaction, staffId: number, data: Prisma.StaffUncheckedUpdateInput) {
  return tx.staff.update({ where: { staff_id: staffId }, data, select: staffSelect });
}
export function findAssignedDepartureDates(db: DataClient, staffId: number, excludedStatuses: readonly DepartureStatus[]) {
  return db.departureStaff.findMany({ where: { staff_id: staffId, departure: { status: { notIn: [...excludedStatuses] } } },
    select: { departure: { select: { departure_date: true } } } });
}
