import "server-only";
import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";

// Scheduler identity comes only from a server-side Bearer secret, never from a browser session.
export function assertCronSecret(authorization: string | null, env: NodeJS.ProcessEnv = process.env): void {
  const secret = env.CRON_SECRET ?? "";
  if (secret.length < 32 || secret.length > 256 || !/^[A-Za-z0-9._~+\/-]+={0,2}$/.test(secret)) {
    throw new AppError("CRON_UNAVAILABLE", 503);
  }
  const match = authorization && authorization.length <= 270 ? /^Bearer ([A-Za-z0-9._~+\/-]+={0,2})$/i.exec(authorization) : null;
  if (!match) throw new AppError("UNAUTHENTICATED", 401);
  const expected = Buffer.from(secret, "utf8"), actual = Buffer.from(match[1], "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AppError("UNAUTHENTICATED", 401);
}
