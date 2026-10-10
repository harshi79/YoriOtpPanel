import { AppError, apiHandler } from "@/lib/http";
import { assertUuid } from "@/lib/api";
import { getOwnedMailbox } from "@/lib/ownership";
import { normalizeMailHistory, normalizeMailMessages } from "@/lib/provider/normalize";
import { providerRequest } from "@/lib/provider/client";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export function GET(request: Request, context: Context) {
  return apiHandler("mail_messages", request, async (userId) => {
    const { id: rawId } = await context.params;
    const id = assertUuid(rawId);
    const mailbox = await getOwnedMailbox(userId, id);
    const providerHistory = await providerRequest("/api/mail/history", { authenticated: true });
    const listedAddresses = new Set(normalizeMailHistory(providerHistory).map((item) => item.email.trim().toLowerCase()));
    if (!listedAddresses.has(mailbox.email_key)) {
      throw new AppError(410, "mailbox_not_listed", "NumberPanel no longer lists this address. No messages were requested.");
    }
    const payload = await providerRequest("/api/mail/messages", {
      authenticated: true,
      query: { email: mailbox.email },
    });
    const messages = normalizeMailMessages(payload).map((item) => ({
      id: item.id,
      from: item.from ?? null,
      subject: item.subject ?? null,
      receivedAt: item.receivedAt ?? null,
      text: item.text ?? null,
      html: item.html ?? null,
    }));
    return { success: true, mailbox: { id: mailbox.id, email: mailbox.email }, messages };
  });
}
