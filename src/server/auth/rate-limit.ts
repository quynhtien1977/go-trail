import "server-only";
import { AppError } from "@/server/errors";
import { getAuthRedis } from "./redis";
import { createAtomicRateLimiter, type RateLimitStore } from "@/server/repositories/rate-limits";

export function getRateLimitNamespace(env: NodeJS.ProcessEnv = process.env): string {
  const namespace = env.AUTH_RATE_LIMIT_NAMESPACE || `go-trail:auth:${env.VERCEL_ENV ?? env.NODE_ENV ?? "development"}`;
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(namespace)) throw new AppError("AUTH_UNAVAILABLE", 503);
  return namespace;
}

export function createRateLimiter(store: RateLimitStore, namespace: string, windowMs = 15 * 60 * 1000) {
  try {
    const consume = createAtomicRateLimiter(store, namespace, windowMs);
    return async (...args: Parameters<typeof consume>) => {
      try { return await consume(...args); }
      catch { throw new AppError("AUTH_UNAVAILABLE", 503); }
    };
  } catch { throw new AppError("AUTH_UNAVAILABLE", 503); }
}

export async function consumeRateLimit(scope: string, identity: string, secret: string, limit: number) {
  return createRateLimiter(getAuthRedis(), getRateLimitNamespace())(scope, identity, secret, limit);
}
