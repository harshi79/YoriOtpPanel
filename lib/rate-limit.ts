import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { appRateLimits, databaseNowMs } from "@/db/schema";
import { getDb } from "@/lib/db";
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
  const [row] = await getDb().insert(appRateLimits).values({
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
  }).returning();
  const count = Number(row.request_count);
  if (count > rule.max) {
    const resetAt = new Date(row.window_start).getTime() + rule.seconds * 1000;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    throw new AppError(429, "app_rate_limited", "Too many requests. Please wait briefly and try again.", retryAfter);
  }
}
