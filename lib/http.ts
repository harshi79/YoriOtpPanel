import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
export { AppError } from "@/lib/errors";

export function jsonError(error: unknown): NextResponse {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, "internal_error", "The request could not be completed.");
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
