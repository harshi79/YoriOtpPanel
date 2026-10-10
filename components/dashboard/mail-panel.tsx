"use client";

import { useCallback, useEffect, useState } from "react";
import { AtSign, Check, Copy, Inbox, LoaderCircle, Mail, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { clientApi, formatDate, messageFor } from "@/lib/client-api";
import { startSafePoll } from "@/components/dashboard/polling";
import { EmptyState, ErrorNotice, LoadingCard, PageHeading, SectionCard, StatusMessage } from "@/components/dashboard/ui";

type Domain = { domain: string };
type Mailbox = { id: string; email: string; domain: string; createdAt: string; listedUpstream: boolean };
type Message = { id: string; from: string | null; subject: string | null; receivedAt: string | null; text: string | null; html: string | null };

export function MailPanel() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [domain, setDomain] = useState("");
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [mailboxesLoading, setMailboxesLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    try { const data = await clientApi<{ domains: Domain[] }>("/api/provider/mail/domains"); setDomains(data.domains); setError(null); }
    catch (cause) { setError(messageFor(cause)); }
    finally { setDomainsLoading(false); }
  }, []);
  const loadDomains = useCallback(async () => { setDomainsLoading(true); await fetchDomains(); }, [fetchDomains]);

  const fetchMailboxes = useCallback(async () => {
    try { const data = await clientApi<{ mailboxes: Mailbox[] }>("/api/provider/mail/history"); setMailboxes(data.mailboxes); setError(null); }
    catch (cause) { setError(messageFor(cause)); }
    finally { setMailboxesLoading(false); }
  }, []);
  const loadMailboxes = useCallback(async () => { setMailboxesLoading(true); await fetchMailboxes(); }, [fetchMailboxes]);

  const fetchMessages = useCallback(async (id: string) => {
    try {
      const data = await clientApi<{ messages: Message[] }>(`/api/provider/mail/${id}/messages`);
      setMessages(data.messages);
      setError(null);
    } catch (cause) { setError(messageFor(cause)); }
    finally { setMessagesLoading(false); }
  }, []);
  const loadMessages = useCallback(async (id: string) => { setMessagesLoading(true); await fetchMessages(id); }, [fetchMessages]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchDomains(); void fetchMailboxes(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchDomains, fetchMailboxes]);
  useEffect(() => {
    if (!selectedId) return;
    const initial = window.setTimeout(() => { void fetchMessages(selectedId); }, 0);
    const stop = startSafePoll(() => { void fetchMessages(selectedId); }, 15_000);
    return () => { window.clearTimeout(initial); stop(); };
  }, [selectedId, fetchMessages]);

  async function generateMailbox(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGenerating(true); setError(null); setSuccess(null);
    try {
      const data = await clientApi<{ mailbox: Mailbox }>("/api/provider/mail/generate", {
        method: "POST",
        body: JSON.stringify(domain ? { domain } : {}),
      });
      setMailboxes((current) => [data.mailbox, ...current.filter((item) => item.id !== data.mailbox.id)]);
      setMessages([]);
      if (data.mailbox.listedUpstream) {
        setMessagesLoading(true);
        setSelectedId(data.mailbox.id);
        setSuccess("Temporary address created, recorded, and listed upstream.");
      } else {
        setMessagesLoading(false);
        setSelectedId(null);
        setSuccess("Address recorded to your account. The provider has not listed it yet; refresh before opening its inbox.");
      }
    } catch (cause) { setError(messageFor(cause)); }
    finally { setGenerating(false); }
  }

  async function copyAddress(mailbox: Mailbox) {
    try { await navigator.clipboard.writeText(mailbox.email); setCopied(mailbox.id); window.setTimeout(() => setCopied(null), 1400); }
    catch { setError("Clipboard access was blocked by the browser. Select and copy the address manually."); }
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeading eyebrow="Temporary inbox" title="Mail workspace" description="Create a disposable address and read incoming messages. Messages are fetched only for inboxes owned by your account." action={<button className="btn-secondary min-h-10" onClick={() => { void loadDomains(); void loadMailboxes(); if (selectedId) void loadMessages(selectedId); }}><RefreshCw size={15} /> Refresh</button>} />
      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={() => { void loadDomains(); void loadMailboxes(); if (selectedId) void loadMessages(selectedId); }} /></div>}
      {success && <div className="mb-4"><StatusMessage tone="success">{success}</StatusMessage></div>}
      <div className="grid items-start gap-4 xl:grid-cols-[350px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="Generate address" description="Use a listed domain or let the provider choose one.">
            {domainsLoading ? <LoadingCard rows={2} /> : <form className="space-y-4" onSubmit={generateMailbox}>
              <div><label className="label" htmlFor="mail-domain">Mail domain</label><select id="mail-domain" className="select-control" value={domain} onChange={(event) => setDomain(event.target.value)}><option value="">Random available domain</option>{domains.map((item) => <option key={item.domain} value={item.domain}>{item.domain}</option>)}</select>{!domains.length && <p className="mt-2 text-[0.68rem] leading-5 text-[#788d82]">No domains were returned. The provider may still choose a random domain if its API allows it.</p>}</div>
              <div className="rounded-xl border border-white/[0.06] bg-[#09120f] p-3.5"><div className="flex gap-2 text-xs font-semibold text-[#cadbd0]"><ShieldCheck size={15} className="text-[#8bf0c2]" /> Account-scoped inbox</div><p className="mt-1.5 text-[0.68rem] leading-5 text-[#7f9389]">YoriOTP stores the mailbox-to-user ownership link. The provider does not document a mailbox release operation.</p></div>
              <button className="btn-primary w-full" disabled={generating}>{generating ? <LoaderCircle size={15} className="animate-spin" /> : <AtSign size={15} />} {generating ? "Generating…" : "Generate temporary address"}</button>
            </form>}
          </SectionCard>

          <SectionCard title="Your inboxes" description="Only addresses registered to your account are listed.">
            {mailboxesLoading ? <LoadingCard rows={3} /> : mailboxes.length ? <div className="space-y-2">
              {mailboxes.map((mailbox) => <div key={mailbox.id} className={`rounded-xl border p-3 ${selectedId === mailbox.id ? "border-emerald-200/20 bg-emerald-200/[0.04]" : "border-white/[0.055] bg-[#09120f]/70"}`}>
                <button className="w-full text-left disabled:cursor-not-allowed disabled:opacity-60" disabled={!mailbox.listedUpstream} onClick={() => { if (selectedId !== mailbox.id) { setMessages([]); setMessagesLoading(true); setSelectedId(mailbox.id); } else { void loadMessages(mailbox.id); } }}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-[#dceae1]">{mailbox.email}</span><span className={`shrink-0 text-[0.62rem] ${mailbox.listedUpstream ? "text-emerald-200" : "text-[#788d82]"}`}>{mailbox.listedUpstream ? "Listed upstream" : "Not listed upstream"}</span></div><p className="mt-1.5 text-[0.65rem] text-[#72877c]">Created {formatDate(mailbox.createdAt)}</p></button>
                <button className="mt-2 inline-flex items-center gap-1.5 text-[0.67rem] font-semibold text-[#93e9bd] hover:text-white" onClick={() => void copyAddress(mailbox)}>{copied === mailbox.id ? <Check size={13} /> : <Copy size={13} />} Copy address</button>
              </div>)}
            </div> : <EmptyState title="No inboxes yet" message="Generate an address to make it available in your inbox list." icon={Inbox} />}
          </SectionCard>
        </div>

        <SectionCard title={selectedId ? "Inbox messages" : "Message viewer"} description={selectedId ? "Refreshes every 15 seconds while this tab is visible." : "Select one of your addresses to inspect its incoming messages."} action={selectedId ? <button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => void loadMessages(selectedId)}><RefreshCw size={13} /> Refresh</button> : undefined}>
          {!selectedId ? <EmptyState title="Choose an inbox" message="Messages are never loaded by address alone; the server first verifies its owner." icon={Mail} /> : messagesLoading && !messages.length ? <LoadingCard rows={4} /> : messages.length ? <div className="space-y-3">
            {messages.map((message) => <article key={message.id} className="rounded-xl border border-white/[0.055] bg-[#09120f]/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-[#e4f1e8]">{message.subject || "(No subject)"}</h3><p className="mt-1 text-xs text-[#8ba095]">{message.from || "Unknown sender"}</p></div><time className="text-[0.66rem] text-[#71867b]">{formatDate(message.receivedAt)}</time></div>
              {message.text ? <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.045] bg-[#07100d] p-3 text-xs leading-6 text-[#c6d7cc]">{message.text}</pre> : message.html ? <div className="mt-4 rounded-lg border border-amber-200/10 bg-amber-100/[0.025] p-3"><p className="mb-2 text-[0.67rem] text-amber-100/70">HTML content is displayed as plain text for safety.</p><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#bdcfc4]">{message.html}</pre></div> : <p className="mt-4 rounded-lg bg-[#07100d] p-3 text-xs text-[#81958a]">The provider did not return a recognized text or HTML body.</p>}
            </article>)}
          </div> : <EmptyState title="No messages returned" message="No incoming messages were included in the provider response for this inbox." icon={Send} />}
        </SectionCard>
      </div>
      <p className="mt-5 text-center text-[0.66rem] leading-5 text-[#62776c]">The mail API response schema and retention period are not fully specified by NumberPanel. Unexpected provider payloads are reported instead of being replaced with sample content.</p>
    </div>
  );
}
