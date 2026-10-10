import { apiHandler } from "@/lib/http";
import { normalizeMailDomains } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("mail_domains", request, async () => {
    // An unauthenticated live read returned Unauthorized; keep this server-side and key-authenticated.
    const payload = await providerRequest("/api/mail/domains", { authenticated: true });
    return { success: true, domains: normalizeMailDomains(payload) };
  });
}
