import { apiHandler } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { assertUuid } from "@/lib/api";
import { finishNumberOwnership, getOwnedActiveNumber } from "@/lib/ownership";
import { verifyCurrentProviderLease } from "@/lib/provider/lease";
import { isWithinLeaseWindow, normalizeOtpResponse, PROVIDER_LEASE_TOLERANCE_MS } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export function GET(request: Request, context: Context) {
  return apiHandler("otp_poll", request, async (userId) => {
    const { id: rawId } = await context.params;
    const id = assertUuid(rawId);
    const session = await getOwnedActiveNumber(userId, id);
    const payload = await providerRequest("/api/latest_otp", {
      authenticated: true,
      query: { number: session.number },
    });
    const result = normalizeOtpResponse(payload);
    // Re-check the provider assignment after polling to reduce the number-reuse race window.
    const providerLease = await verifyCurrentProviderLease(session);
    if (providerLease.status === "changed") {
      const safeEnd = new Date(providerLease.assignedAt.getTime() - PROVIDER_LEASE_TOLERANCE_MS);
      await finishNumberOwnership(userId, session.id, "expired", safeEnd);
      throw new AppError(410, "provider_lease_changed", "The provider reassigned this number. Its previous session was closed and no OTP was returned.");
    }
    if (providerLease.status === "missing") throw new AppError(409, "provider_session_unavailable", "NumberPanel no longer lists this active number. No OTP was returned; refresh the session list before trying again.");
    const belongsToCurrentLease = result.has_otp && isWithinLeaseWindow(
      result.received_at,
      session.assigned_at,
      session.expires_at,
    );
    return {
      success: true,
      id: session.id,
      number: session.number,
      hasOtp: belongsToCurrentLease,
      otp: belongsToCurrentLease ? result.otp_code ?? null : null,
      message: belongsToCurrentLease ? result.message ?? null : null,
      receivedAt: belongsToCurrentLease ? result.received_at ?? null : null,
      expiresAt: session.expires_at.toISOString(),
    };
  });
}
