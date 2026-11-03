import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { getAuthOptions } from "@/server/auth/config";
import { assertSameOrigin, errorResponse, readBodyText } from "@/server/http";
import { getLoginPath } from "@/lib/auth-portal";
import { getSafeAuthCallback } from "@/lib/auth-redirect";

export const runtime = "nodejs";
type Context = { params: Promise<{ nextauth: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const callback = getSafeAuthCallback(request.nextUrl.searchParams.get("callbackUrl"), process.env.NEXTAUTH_URL ?? request.url);
    const staff = getLoginPath(callback?.split(/[?#]/)[0] ?? "") === "/staff/login"
      || request.nextUrl.searchParams.get("provider") === "staff-credentials";
    return await NextAuth(getAuthOptions(staff ? "staff" : "customer"))(request, context);
  }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const body = await readBodyText(request);
    const bounded = new NextRequest(request.url, { method: "POST", headers: request.headers, body });
    const { nextauth } = await context.params;
    return await NextAuth(getAuthOptions(nextauth[1] === "staff-credentials" ? "staff" : "customer", nextauth[0] === "callback"))(bounded, context);
  } catch (error) { return errorResponse(error); }
}
