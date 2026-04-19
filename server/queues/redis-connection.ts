/**
 * Shared Redis connection for BullMQ.
 *
 * Reads REDIS_URL from env. We expect the Upstash native-Redis endpoint
 * (rediss://… on port 6379, not the REST API) — BullMQ speaks the wire
 * protocol and is incompatible with Upstash's HTTP-only offering.
 *
 * Upstash gotchas handled here:
 *   - `maxRetriesPerRequest: null` — required by BullMQ Workers so blocking
 *     reads don't abort after N retries.
 *   - `enableReadyCheck: false` — Upstash closes idle connections; the
 *     ready-check ping confuses it on reconnects.
 *   - `rediss://` → TLS implicit via ioredis auto-detection.
 */

import IORedis, { type RedisOptions } from "ioredis";

const url = process.env.REDIS_URL;
if (!url) {
  // Fail loud at boot — a queue without a connection is a silent data loss hazard.
  throw new Error(
    "REDIS_URL is required. Paste your Upstash connection string (rediss://…) into .env."
  );
}

// ioredis accepts a URL string in the constructor but we want to layer extra
// options on top (BullMQ requirements), so parse once and hand pieces over.
const parsed = new URL(url);

export const redisConnectionOptions: RedisOptions = {
  host: parsed.hostname,
  port: Number(parsed.port || 6379),
  username: parsed.username || undefined,
  password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  tls: parsed.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

/**
 * Create a fresh ioredis client. BullMQ wants a *dedicated* connection per
 * Worker + per Queue — sharing one causes blocking-read deadlocks.
 */
export function createRedisClient() {
  return new IORedis(redisConnectionOptions);
}
