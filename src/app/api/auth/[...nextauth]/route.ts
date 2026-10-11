import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { getAuthOptions } from "@/server/auth/config";
import { assertSameOrigin, errorResponse, readBodyText } from "@/server/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ nextauth: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  try { return await NextAuth(getAuthOptions())(request, context); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const body = await readBodyText(request);
    const bounded = new NextRequest(request.url, { method: "POST", headers: request.headers, body });
    return await NextAuth(getAuthOptions())(bounded, context);
  } catch (error) { return errorResponse(error); }
}
