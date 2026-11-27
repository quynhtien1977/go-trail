import "server-only";
import type { z } from "zod";
import { auditQuerySchema, settingRanges, updateSettingSchema, userQuerySchema } from "@/schemas/admin";
import { requireActor, requireRole, type Actor, type AuthDatabase } from "@/server/auth/authorization";
import { inTransaction, type Database } from "@/server/repositories/database";
import * as repository from "@/server/repositories/admin";
import { lockLeaderRatioChange } from "@/server/repositories/departures";
import { readAuditEvent, writeAudit } from "@/server/audit";
import { AppError } from "@/server/errors";
import { bindDb } from "./bind-db";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  return parsed.data;
}
async function admin(db: AuthDatabase, identity: Actor) {
  const actor = await requireActor(db, identity);
  requireRole(actor, ["Admin"]);
  return actor;
}
export async function listUsers(db: Database, identity: Actor, input: unknown = {}) {
  return inTransaction(db, async tx => {
    await admin(tx, identity);
    return repository.listUsers(tx, parse(userQuerySchema, input));
  }, { isolationLevel: "RepeatableRead" });
}

export async function listAuditLogs(db: Database, identity: Actor, input: unknown = {}) {
  return inTransaction(db, async tx => {
    await admin(tx, identity);
    const { rows, pagination } = await repository.listAuditLogs(tx, parse(auditQuerySchema, input));
    const items = rows.map(({ user, description, created_at, ...row }) => ({
      ...row, actor_name: user?.full_name ?? "Hệ thống", created_at: created_at.toISOString(), event: readAuditEvent(description),
    }));
    return { items, pagination };
  }, { isolationLevel: "RepeatableRead" });
}

export async function listSettings(db: Database, identity: Actor) {
  return inTransaction(db, async tx => {
    await admin(tx, identity);
    return (await repository.listSettings(tx)).map(row => ({ ...row, editable: true }));
  }, { isolationLevel: "RepeatableRead" });
}

export async function updateSetting(db: Database, identity: Actor, key: string, input: unknown) {
  if (!Object.hasOwn(settingRanges, key)) throw new AppError("NOT_FOUND", 404);
  const settingKey = key as keyof typeof settingRanges;
  const { setting_value } = parse(updateSettingSchema, input);
  const [min, max] = settingRanges[settingKey];
  if (Number(setting_value) < min || Number(setting_value) > max) throw new AppError("INVALID_INPUT", 422);
  return inTransaction(db, async (tx) => {
    const initialActor = await admin(tx, identity);
    if (settingKey === "LEADER_RATIO") await lockLeaderRatioChange(tx);
    const current = await repository.lockSetting(tx, settingKey);
    if (!current) throw new AppError("NOT_FOUND", 404);
    // A revocation may have committed while this request waited; hold the user lock until the change commits.
    await repository.lockSettingActor(tx, initialActor.user_id);
    const actor = await admin(tx, identity);
    if (settingKey === "LEADER_RATIO") {
      const parsedCurrent = Number(current.setting_value);
      const currentRatio = Number.isSafeInteger(parsedCurrent) && parsedCurrent > 0 ? parsedCurrent : 15;
      if (Number(setting_value) < currentRatio && await repository.hasUnderstaffedDeparture(tx, Number(setting_value))) {
        throw new AppError("RESOURCE_CONFLICT", 409);
      }
    }
    const updated = await repository.setValue(tx, settingKey, setting_value);
    if (current.setting_value !== setting_value) await writeAudit(tx, actor.user_id,
      { action: "SettingChanged", record_id: settingKey, from: current.setting_value, to: setting_value });
    return { ...updated, editable: true };
  });
}

export const adminService = bindDb({ listUsers, listSettings, listAuditLogs, updateSetting });
