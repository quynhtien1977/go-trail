import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/server/db";
import { authenticateCredentials } from "@/server/services/accounts";
import { requireActor } from "./authorization";
import { getAuthSecret } from "./env";
import { getTrustedClientIp } from "./client-source";

export { getAuthSecret } from "./env";

// Lazy configuration preserves env-free scaffold/build; auth itself fails closed without a secret.
export function getAuthOptions(): NextAuthOptions {
  const secret = getAuthSecret();
  const production = process.env.NODE_ENV === "production";
  if (production && (!process.env.NEXTAUTH_URL || new URL(process.env.NEXTAUTH_URL).protocol !== "https:")) {
    throw new Error("NEXTAUTH_URL must be the canonical HTTPS application URL in production.");
  }
  return {
    secret,
    pages: { signIn: "/login" },
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    useSecureCookies: production,
    providers: [Credentials({
      name: "Email và mật khẩu",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Mật khẩu", type: "password" } },
      async authorize(credentials, request) {
        let user;
        try {
          user = await authenticateCredentials(getDb(), { email: credentials?.email, password: credentials?.password },
            secret, getTrustedClientIp(new Headers(request.headers)));
        } catch {
          // v4 Credentials forwards thrown messages into a public URL.
          // Sanitize every unexpected failure, including database errors.
          throw new Error("AUTH_UNAVAILABLE");
        }
        if (!user) return null;
        return { id: String(user.user_id), name: user.full_name, email: user.email,
          role: user.role, auth_version: user.auth_version };
      },
    })],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
          token.role = user.role;
          token.auth_version = user.auth_version;
          // Absolute limit survives session polling/refresh. Ignore client session.update payloads.
          token.authenticated_at = Math.floor(Date.now() / 1000);
        } else {
          if (!token.authenticated_at || Date.now() / 1000 - token.authenticated_at >= 8 * 60 * 60) {
            throw new Error("Session expired.");
          }
          const actor = await requireActor(getDb(), { user_id: Number(token.sub), auth_version: token.auth_version ?? -1 });
          token.role = actor.role;
        }
        return token;
      },
      async session({ session, token }) {
        if (!token.role || token.auth_version === undefined) throw new Error("Invalid session identity.");
        session.user = { user_id: Number(token.sub), role: token.role, auth_version: token.auth_version,
          name: token.name, email: token.email };
        return session;
      },
    },
    // NextAuth error metadata may contain provider errors. Never log it or request data.
    logger: { error(code) { console.error("AUTH_ERROR", code); },
      warn(code) { console.warn("AUTH_WARNING", code); }, debug() {} },
  };
}
