import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { appRateLimits, databaseNowMs } from "@/db/schema";
import { getDb, withDatabaseErrors } from "@/lib/db";
import { AppError } from "@/lib/errors";

const LIMITS = {
  inventory: { max: 60, seconds: 60 },
  number_request: { max: 8, seconds: 60 },
  number_list: { max: 30, seconds: 60 },
  otp_poll: { max: 20, seconds: 60 },
  history: { max: 10, seconds: 60 },
  number_release: { max: 10, seconds: 60 },
  mail_domains: { max: 30, seconds: 60 },
  mail_generate: { max: 8, seconds: 60 },
  mail_history: { max: 20, seconds: 60 },
  mail_messages: { max: 20, seconds: 60 },
  admin_overview: { max: 20, seconds: 60 },
} as const;

export type RateLimitAction = keyof typeof LIMITS;

export async function enforceRateLimit(userId: string, action: string): Promise<void> {
  if (!(action in LIMITS)) throw new AppError(500, "invalid_rate_limit_action", "The requested action is not available.");
  const key = action as RateLimitAction;
  const rule = LIMITS[key];
  const digest = createHash("sha256").update(`${userId}:${key}`).digest("hex");
  const bucket = `${key}:${digest}`;
  // The only fallible I/O below is the database write, so a driver failure is
  // reported as 503 with setup guidance instead of a generic 500.
  const [row] = await withDatabaseErrors(() => getDb().insert(appRateLimits).values({
    bucket, window_start: databaseNowMs, request_count: 1,
  }).onConflictDoUpdate({
    target: appRateLimits.bucket,
    set: {
      request_count: sql`case
        when ${appRateLimits.window_start} <= ${databaseNowMs} - ${rule.seconds * 1000} then 1
        else ${appRateLimits.request_count} + 1 end`,
      window_start: sql`case
        when ${appRateLimits.window_start} <= ${databaseNowMs} - ${rule.seconds * 1000} then ${databaseNowMs}
        else ${appRateLimits.window_start} end`,
    },
  }).returning());
  const count = Number(row.request_count);
  if (count > rule.max) {
    const resetAt = new Date(row.window_start).getTime() + rule.seconds * 1000;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    throw new AppError(429, "app_rate_limited", "Too many requests. Please wait briefly and try again.", retryAfter);
  }
}

// Best-effort per-instance throttle for diagnostics routes (health, settings)
// that must stay available when the database itself is down. It is intentionally
// separate from the durable database-backed limits above.
const memoryBuckets = new Map<string, { windowStart: number; count: number }>();

export function enforceMemoryRateLimit(bucket: string, max = 60, seconds = 60): void {
  const now = Date.now();
  const windowMs = Math.max(1000, seconds * 1000);
  const entry = memoryBuckets.get(bucket);
  if (!entry || entry.windowStart + windowMs <= now) {
    memoryBuckets.set(bucket, { windowStart: now, count: 1 });
    if (memoryBuckets.size > 5000) {
      for (const [key, value] of memoryBuckets) {
        if (value.windowStart + windowMs <= now) memoryBuckets.delete(key);
      }
    }
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    const retryAfter = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
    throw new AppError(429, "app_rate_limited", "Too many requests. Please wait briefly and try again.", retryAfter);
  }
}
