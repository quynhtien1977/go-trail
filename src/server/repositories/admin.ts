import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Transaction } from "./database";
import { settingKeys, type auditQuerySchema, type userQuerySchema } from "@/schemas/admin";
import type { z } from "zod";

const userSelect = { user_id: true, email: true, full_name: true, phone: true, role: true, status: true, created_at: true,
  staff: { select: { staff_id: true } } } as const;

const literal = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const pagination = (query: { page: number; pageSize: number }, totalItems: number) =>
  ({ ...query, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) });

export async function listUsers(tx: Transaction, query: z.infer<typeof userQuerySchema>) {
  const { page, pageSize, q, role, status } = query;

  const search = q ? literal(q) : undefined;
  const where: Prisma.UserWhereInput = { ...(role ? { role } : {}), ...(status ? { status } : {}),
    ...(search ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { full_name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } }] } : {}) };
  const rows = await tx.user.findMany({ where, select: userSelect, orderBy: { user_id: "asc" }, skip: (page - 1) * pageSize, take: pageSize });
  const items = rows.map(({ staff, created_at, ...user }) => ({ ...user, created_at: created_at.toISOString(), is_staff: staff !== null }));
  return { items, pagination: pagination({ page, pageSize }, await tx.user.count({ where })) };
}

export async function listAuditLogs(tx: Transaction, query: z.infer<typeof auditQuerySchema>) {
  const { page, pageSize, table_name, record_id, action, user_id, from, to } = query;

  const where: Prisma.AuditLogWhereInput = { ...(table_name ? { table_name } : {}), ...(record_id ? { record_id } : {}),
    ...(action ? { action } : {}), ...(user_id ? { user_id } : {}),
    ...(from || to ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) };
  const rows = await tx.auditLog.findMany({ where, orderBy: [{ created_at: "desc" }, { log_id: "desc" }],
    skip: (page - 1) * pageSize, take: pageSize, select: { log_id: true, user_id: true, action: true, table_name: true, record_id: true,
      description: true, created_at: true, user: { select: { full_name: true } } } });
  return { rows, pagination: pagination({ page, pageSize }, await tx.auditLog.count({ where })) };
}

export function listSettings(tx: Transaction) {
  return tx.systemSetting.findMany({ where: { setting_key: { in: settingKeys } }, orderBy: { setting_key: "asc" } });
}
export async function lockSetting(tx: Transaction, key: string) {
  const rows = await tx.$queryRaw<{ setting_value: string }[]>`SELECT setting_value FROM system_settings WHERE setting_key = ${key} FOR UPDATE`;
  return rows[0];
}
export async function lockSettingActor(tx: Transaction, userId: number): Promise<void> {
  await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${userId} FOR SHARE`;
}
export function setValue(tx: Transaction, key: string, value: string) {
  return tx.systemSetting.update({ where: { setting_key: key }, data: { setting_value: value } });
}

export async function hasUnderstaffedDeparture(tx: Transaction, ratio: number): Promise<boolean> {
  const rows = await tx.$queryRaw<{ departure_id: number }[]>`
    SELECT d.departure_id FROM departures d WHERE d.status IN ('Confirmed', 'Running')
      AND (SELECT COUNT(*) FROM departure_vehicles v JOIN departure_staff s ON s.dep_vehicle_id = v.dep_vehicle_id
           WHERE v.departure_id = d.departure_id AND s.role_in_trip = 'Leader') * ${ratio}
        < (SELECT COUNT(*) FROM departure_vehicles v JOIN departure_seats s ON s.dep_vehicle_id = v.dep_vehicle_id
           JOIN invoice_details t ON t.dep_seat_id = s.dep_seat_id
           WHERE v.departure_id = d.departure_id AND t.status = 'Valid')
    LIMIT 1`;
  return rows.length > 0;
}
