import "server-only";
import { createHmac } from "node:crypto";

export type RateLimitStore = { eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> };

// One atomic counter + TTL operation; blocked attempts never extend the window.
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

// Shared data-access mechanism. Each Business caller owns its policy/error mapping.
export function createAtomicRateLimiter(store: RateLimitStore, namespace: string, windowMs = 900000) {
  if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(namespace) || !Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 900000) {
    throw new Error("Invalid rate-limit configuration");
  }
  return async function consume(scope: string, identity: string, secret: string, limit: number)
    : Promise<{ allowed: boolean; retry_after: number }> {
    if (secret.length < 32 || !/^[a-z-]{1,64}$/.test(scope) || !identity
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid rate-limit configuration");
    const digest = createHmac("sha256", secret).update(JSON.stringify([namespace, scope, identity])).digest("hex");
    try {
      const result = await store.eval(consumeScript, [`${namespace}:v1:${digest}`], [limit, windowMs]);
      if (!Array.isArray(result) || result.length !== 2
        || !Number.isSafeInteger(result[0]) || result[0] < 1 || result[0] > limit + 1
        || !Number.isSafeInteger(result[1]) || result[1] < 1 || result[1] > windowMs) throw new Error();
      return { allowed: result[0] <= limit, retry_after: Math.ceil(result[1] / 1000) };
    } catch {
      // Never propagate provider diagnostics, credentials or endpoints.
      throw new Error("Rate-limit store unavailable");
    }
  };
}
