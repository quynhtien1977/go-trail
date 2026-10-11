import "server-only";
import { isIP } from "node:net";

// Only Vercel's platform-owned header is trusted. Never trust arbitrary X-Forwarded-For.
// Other hosts must configure their trusted ingress limiter before public deployment.
export function getTrustedClientIp(headers: { get(name: string): string | null }): string | undefined {
  if (process.env.VERCEL !== "1") return undefined;
  const ip = headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || !isIP(ip)) throw new Error("Trusted client source unavailable.");
  return ip;
}
