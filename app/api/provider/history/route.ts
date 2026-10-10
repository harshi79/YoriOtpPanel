import { apiHandler, AppError } from "@/lib/http";
import { assertUuid } from "@/lib/api";
import { capNumberHistoryAt, listOwnedNumberHistory } from "@/lib/ownership";
import {
  isSameProviderLease,
  isWithinLeaseWindow,
  normalizeActiveNumbers,
  normalizeOtpHistory,
  normalizePhone,
  PROVIDER_LEASE_TOLERANCE_MS,
} from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("history", request, async (userId) => {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    const localSessions = await listOwnedNumberHistory(userId, 200);
    if (!localSessions.length) return { success: true, otps: [], limit: 200 };

    let requestedSessionId: string | undefined;
    if (sessionId) {
      requestedSessionId = assertUuid(sessionId).toLowerCase();
      if (!localSessions.some((item) => item.id === requestedSessionId)) {
        throw new AppError(404, "resource_not_found", "The requested number history was not found.");
      }
    }

    const candidateSessions = requestedSessionId
      ? localSessions.filter((item) => item.id === requestedSessionId)
      : localSessions;
    const selectedNumber = requestedSessionId ? candidateSessions[0]?.number : undefined;

    // Fetch the account-wide OTP response first, then re-check assignments before returning any codes.
    const payload = await providerRequest("/api/my_otps", {
      authenticated: true,
      query: { ...(selectedNumber ? { number: selectedNumber } : {}), limit: 200 },
    });
    const providerNumbers = normalizeActiveNumbers(await providerRequest("/api/my_numbers", { authenticated: true }));
    const currentByNumber = new Map(providerNumbers.map((item) => [normalizePhone(item.number), item]));
    const now = Date.now();
    const verifiedSessions: typeof localSessions = [];

    for (const session of candidateSessions) {
      const upstream = currentByNumber.get(session.number_key);
      if (!upstream) {
        // A missing provider number cannot be verified while its local lease is still live.
        if (!session.released_at && session.expires_at.getTime() > now) continue;
        verifiedSessions.push(session);
        continue;
      }
      if (!upstream.assigned_at) continue;

      if (!isSameProviderLease(upstream.assigned_at, session.assigned_at)) {
        const providerAssignedAt = new Date(upstream.assigned_at);
        if (!Number.isFinite(providerAssignedAt.getTime())) continue;
        const changedLeaseEnd = new Date(providerAssignedAt.getTime() - PROVIDER_LEASE_TOLERANCE_MS);
        await capNumberHistoryAt(userId, session.id, changedLeaseEnd);
        const previousEnd = session.released_at ?? session.expires_at;
        const effectiveEnd = new Date(Math.min(previousEnd.getTime(), changedLeaseEnd.getTime()));
        if (effectiveEnd.getTime() > session.assigned_at.getTime()) {
          verifiedSessions.push({ ...session, released_at: effectiveEnd });
        }
        continue;
      }
      verifiedSessions.push(session);
    }

    if (!verifiedSessions.length) return { success: true, otps: [], limit: 200 };

    const otps = normalizeOtpHistory(payload)
      .filter((item) => verifiedSessions.some((session) =>
        session.number_key === normalizePhone(item.number) &&
        isWithinLeaseWindow(item.timestamp, session.assigned_at, session.released_at ?? session.expires_at),
      ))
      .filter((item) => !selectedNumber || normalizePhone(item.number) === normalizePhone(selectedNumber))
      .slice(0, 200)
      .map((item) => ({
        service: item.service ?? "Unknown service",
        number: item.number,
        code: item.otp_code ?? null,
        message: item.full_message ?? null,
        receivedAt: item.timestamp ?? null,
        country: item.country ?? null,
      }));
    return { success: true, otps, limit: 200 };
  });
}
