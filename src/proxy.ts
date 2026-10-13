import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { canAccessRouteGroup } from "@/server/auth/route-policy";
import { getAuthSecret } from "@/server/auth/env";

// Preliminary JWT route gate only. Handlers/services must verify current DB access again.
export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: getAuthSecret(), secureCookie: process.env.NODE_ENV === "production" });
  if (!token?.sub || !token.role || !token.authenticated_at || Date.now() / 1000 - token.authenticated_at >= 8 * 60 * 60) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (!canAccessRouteGroup(token.role, request.nextUrl.pathname)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bạn không có quyền truy cập." } },
      { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.next();
}
export const config = { matcher: ["/account/:path*", "/leader/:path*", "/staff/:path*", "/admin/:path*"] };
