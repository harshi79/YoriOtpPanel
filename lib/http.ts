import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
export { AppError } from "@/lib/errors";

function summarizeError(error: unknown, depth = 0): Record<string, string> | string {
  if (error === null || typeof error !== "object" || depth > 2) {
    return typeof error === "string" ? error.slice(0, 300) : typeof error;
  }
  const record = error as Record<string, unknown>;
  const summary: Record<string, string> = {};
  // Strict field allowlist: driver errors can carry connection details, so only
  // the name, code, and message are logged — never the full error object.
  if (typeof record.name === "string") summary.name = record.name.slice(0, 80);
  if (typeof record.code === "string") summary.code = record.code.slice(0, 80);
  if (record.code !== undefined && typeof record.code !== "string") summary.code = String(record.code).slice(0, 80);
  if (typeof record.message === "string") summary.message = record.message.slice(0, 500);
  if ("cause" in record && record.cause !== error) {
    const cause = summarizeError(record.cause, depth + 1);
    summary.cause = typeof cause === "string" ? cause : JSON.stringify(cause).slice(0, 500);
  }
  return summary;
}

function logApiError(appError: AppError, original: unknown): void {
  // Server faults, outages, and throttling are worth a log line; routine 4xx
  // responses (unauthorized, not found, validation) would only add noise.
  if (appError.status < 500 && appError.status !== 429) return;
  try {
    const payload: Record<string, unknown> = {
      level: appError.status >= 500 ? "error" : "warn",
      status: appError.status,
      code: appError.code,
      message: appError.message,
      cause: summarizeError(original),
    };
    if (appError.status >= 500 && original instanceof Error && original.stack) {
      payload.stack = original.stack.slice(0, 2000);
    }
    console.error(JSON.stringify(payload));
  } catch {
    // Logging must never break the error response.
  }
}

export function jsonError(error: unknown): NextResponse {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, "internal_error", "The request could not be completed.");
  logApiError(appError, error);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (appError.retryAfter) headers.set("Retry-After", String(appError.retryAfter));
  return NextResponse.json(
    { success: false, error: appError.message, code: appError.code },
    { status: appError.status, headers },
  );
}

function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  const expectedHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host)
    .split(",")[0]
    .trim();
  if (!origin) throw new AppError(403, "origin_required", "A same-origin request is required.");
  try {
    const originUrl = new URL(origin);
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    if (originUrl.host !== expectedHost || (forwardedProto && originUrl.protocol !== `${forwardedProto}:`)) {
      throw new AppError(403, "origin_mismatch", "Cross-origin actions are not permitted.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(403, "invalid_origin", "A valid same-origin request is required.");
  }
}

export async function apiHandler(
  action: string,
  request: Request,
  handler: (userId: string) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { requireUserId } = await import("@/lib/auth");
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const userId = await requireUserId();
    await enforceRateLimit(userId, action);
    const data = await handler(userId);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

// Authenticated handler with an in-memory throttle instead of the durable
// database-backed one. Reserved for diagnostics routes (settings, health) that
// must keep working when the database itself is misconfigured or down.
export async function apiStatusHandler(
  request: Request,
  handler: (userId: string) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { requireUserId } = await import("@/lib/auth");
    const { enforceMemoryRateLimit } = await import("@/lib/rate-limit");
    const userId = await requireUserId();
    enforceMemoryRateLimit(`status:${userId}`, 60, 60);
    const data = await handler(userId);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function ownerApiHandler(
  action: string,
  request: Request,
  handler: (userId: string) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { requireOwnerId } = await import("@/lib/auth");
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const userId = await requireOwnerId();
    await enforceRateLimit(userId, action);
    const data = await handler(userId);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
