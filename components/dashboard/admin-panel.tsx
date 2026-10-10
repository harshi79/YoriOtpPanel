"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AtSign, RefreshCw, ShieldCheck, Smartphone, Users } from "lucide-react";
import { clientApi, messageFor } from "@/lib/client-api";
import { ErrorNotice, LoadingCard, MetricCard, PageHeading, SectionCard, StatusMessage } from "@/components/dashboard/ui";

type OverviewData = { providerKeyConfigured: boolean; databaseConfigured: boolean; counts: { users: number; activeNumbers: number; totalNumbers: number; mailboxes: number } };

export function AdminPanel() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchOverview = useCallback(async () => {
    try { setData(await clientApi<OverviewData>("/api/admin/overview")); setError(null); }
    catch (cause) { setError(messageFor(cause)); }
    finally { setLoading(false); }
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    await fetchOverview();
  }, [fetchOverview]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchOverview(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchOverview]);

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeading eyebrow="Owner access" title="Administration" description="Minimal operational visibility for the configured owner. No API key, OTP content, or raw mailbox content is exposed here." action={<button className="btn-secondary min-h-10" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} />
      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={() => void load()} /></div>}
      {loading && !data ? <LoadingCard rows={4} /> : data ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Known users" value={data.counts.users.toLocaleString()} hint="Users with a YoriOTP resource record" />
          <MetricCard icon={Smartphone} label="Active number leases" value={data.counts.activeNumbers.toLocaleString()} hint="Tracked in the ownership database" />
          <MetricCard icon={Activity} label="Number sessions" value={data.counts.totalNumbers.toLocaleString()} hint="Local ownership records" />
          <MetricCard icon={AtSign} label="Mailbox records" value={data.counts.mailboxes.toLocaleString()} hint="Provider addresses created through YoriOTP" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Server configuration" description="Presence only; secret values are never returned.">
            <div className="space-y-3"><StatusMessage tone={data.providerKeyConfigured ? "success" : "warning"}>NumberPanel key {data.providerKeyConfigured ? "is configured" : "is missing"}.</StatusMessage><StatusMessage tone={data.databaseConfigured ? "success" : "warning"}>PostgreSQL {data.databaseConfigured ? "is configured" : "is missing"}.</StatusMessage><StatusMessage tone="neutral"><span className="inline-flex gap-2"><ShieldCheck size={14} /> Owner status is evaluated on the server from OWNER_CLERK_USER_ID.</span></StatusMessage></div>
          </SectionCard>
          <SectionCard title="Shared provider account" description="The upstream API does not provide per-user resource scopes.">
            <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-4 text-xs leading-6 text-amber-50/70">All YoriOTP users share one NumberPanel API key. The application ledger is the isolation boundary: standard user reads, polling, and releases must match an owned resource record. Provider-side actions and delivery semantics remain under NumberPanel control.</div>
            <p className="mt-3 text-[0.68rem] leading-5 text-[#758a7f]">No account-wide OTP details or unregistered provider resources are included in this administration view.</p>
          </SectionCard>
        </div>
      </> : null}
    </div>
  );
}
