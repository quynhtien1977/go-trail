import "server-only";
import { assertCronSecret } from "@/server/auth/cron";
import { writeCronDeparturesClosed } from "@/server/audit";
import { expireHolds } from "@/server/repositories/bookings";
import * as cron from "@/server/repositories/cron";
import { inTransaction, type Database } from "@/server/repositories/database";
import { bindDb } from "./bind-db";

const BATCH_SIZE = 50;

// Keep expiration and departure closing in separate transactions to preserve lock ordering.
export async function expireInvoices(db: Database, authorization: string | null, now = new Date()) {
  assertCronSecret(authorization);
  return inTransaction(db, async tx => {
    const ids = await cron.lockExpiredInvoices(tx, now, BATCH_SIZE);
    await cron.lockInvoiceSeats(tx, ids);
    const expired = await cron.recheckExpiredInvoices(tx, ids, now);
    if (expired.length) await expireHolds(tx, expired);
    return { processed: expired.length, batch_full: ids.length === BATCH_SIZE };
  });
}

export async function closeDepartures(db: Database, authorization: string | null, now = new Date()) {
  assertCronSecret(authorization);
  return inTransaction(db, async tx => {
    const ids = await cron.lockClosableDepartures(tx, now, BATCH_SIZE);
    const eligible = await cron.recheckClosableDepartures(tx, ids, now);
    if (eligible.length) {
      const count = await cron.closeLockedDepartures(tx, eligible.map(row => row.departure_id));
      if (count !== eligible.length) throw new Error("CRON_DEPARTURE_UPDATE_MISMATCH");
      await writeCronDeparturesClosed(tx, eligible.map(row => ({ record_id: row.departure_id, reason: row.reason })));
    }
    return { processed: eligible.length, batch_full: ids.length === BATCH_SIZE };
  });
}

export const cronService = bindDb({ expireInvoices, closeDepartures });
