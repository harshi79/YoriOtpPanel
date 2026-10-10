import { z } from "zod";
import { apiHandler, AppError } from "@/lib/http";
import { parseObject, readJsonBody } from "@/lib/api";
import { createNumberOwnership, finishNumberOwnership, listOwnedActiveNumbers } from "@/lib/ownership";
import { isSameProviderLease, normalizeActiveNumbers, normalizeAllocation, normalizeCountries, normalizeServices, normalizePhone, PROVIDER_LEASE_TOLERANCE_MS } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

async function bestEffortRelease(number: string): Promise<void> {
  try {
    await providerRequest("/api/release_number", {
      method: "POST",
      authenticated: true,
      body: { number },
    });
  } catch {
    // The provider may keep an untracked allocation until its documented lease expires.
  }
}

export function GET(request: Request) {
  return apiHandler("number_list", request, async (userId) => {
    const owned = await listOwnedActiveNumbers(userId);
    if (!owned.length) return { success: true, numbers: [] };

    const payload = await providerRequest("/api/my_numbers", { authenticated: true });
    const providerNumbers = normalizeActiveNumbers(payload);
    const lookup = new Map(providerNumbers.map((item) => [normalizePhone(item.number), item]));
    const numbers = await Promise.all(owned.map(async (session) => {
      const upstream = lookup.get(session.number_key);
      if (upstream?.assigned_at && !isSameProviderLease(upstream.assigned_at, session.assigned_at)) {
        // Cap local history before the new assignment so account-wide OTP history cannot leak its messages.
        const safeEnd = new Date(new Date(upstream.assigned_at).getTime() - PROVIDER_LEASE_TOLERANCE_MS);
        try { await finishNumberOwnership(userId, session.id, "expired", safeEnd); } catch { /* fail closed in the response below */ }
        return null;
      }
      return {
        id: session.id,
        number: session.number,
        service: session.service,
        country: session.country,
        flag: session.flag,
        network: session.network,
        assignedAt: session.assigned_at.toISOString(),
        expiresAt: session.expires_at.toISOString(),
        status: upstream?.assigned_at ? upstream.status ?? "assigned" : "provider_unavailable",
        // my_numbers omits an OTP timestamp. Do not expose its latest_otp fields: a recycled
        // provider number could otherwise surface a prior renter's code.
        otp: null,
        message: null,
      };
    }));
    return { success: true, numbers: numbers.filter((item): item is NonNullable<typeof item> => item !== null) };
  });
}

const requestSchema = z.object({
  service: z.string().trim().min(1).max(80),
  country: z.string().trim().max(120).optional(),
}).strict();

export function POST(request: Request) {
  return apiHandler("number_request", request, async (userId) => {
    const input = requestSchema.safeParse(parseObject(await readJsonBody(request)));
    if (!input.success) throw new AppError(400, "invalid_request", "Select a valid service and country.");

    const services = normalizeServices(await providerRequest("/api/services"));
    const service = services.find((item) => item.key === input.data.service);
    if (!service) throw new AppError(400, "invalid_service", "That service is no longer available. Refresh inventory and try again.");
    if (service.count <= 0) throw new AppError(409, "service_unavailable", "No inventory is currently available for that service.");

    let countryValue: string | undefined;
    if (input.data.country && input.data.country.toLowerCase() !== "random") {
      const countries = normalizeCountries(await providerRequest("/api/countries", { query: { service: service.key } }));
      const chosen = countries.find((item) =>
        item.name.toLowerCase() === input.data.country?.toLowerCase() ||
        item.displayName.toLowerCase() === input.data.country?.toLowerCase() ||
        item.requestValue.toLowerCase() === input.data.country?.toLowerCase(),
      );
      if (!chosen) throw new AppError(400, "invalid_country", "Choose a country from the current inventory list.");
      if (chosen.count <= 0) throw new AppError(409, "country_unavailable", "No inventory is currently available for that country.");
      countryValue = chosen.requestValue;
    }

    const payload = await providerRequest("/api/request_number", {
      method: "POST",
      authenticated: true,
      body: { service: service.key, ...(countryValue ? { country: countryValue } : {}) },
    });
    let allocation: ReturnType<typeof normalizeAllocation>;
    try {
      allocation = normalizeAllocation(payload);
    } catch (error) {
      const raw = payload !== null && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : null;
      if (typeof raw?.number === "string" && raw.number.trim().length >= 3) await bestEffortRelease(raw.number);
      throw error;
    }
    const normalizedAllocation = {
      ...allocation,
      service: allocation.service ?? service.name,
      country: allocation.country ?? countryValue,
    };

    try {
      const session = await createNumberOwnership(userId, normalizedAllocation);
      return {
        success: true,
        number: {
          id: session.id,
          number: session.number,
          service: session.service,
          country: session.country,
          flag: session.flag,
          network: session.network,
          assignedAt: session.assigned_at.toISOString(),
          expiresAt: session.expires_at.toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "provider_number_already_leased") throw error;
      // The allocation succeeded upstream but ownership could not be stored. Release it if safe;
      // never expose a number without a local owner record.
      await bestEffortRelease(allocation.number);
      throw new AppError(503, "ownership_persist_failed", "The number was allocated but YoriOTP could not safely record its owner. A release was attempted; contact the panel owner if it remains active.");
    }
  });
}
