import { apiHandler } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { assertUuid } from "@/lib/api";
import { finishNumberOwnership, getOwnedActiveNumber } from "@/lib/ownership";
import { verifyCurrentProviderLease } from "@/lib/provider/lease";
import { providerRequest } from "@/lib/provider/client";
import { PROVIDER_LEASE_TOLERANCE_MS } from "@/lib/provider/normalize";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export function POST(request: Request, context: Context) {
  return apiHandler("number_release", request, async (userId) => {
    const { id: rawId } = await context.params;
    const id = assertUuid(rawId);
    const session = await getOwnedActiveNumber(userId, id);
    const providerLease = await verifyCurrentProviderLease(session);
    if (providerLease.status === "changed") {
      const safeEnd = new Date(providerLease.assignedAt.getTime() - PROVIDER_LEASE_TOLERANCE_MS);
      await finishNumberOwnership(userId, session.id, "expired", safeEnd);
      throw new AppError(410, "provider_lease_changed", "The provider reassigned this number. YoriOTP closed the old session and did not release the new one.");
    }
    if (providerLease.status === "missing") throw new AppError(409, "provider_session_unavailable", "NumberPanel no longer lists this active number; YoriOTP did not issue a release request.");
    const releaseStartedAt = new Date();
    await providerRequest("/api/release_number", {
      method: "POST",
      authenticated: true,
      body: { number: session.number },
    });
    await finishNumberOwnership(userId, session.id, "released", releaseStartedAt);
    return { success: true, released: true };
  });
}
