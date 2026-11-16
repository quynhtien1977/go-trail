import "server-only";
import { isIP } from "node:net";
import { AppError } from "@/server/errors";
import { createAtomicRateLimiter, type RateLimitStore } from "@/server/repositories/rate-limits";
import { getAuthRedis, getRedisConfig } from "@/server/auth/redis";

export function getBookingRateLimitNamespace(env: NodeJS.ProcessEnv = process.env): string {
  const namespace = env.BOOKING_RATE_LIMIT_NAMESPACE || `go-trail:booking:${env.VERCEL_ENV ?? env.NODE_ENV ?? "development"}`;
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(namespace)) throw new AppError("BOOKING_UNAVAILABLE", 503);
  return namespace;
}

export function createBookingRateLimiter(store: RateLimitStore, namespace: string, secret: string) {
  try {
    const consume = createAtomicRateLimiter(store, namespace, 60000);
    return async (userId: number, trustedSource?: string) => {
      try {
        if (!Number.isSafeInteger(userId) || userId < 1 || (trustedSource !== undefined && !isIP(trustedSource))) throw new Error();
        const user = await consume("hold-user", String(userId), secret, 10);
        if (!user.allowed) throw new AppError("RATE_LIMITED", 429, user.retry_after);
        if (trustedSource !== undefined) {
          const source = await consume("hold-source", trustedSource, secret, 50);
          if (!source.allowed) throw new AppError("RATE_LIMITED", 429, source.retry_after);
        }
      } catch (error) {
        if (error instanceof AppError && error.code === "RATE_LIMITED") throw error;
        throw new AppError("BOOKING_UNAVAILABLE", 503);
      }
    };
  } catch { throw new AppError("BOOKING_UNAVAILABLE", 503); }
}

export async function consumeBookingRateLimit(userId: number, trustedSource?: string) {
  try {
    getRedisConfig(); // Revalidate even when the shared SDK client has already been initialized.
    await createBookingRateLimiter(getAuthRedis(), getBookingRateLimitNamespace(), process.env.AUTH_SECRET ?? "")(userId, trustedSource);
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") throw error;
    throw new AppError("BOOKING_UNAVAILABLE", 503);
  }
}
