// REST protocol test double. It does not execute Lua; test:auth:redis verifies
// the real script on Upstash. Unit/service tests never load .env or use network.
export function mockRedisRest() {
  const previous = Object.fromEntries(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "AUTH_RATE_LIMIT_NAMESPACE"]
    .map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const counters = new Map();
  const state = { unavailable: false, timeout: false, calls: 0, counters };
  process.env.UPSTASH_REDIS_REST_URL = "https://isolated-test.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "isolated-placeholder-token";
  process.env.AUTH_RATE_LIMIT_NAMESPACE = "go-trail:auth:test";
  globalThis.fetch = async (url, options) => {
    state.calls++;
    if (new URL(url).hostname !== "isolated-test.upstash.io") throw new Error("Unit tests must not use external services");
    if (state.unavailable) throw new Error("provider token=must-not-leak");
    if (state.timeout) return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
    const [command, , keyCount, key, limit, windowMs] = JSON.parse(options.body);
    if (command !== "eval" || Number(keyCount) !== 1) throw new Error("Unexpected mock command");
    const now = Date.now();
    let bucket = counters.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { attempts: 0, expiresAt: now + Number(windowMs) };
      counters.set(key, bucket);
    }
    bucket.attempts = Math.min(bucket.attempts + 1, Number(limit) + 1);
    return Response.json({ result: [bucket.attempts, bucket.expiresAt - now] });
  };
  return { counters,
    get calls() { return state.calls; },
    setUnavailable(value) { state.unavailable = value; },
    setTimeout(value) { state.timeout = value; },
    reset() { counters.clear(); state.unavailable = false; state.timeout = false; state.calls = 0; },
    close() {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    },
  };
}
