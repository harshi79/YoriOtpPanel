"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Check, Copy, Filter, RefreshCw } from "lucide-react";
import { clientApi, formatDate, messageFor } from "@/lib/client-api";
import { EmptyState, ErrorNotice, LoadingCard, PageHeading, SectionCard, StatusMessage } from "@/components/dashboard/ui";

type Session = { id: string; number: string; service: string; country: string | null; assignedAt: string; expiresAt: string; status: string };
type Otp = { service: string; number: string; code: string | null; message: string | null; receivedAt: string | null; country: string | null };

export function HistoryPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [otps, setOtps] = useState<Otp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const data = await clientApi<{ sessions: Session[] }>("/api/provider/sessions");
    setSessions(data.sessions);
  }, []);

  const fetchHistory = useCallback(async (id = "") => {
    try {
      await loadSessions();
      const data = await clientApi<{ otps: Otp[] }>(`/api/provider/history${id ? `?sessionId=${encodeURIComponent(id)}` : ""}`);
      setOtps(data.otps);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [loadSessions]);
  const loadHistory = useCallback(async (id = sessionId) => {
    setLoading(true); setError(null);
    await fetchHistory(id);
  }, [fetchHistory, sessionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchHistory(""); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchHistory]);

  async function copyCode(code: string, id: string) {
    try { await navigator.clipboard.writeText(code); setCopied(id); window.setTimeout(() => setCopied(null), 1400); }
    catch { setError("Clipboard access was blocked by the browser. Copy the code manually."); }
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeading eyebrow="Activity" title="OTP history" description="Review provider history only for numbers registered to your YoriOTP account." action={<button className="btn-secondary min-h-10" onClick={() => void loadHistory()}><RefreshCw size={15} /> Refresh</button>} />
      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={() => void loadHistory()} /></div>}
      <SectionCard title="Received messages" description="The provider returns at most 200 history entries per call; unfiltered results are scoped to the most recent entries returned upstream." action={<div className="flex items-center gap-2"><Filter size={14} className="text-[#7f9589]"/><select className="select-control min-h-9 w-auto max-w-[250px] py-1.5 text-xs" value={sessionId} onChange={(event) => { setSessionId(event.target.value); void loadHistory(event.target.value); }} aria-label="Filter by owned number"><option value="">All owned numbers</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.number} · {session.service}</option>)}</select></div>}>
        {loading ? <LoadingCard rows={5} /> : otps.length ? <div className="space-y-2.5">
          {otps.map((item, index) => {
            const id = `${item.number}-${item.receivedAt ?? index}`;
            return <article key={id} className="rounded-xl border border-white/[0.055] bg-[#09120f]/70 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-semibold text-[#e2f0e7]">{item.number}</p>{item.country && <span className="rounded-full border border-white/[0.07] px-2 py-0.5 text-[0.63rem] text-[#879a90]">{item.country}</span>}</div><p className="mt-1 text-xs text-[#8da197]">{item.service} · {formatDate(item.receivedAt)}</p><p className="mt-3 text-sm leading-6 text-[#b8c9bf]">{item.message ?? "No message text was provided."}</p></div>
                <div className="flex shrink-0 items-center gap-2 self-end md:self-start">{item.code && <><span className="rounded-lg border border-emerald-200/15 bg-emerald-200/[0.055] px-3 py-2 font-mono text-sm font-semibold tracking-[0.1em] text-[#aaf3ce]">{item.code}</span><button className="btn-secondary min-h-9 px-2.5 text-xs" onClick={() => void copyCode(item.code!, id)} aria-label="Copy OTP">{copied === id ? <Check size={14} /> : <Copy size={14} />}</button></>}</div>
              </div>
            </article>;
          })}
        </div> : sessions.length ? <EmptyState title="No OTPs in this view" message="No history entries for this filter were returned by NumberPanel." icon={Activity} /> : <EmptyState title="No owned number sessions yet" message="Request a number before its OTP history can be associated with your account." icon={Activity} />}
      </SectionCard>
      <div className="mt-4"><StatusMessage tone="warning">History is retrieved from the shared provider account then filtered by the YoriOTP ownership ledger. Entries created outside this app are intentionally hidden.</StatusMessage></div>
    </div>
  );
}
