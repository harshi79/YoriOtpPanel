import { AppError, apiHandler } from "@/lib/http";
import { normalizeCountries, normalizeServices } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("inventory", request, async () => {
    const service = new URL(request.url).searchParams.get("service")?.trim();
    if (service && service.length > 80) throw new AppError(400, "invalid_service", "Choose a service from the current provider list.");
    if (service) {
      const services = normalizeServices(await providerRequest("/api/services"));
      if (!services.some((item) => item.key === service)) {
        throw new AppError(400, "invalid_service", "Choose a service from the current provider list.");
      }
    }
    const payload = await providerRequest("/api/countries", { query: { service } });
    return { success: true, countries: normalizeCountries(payload) };
  });
}
