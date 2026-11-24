import "server-only";
import { notFound, redirect } from "next/navigation";
import { getRouteActor } from "@/server/auth/session";
import { AppError } from "@/server/errors";

// Every /leader page re-checks the DB-backed actor on top of the proxy gate (src/server/auth/session.ts).
export async function requireLeaderPage(callbackUrl: string) {
  try {
    return await getRouteActor("/leader");
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect(`/staff/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    throw error;
  }
}

// Same bounds as the server's parseId; anything else is a page that does not exist.
export function parseDepartureId(raw: string): number {
  if (!/^\d{1,10}$/.test(raw)) notFound();
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) notFound();
  return id;
}
