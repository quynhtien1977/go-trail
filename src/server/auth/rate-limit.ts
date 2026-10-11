import "server-only";
import { createHmac } from "node:crypto";
import { AppError } from "@/server/errors";
import { getAuthRedis } from "./redis";

// Anchored to the first attempt, rather than calendar-aligned windows.
// One atomic script sets counter + TTL; later attempts never extend the expiry.
const consumeScript = `
local ttl = redis.call('PTTL', KEYS[1])
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
if ttl == -2 or ttl == 0 then
  redis.call('SET', KEYS[1], 1, 'PX', window)
  return {1, window}
end
local count = tonumber(redis.call('GET', KEYS[1]))
if ttl < 0 or not count or count < 1 or count ~= math.floor(count) then
  return redis.error_reply('Invalid rate counter')
end
if count <= limit then count = redis.call('INCR', KEYS[1]) end
return {count, ttl}
`;

type RateLimitStore = { eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> };

export function getRateLimitNamespace(env: NodeJS.ProcessEnv = process.env): string {
  const namespace = env.AUTH_RATE_LIMIT_NAMESPACE || `go-trail:auth:${env.VERCEL_ENV ?? env.NODE_ENV ?? "development"}`;
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(namespace)) throw new AppError("AUTH_UNAVAILABLE", 503);
  return namespace;
}

export function createRateLimiter(store: RateLimitStore, namespace: string, windowMs = 15 * 60 * 1000) {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(namespace) || !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 900000) {
    throw new AppError("AUTH_UNAVAILABLE", 503);
  }
  return async function consume(scope: string, identity: string, secret: string, limit: number)
    : Promise<{ allowed: boolean; retry_after: number }> {
    if (secret.length < 32 || !/^[a-z-]{1,64}$/.test(scope) || !identity
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new AppError("AUTH_UNAVAILABLE", 503);
    const digest = createHmac("sha256", secret).update(JSON.stringify([namespace, scope, identity])).digest("hex");
    try {
      const result = await store.eval(consumeScript, [`${namespace}:v1:${digest}`], [limit, windowMs]);
      if (!Array.isArray(result) || result.length !== 2
        || !Number.isSafeInteger(result[0]) || result[0] < 1 || result[0] > limit + 1
        || !Number.isSafeInteger(result[1]) || result[1] < 1 || result[1] > windowMs) throw new Error();
      return { allowed: result[0] <= limit, retry_after: Math.ceil(result[1] / 1000) };
    } catch {
      // Provider errors can include credentials/endpoints; never propagate their details.
      throw new AppError("AUTH_UNAVAILABLE", 503);
    }
  };
}

export async function consumeRateLimit(scope: string, identity: string, secret: string, limit: number) {
  return createRateLimiter(getAuthRedis(), getRateLimitNamespace())(scope, identity, secret, limit);
}
