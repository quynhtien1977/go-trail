import "server-only";
import { getServerSession } from "next-auth";
import { getDb } from "@/server/db";
import { getAuthOptions } from "./config";
import { requireActor } from "./authorization";
import { canAccessRouteGroup } from "./route-policy";
import { AppError } from "@/server/errors";

export async function getCurrentActor() {
  const session = await getServerSession(getAuthOptions());
  return requireActor(getDb(), session?.user ?? null);
}

// Call in every protected page/action in addition to the preliminary Proxy gate.
export async function getRouteActor(group: "/account" | "/leader" | "/staff" | "/admin") {
  const actor = await getCurrentActor();
  if (!canAccessRouteGroup(actor.role, group)) throw new AppError("FORBIDDEN", 403);
  return actor;
}
