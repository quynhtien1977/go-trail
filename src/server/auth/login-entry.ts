import "server-only";
import { redirect } from "next/navigation";
import { getCurrentActor } from "./session";
import { getRolePortal } from "@/lib/auth-portal";
import { AppError } from "@/server/errors";

export async function redirectSignedInUser() {
  let actor;
  try { actor = await getCurrentActor(); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) return;
    throw error;
  }
  redirect(getRolePortal(actor.role));
}
