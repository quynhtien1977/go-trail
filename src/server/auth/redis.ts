import "server-only";
import { Redis } from "@upstash/redis";
import { AppError } from "@/server/errors";

export function getRedisConfig(env: NodeJS.ProcessEnv = process.env): { url: string; token: string } {
  try {
    const url = new URL(env.UPSTASH_REDIS_REST_URL ?? "");
    const token = env.UPSTASH_REDIS_REST_TOKEN;
    if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") || url.port || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash || !token || token.trim() !== token) throw new Error();
    return { url: url.origin, token };
  } catch { throw new AppError("AUTH_UNAVAILABLE", 503); }
}

let client: Redis | undefined;
export function getAuthRedis(): Redis {
  // Lazy: builds and unauthenticated reads do not require Redis credentials.
  client ??= new Redis({ ...getRedisConfig(), enableTelemetry: false, enableAutoPipelining: false,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(2000) });
  return client;
}
