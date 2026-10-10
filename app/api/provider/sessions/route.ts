import { apiHandler } from "@/lib/http";
import { listOwnedNumberHistory } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("history", request, async (userId) => {
    const sessions = await listOwnedNumberHistory(userId, 200);
    return {
      success: true,
      sessions: sessions.map((item) => ({
        id: item.id,
        number: item.number,
        service: item.service,
        country: item.country,
        assignedAt: item.assigned_at.toISOString(),
        expiresAt: item.expires_at.toISOString(),
        status: item.end_reason ?? (item.expires_at.getTime() > Date.now() ? "active" : "expired"),
      })),
    };
  });
}
