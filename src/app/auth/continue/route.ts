import { NextResponse } from "next/server";
import { getCurrentActor } from "@/server/auth/session";
import { getAuthDestination } from "@/lib/auth-portal";
import { AppError } from "@/server/errors";
import { errorResponse } from "@/server/http";

// Browser navigation endpoint: Auth.js has set the cookie before reaching this controller.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = new URL(process.env.NEXTAUTH_URL ?? request.url).origin;
  try {
    const actor = await getCurrentActor();
    const destination = getAuthDestination(actor.role, url.searchParams.get("callbackUrl"), origin);
    return NextResponse.redirect(new URL(destination, origin), { status: 303, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError && error.status === 401) {
      const login = new URL(url.searchParams.get("gate") === "staff" ? "/staff/login" : "/login", origin);
      return NextResponse.redirect(login, { status: 303, headers: { "Cache-Control": "private, no-store" } });
    }
    return errorResponse(error);
  }
}
