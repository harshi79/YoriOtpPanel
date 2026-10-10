import { apiHandler } from "@/lib/http";
import { normalizeServices } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("inventory", request, async () => {
    const payload = await providerRequest("/api/services");
    return { success: true, services: normalizeServices(payload) };
  });
}
