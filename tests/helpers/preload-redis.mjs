import { mockRedisRest } from "./test-redis.mjs";

// Explicit test process only. No application code imports this preload.
if (process.env.GO_TRAIL_MOCK_REDIS === "1") {
  const redis = mockRedisRest();
  process.on("message", (message) => {
    if (message?.type !== "test-redis-availability" || !Number.isSafeInteger(message.id)
      || typeof message.unavailable !== "boolean") return;
    redis.setUnavailable(message.unavailable);
    process.send?.({ type: "test-redis-availability-ack", id: message.id });
  });
}
