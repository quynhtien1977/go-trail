import "server-only";
import { hash } from "bcryptjs";
import type { z } from "zod";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as staff from "@/server/repositories/staff";
import type { Page } from "@/schemas/catalog";
import { createStaffSchema, staffQuerySchema, updateStaffSchema, type StaffDto } from "@/schemas/staff";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { vietnamDay } from "./fleet";
import { bindDb } from "./bind-db";

// Departures in these statuses no longer hold their crew.
const closedDepartures = ["Ended", "Cancelled", "Rescheduled"] as const;
type License = { license_number?: string | null; license_class?: string | null; license_expiry?: Date | null };

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
function assertId(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new AppError("INVALID_INPUT", 422);
}
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
function dto(row: staff.StaffRow): StaffDto {
  const { user, license_expiry, ...fields } = row;
  return { ...fields, license_expiry: license_expiry?.toISOString().slice(0, 10) ?? null, account: user };
}
async function hrManager(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["HRMgr"]);
  return actor;
}
// Drivers need a complete licence that is valid today; other crew types carry no licence data.
function assertLicense(type: StaffDto["staff_type"], license: License, now: Date) {
  const values = [license.license_number, license.license_class, license.license_expiry];
  if (type !== "Driver") {
    if (values.some((value) => value != null)) throw new AppError("INVALID_INPUT", 422);
    return;
  }
  if (values.some((value) => value == null) || license.license_expiry! < vietnamDay(now).date) throw new AppError("INVALID_INPUT", 422);
}

export async function listStaff(db: Database, identity: Actor, input: unknown = {}): Promise<Page<StaffDto>> {
  const query = parse(staffQuerySchema, input);
  return inTransaction(db, async (tx) => {
    await hrManager(tx, identity);
    const result = await staff.findStaffPage(tx, query);
    return { items: result.items.map(dto), pagination: { page: query.page, pageSize: query.pageSize,
      totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / query.pageSize) } };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readStaff(db: Database, identity: Actor, staffId: number): Promise<StaffDto> {
  assertId(staffId);
  await hrManager(db, identity);
  const row = await staff.findStaff(db, staffId);
  if (!row) throw new AppError("NOT_FOUND", 404);
  return dto(row);
}

// A Leader's USERS account and STAFF record are created together or not at all.
export async function createStaff(db: Database, identity: Actor, input: unknown, now = new Date()): Promise<StaffDto> {
  const { account, license_expiry, ...data } = parse(createStaffSchema, input);
  const record = { ...data, license_expiry: license_expiry == null ? license_expiry : dbDate(license_expiry) };
  assertLicense(data.staff_type, record, now);
  if ((data.staff_type === "Leader") !== (account !== undefined)) throw new AppError("INVALID_INPUT", 422);
  // Hash before the transaction so the bcrypt cost does not hold row locks.
  const password_hash = account && await hash(account.password, 12);
  return inTransaction(db, async (tx) => {
    const actor = await hrManager(tx, identity);
    let user_id: number | undefined;
    if (account && password_hash) {
      const user = await staff.insertUser(tx, { email: account.email, password_hash, full_name: data.full_name,
        phone: data.phone, role: "Leader", status: "Active" });
      if (!user) throw new AppError("RESOURCE_CONFLICT", 409);
      user_id = user.user_id;
      await writeAudit(tx, actor.user_id, { action: "LeaderAccountCreated", record_id: user_id });
    }
    return dto(await staff.insertStaff(tx, { ...record, user_id }));
  });
}

export async function updateStaff(db: Database, identity: Actor, staffId: number, input: unknown, now = new Date()): Promise<StaffDto> {
  assertId(staffId);
  const { license_expiry, ...data } = parse(updateStaffSchema, input);
  const patch = { ...data, ...(license_expiry === undefined ? {} : { license_expiry: license_expiry === null ? null : dbDate(license_expiry) }) };
  return inTransaction(db, async (tx) => {
    await hrManager(tx, identity);
    const current = await staff.lockStaff(tx, staffId);
    if (!current) throw new AppError("NOT_FOUND", 404);
    const next = { ...current, ...patch };
    const licenseChanged = patch.license_number !== undefined || patch.license_class !== undefined || patch.license_expiry !== undefined;
    if (licenseChanged) assertLicense(current.staff_type, next, now);
    // Crew still held by a departure must stay Active, and a Driver's licence must cover each of those days.
    if (licenseChanged || (current.status === "Active" && next.status === "Inactive")) {
      const days = (await staff.findAssignedDepartureDates(tx, staffId, closedDepartures))
        .map((row) => vietnamDay(row.departure.departure_date).date);
      if (days.length && (next.status !== "Active" || (current.staff_type === "Driver" && days.some((day) => next.license_expiry! < day)))) {
        throw new AppError("RESOURCE_CONFLICT", 409);
      }
    }
    return dto(await staff.updateStaff(tx, staffId, patch));
  });
}

// STAFF rows are referenced by assignment history, so delete deactivates.
export function deactivateStaff(db: Database, identity: Actor, staffId: number): Promise<StaffDto> {
  return updateStaff(db, identity, staffId, { status: "Inactive" });
}

export const staffService = bindDb({ listStaff, readStaff, createStaff, updateStaff, deactivateStaff });
