"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, AtSign, CircleHelp, RotateCw, Smartphone, Workflow } from "lucide-react";
import { clientApi, formatDate, messageFor } from "@/lib/client-api";
import { ErrorNotice, LoadingCard, MetricCard, PageHeading, SectionCard, StatusMessage } from "@/components/dashboard/ui";

type Service = { name: string; key: string; count: number };
type Session = { id: string; number: string; service: string; country: string | null; flag: string | null; assignedAt: string; expiresAt: string; status: string; otp: string | null; message: string | null };
type Mailbox = { id: string; email: string; domain: string; createdAt: string; listedUpstream: boolean };

export function Overview() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [numbers, setNumbers] = useState<Session[] | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled([
      clientApi<{ services: Service[] }>("/api/provider/services"),
      clientApi<{ numbers: Session[] }>("/api/provider/numbers"),
      clientApi<{ mailboxes: Mailbox[] }>("/api/provider/mail/history"),
    ]);
    const messages: string[] = [];
    if (results[0].status === "fulfilled") setServices(results[0].value.services); else messages.push(messageFor(results[0].reason));
    if (results[1].status === "fulfilled") setNumbers(results[1].value.numbers); else messages.push(messageFor(results[1].reason));
    if (results[2].status === "fulfilled") setMailboxes(results[2].value.mailboxes); else messages.push(messageFor(results[2].reason));
    setErrors([...new Set(messages)]);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try { await fetchAll(); } finally { setLoading(false); setRefreshing(false); }
  }, [fetchAll]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchAll().finally(() => setLoading(false)); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAll]);
  const totalInventory = services?.reduce((total, service) => total + service.count, 0);
  const visibleErrors = errors.slice(0, 1);

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeading eyebrow="Your workspace" title="Overview" description="Live NumberPanel inventory and only the resources created by your account." action={<button className="btn-secondary min-h-10" onClick={() => void load(true)} disabled={refreshing}><RotateCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh</button>} />
      {visibleErrors.map((error) => <div key={error} className="mb-5"><ErrorNotice message={error} onRetry={() => void load(true)} /></div>)}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Workflow} label="Services available" value={services?.length ?? null} hint="Current provider response" loading={loading && !services} />
        <MetricCard icon={Smartphone} label="Listed inventory" value={totalInventory === undefined ? null : totalInventory.toLocaleString()} hint="Availability can change at any time" loading={loading && !services} />
        <MetricCard icon={Activity} label="Your active numbers" value={numbers?.length ?? null} hint="Only sessions owned by this account" loading={loading && !numbers} />
        <MetricCard icon={AtSign} label="Your mailboxes" value={mailboxes?.length ?? null} hint="Addresses generated through YoriOTP" loading={loading && !mailboxes} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <SectionCard title="Active number sessions" description="Provider status is refreshed from your owned sessions." action={<Link className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9bf1c7] hover:text-white" href="/dashboard/numbers">Manage numbers <ArrowRight size={13} /></Link>}>
          {loading && !numbers ? <LoadingCard rows={3} /> : numbers?.length ? <div className="space-y-2.5">
            {numbers.slice(0, 4).map((session) => <div key={session.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.055] bg-[#09120f]/75 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-200/[0.07] text-emerald-200"><Smartphone size={16} /></span><div className="min-w-0"><p className="truncate font-mono text-sm font-semibold text-[#e3f1e8]">{session.number}</p><p className="mt-1 text-[0.7rem] text-[#80958a]">{session.service}{session.country ? ` · ${session.country}` : ""} · expires {formatDate(session.expiresAt)}</p></div></div>
              <div className="flex items-center gap-2 self-end sm:self-auto">{session.otp ? <span className="rounded-lg border border-emerald-200/15 bg-emerald-200/[0.06] px-2.5 py-1.5 font-mono text-xs text-emerald-100">{session.otp}</span> : <span className="text-[0.68rem] text-[#82968c]">{session.status === "provider_unavailable" ? "Provider status unavailable" : "Waiting for OTP"}</span>}<Link className="rounded-lg border border-white/[0.08] p-2 text-[#98ac9f] hover:text-white" href="/dashboard/numbers" aria-label="Open number session"><ArrowRight size={15} /></Link></div>
            </div>)}
          </div> : <div className="py-1"><StatusMessage>No number sessions have been created for your account.</StatusMessage><Link className="btn-secondary mt-4 min-h-9 text-xs" href="/dashboard/numbers">Browse live inventory <ArrowRight size={14} /></Link></div>}
        </SectionCard>

        <SectionCard title="Live service inventory" description="Values come from the provider at request time; no static inventory is shown." action={<Link className="text-xs font-semibold text-[#9bf1c7] hover:text-white" href="/dashboard/numbers">Open picker</Link>}>
          {loading && !services ? <LoadingCard rows={4} /> : services?.length ? <div className="space-y-1.5">
            {services.slice(0, 6).map((service) => <div key={service.key} className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-white/[0.025]"><div className="flex items-center gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-[#7feab5]" /><span className="text-sm font-medium text-[#c5d8cc]">{service.name}</span></div><span className="font-mono text-xs text-[#90a59a]">{service.count.toLocaleString()}</span></div>)}
          </div> : <div className="py-1"><StatusMessage>No services were returned in the current provider response.</StatusMessage></div>}
        </SectionCard>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="surface rounded-2xl p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-200/[0.07] text-emerald-200"><AtSign size={18} /></span><div><h2 className="card-title">Temporary mail</h2><p className="mt-1 text-xs text-[#82968c]">Generate and inspect inboxes under your account.</p></div></div><Link className="btn-secondary mt-5 min-h-9 text-xs" href="/dashboard/mail">Open inboxes <ArrowRight size={14} /></Link></div>
        <div className="surface rounded-2xl p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-200/[0.07] text-emerald-200"><CircleHelp size={18} /></span><div><h2 className="card-title">Shared upstream account</h2><p className="mt-1 text-xs leading-5 text-[#82968c]">YoriOTP scopes allocations in its ownership ledger. NumberPanel itself does not provide per-Clerk-user isolation.</p></div></div><Link className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#9bf1c7] hover:text-white" href="/dashboard/settings">Review security details <ArrowRight size={13} /></Link></div>
      </div>
      <p className="mt-6 text-center text-[0.66rem] text-[#62766b]">Provider availability and message delivery are not guaranteed. Use these tools only for workflows you are authorized to test.</p>
    </div>
  );
}
