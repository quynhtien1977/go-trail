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
  // Descriptions are allowlisted structured events (see writeAudit), so they are safe to return parsed.
  const items = rows.map(({ user, description, created_at, ...row }) => ({ ...row, actor_name: user.full_name,
    created_at: created_at.toISOString(), event: readAuditEvent(description) }));
  return { items, pagination: pagination({ page, pageSize }, await tx.auditLog.count({ where })) };
}

function readAuditEvent(description: string): unknown {
  try { return JSON.parse(description); } catch { return null; }
}
export function listSettings(tx: Transaction) {
  return tx.systemSetting.findMany({ where: { setting_key: { in: settingKeys } }, orderBy: { setting_key: "asc" } });
}
export async function lockSetting(tx: Transaction, key: string) {
  const rows = await tx.$queryRaw<{ setting_value: string }[]>`SELECT setting_value FROM system_settings WHERE setting_key = ${key} FOR UPDATE`;
  return rows[0];
}
export function setValue(tx: Transaction, key: string, value: string) {
  return tx.systemSetting.update({ where: { setting_key: key }, data: { setting_value: value } });
}
