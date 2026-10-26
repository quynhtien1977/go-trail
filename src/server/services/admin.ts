import "server-only";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { auditQuerySchema, settingRanges, updateSettingSchema, userQuerySchema } from "@/schemas/admin";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";

// Account list shows identity and access only: never password_hash or auth_version.
const userSelect = { user_id: true, email: true, full_name: true, phone: true, role: true, status: true, created_at: true,
  staff: { select: { staff_id: true } } } as const;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
async function admin(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, []);
  return actor;
}
const literal = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const pagination = (query: { page: number; pageSize: number }, totalItems: number) =>
  ({ ...query, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) });

export async function listUsers(db: PrismaClient, identity: Actor, input: unknown = {}) {
  const { page, pageSize, q, role, status } = parse(userQuerySchema, input);
  return db.$transaction(async (tx) => {
    await admin(tx, identity);
    const search = q ? literal(q) : undefined;
    const where: Prisma.UserWhereInput = { ...(role ? { role } : {}), ...(status ? { status } : {}),
      ...(search ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { full_name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } }] } : {}) };
    const rows = await tx.user.findMany({ where, select: userSelect, orderBy: { user_id: "asc" }, skip: (page - 1) * pageSize, take: pageSize });
    const items = rows.map(({ staff, created_at, ...user }) => ({ ...user, created_at: created_at.toISOString(), is_staff: staff !== null }));
    return { items, pagination: pagination({ page, pageSize }, await tx.user.count({ where })) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function listSettings(db: PrismaClient, identity: Actor) {
  await admin(db, identity);
  const rows = await db.systemSetting.findMany({ orderBy: { setting_key: "asc" } });
  return rows.map((row) => ({ ...row, editable: row.setting_key in settingRanges }));
}

export async function updateSetting(db: PrismaClient, identity: Actor, key: string, input: unknown) {
  if (!Object.hasOwn(settingRanges, key)) throw new AppError("NOT_FOUND", 404);
  const settingKey = key as keyof typeof settingRanges;
  const { setting_value } = parse(updateSettingSchema, input);
  const [min, max] = settingRanges[settingKey];
  if (Number(setting_value) < min || Number(setting_value) > max) throw new AppError("INVALID_INPUT", 422);
  return db.$transaction(async (tx) => {
    const actor = await admin(tx, identity);
    const rows = await tx.$queryRaw<{ setting_value: string }[]>`SELECT setting_value FROM system_settings WHERE setting_key = ${settingKey} FOR UPDATE`;
    if (!rows.length) throw new AppError("NOT_FOUND", 404);
    const updated = await tx.systemSetting.update({ where: { setting_key: settingKey }, data: { setting_value } });
    if (rows[0].setting_value !== setting_value) await writeAudit(tx, actor.user_id,
      { action: "SettingChanged", record_id: settingKey, from: rows[0].setting_value, to: setting_value });
    return { ...updated, editable: true };
  });
}

export async function listAuditLogs(db: PrismaClient, identity: Actor, input: unknown = {}) {
  const { page, pageSize, table_name, record_id, action, user_id, from, to } = parse(auditQuerySchema, input);
  return db.$transaction(async (tx) => {
    await admin(tx, identity);
    const where: Prisma.AuditLogWhereInput = { ...(table_name ? { table_name } : {}), ...(record_id ? { record_id } : {}),
      ...(action ? { action } : {}), ...(user_id ? { user_id } : {}),
      ...(from || to ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) };
    const rows = await tx.auditLog.findMany({ where, orderBy: [{ created_at: "desc" }, { log_id: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize, select: { log_id: true, user_id: true, action: true, table_name: true, record_id: true,
        description: true, created_at: true, user: { select: { full_name: true } } } });
    // Descriptions are allowlisted structured events (see writeAudit), so they are safe to return parsed.
    const items = rows.map(({ user, description, created_at, ...row }) => ({ ...row, actor_name: user.full_name,
      created_at: created_at.toISOString(), event: JSON.parse(description) as unknown }));
    return { items, pagination: pagination({ page, pageSize }, await tx.auditLog.count({ where })) };
  }, { isolationLevel: "RepeatableRead" });
}
