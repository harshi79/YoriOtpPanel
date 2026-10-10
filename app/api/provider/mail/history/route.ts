import { apiHandler } from "@/lib/http";
import { listOwnedMailboxes, toMailboxSummary } from "@/lib/ownership";
import { normalizeMailHistory } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("mail_history", request, async (userId) => {
    const owned = await listOwnedMailboxes(userId);
    if (!owned.length) return { success: true, mailboxes: [] };

    const payload = await providerRequest("/api/mail/history", { authenticated: true });
    const providerEmails = new Set(normalizeMailHistory(payload).map((mail) => mail.email.trim().toLowerCase()));
    return {
      success: true,
      mailboxes: owned.map((mailbox) => toMailboxSummary(mailbox, providerEmails)),
    };
  });
}
