import { z } from "zod";
import { apiHandler, AppError } from "@/lib/http";
import { parseObject, readJsonBody } from "@/lib/api";
import { createMailboxOwnership } from "@/lib/ownership";
import { normalizeGeneratedEmail, normalizeMailDomains, normalizeMailHistory } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ domain: z.string().trim().max(255).optional() }).strict();

export function POST(request: Request) {
  return apiHandler("mail_generate", request, async (userId) => {
    const parsed = bodySchema.safeParse(parseObject(await readJsonBody(request)));
    if (!parsed.success) throw new AppError(400, "invalid_request", "Choose a valid mail domain or leave it blank for a random domain.");

    let domain: string | undefined;
    if (parsed.data.domain) {
      const domainsPayload = await providerRequest("/api/mail/domains", { authenticated: true });
      const domains = normalizeMailDomains(domainsPayload);
      domain = domains.find((item) => item.domain.toLowerCase() === parsed.data.domain?.toLowerCase())?.domain;
      if (!domain) throw new AppError(400, "invalid_domain", "Choose a domain from the current provider list.");
    }

    const payload = await providerRequest("/api/mail/generate", {
      method: "POST",
      authenticated: true,
      body: domain ? { domain } : {},
    });
    const generated = normalizeGeneratedEmail(payload);
    try {
      const mailbox = await createMailboxOwnership(userId, generated.email, generated.domain);
      let listedUpstream = false;
      try {
        const history = normalizeMailHistory(await providerRequest("/api/mail/history", { authenticated: true }));
        listedUpstream = history.some((item) => item.email.trim().toLowerCase() === mailbox.email_key);
      } catch {
        // The address remains locally owned; a later refresh can confirm whether it appears upstream.
      }
      return {
        success: true,
        mailbox: {
          id: mailbox.id,
          email: mailbox.email,
          domain: mailbox.domain,
          createdAt: mailbox.created_at.toISOString(),
          listedUpstream,
        },
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "provider_mailbox_already_owned") throw error;
      // There is no documented provider mailbox-release endpoint. Do not expose an address without an owner record.
      throw new AppError(503, "ownership_persist_failed", "The provider created an address, but YoriOTP could not safely record its owner. The address was not shown.");
    }
  });
}
