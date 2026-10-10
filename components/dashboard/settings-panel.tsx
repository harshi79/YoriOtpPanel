"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleHelp, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, type LucideIcon } from "lucide-react";
import { clientApi, messageFor } from "@/lib/client-api";
import { ErrorNotice, LoadingCard, PageHeading, SectionCard, StatusMessage } from "@/components/dashboard/ui";

type Settings = { providerConfigured: boolean; databaseConfigured: boolean; googleOAuthOnlyUi: boolean; owner: boolean; providerDataScope: string };

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchSettings = useCallback(async () => {
    try { setSettings(await clientApi<Settings>("/api/provider/settings")); setError(null); }
    catch (cause) { setError(messageFor(cause)); }
    finally { setLoading(false); }
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    await fetchSettings();
  }, [fetchSettings]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchSettings(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSettings]);

  return (
    <div className="mx-auto max-w-[1120px]">
      <PageHeading eyebrow="Preferences & security" title="Settings" description="Credential state and provider scope are shown without returning secrets to the browser." action={<button className="btn-secondary min-h-10" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>} />
      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={() => void load()} /></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_.85fr]">
        <SectionCard title="Connection status" description="Only configuration status is exposed to your signed-in browser.">
          {loading && !settings ? <LoadingCard rows={4} /> : settings ? <div className="space-y-3">
            <StatusRow icon={KeyRound} label="NumberPanel API key" value={settings.providerConfigured ? "Configured on server" : "Not configured"} ok={settings.providerConfigured} />
            <StatusRow icon={LockKeyhole} label="Ownership database" value={settings.databaseConfigured ? "Configured" : "Not configured"} ok={settings.databaseConfigured} />
            <StatusRow icon={ShieldCheck} label="Sign-in interface" value={settings.googleOAuthOnlyUi ? "Google OAuth only" : "Check app configuration"} ok={settings.googleOAuthOnlyUi} />
            <StatusRow icon={Check} label="Application owner" value={settings.owner ? "Owner account" : "Standard account"} ok={settings.owner} />
          </div> : <StatusMessage>Connection status is not available.</StatusMessage>}
        </SectionCard>
        <SectionCard title="Provider data isolation" description="Important for a shared upstream API key.">
          <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-4"><div className="flex gap-2 text-sm font-semibold text-amber-100"><CircleHelp size={16} /> NumberPanel does not isolate Clerk users</div><p className="mt-2 text-xs leading-6 text-amber-50/65">The configured provider key owns one shared NumberPanel account. YoriOTP records each created number and inbox against the authenticated Clerk user. Dashboard reads and mutations are filtered through that server-side ledger. Provider resources created outside YoriOTP are not shown to standard accounts. Mail reads are refused when an address is no longer listed upstream; NumberPanel does not document mailbox assignment timestamps, so reuse of the same listed address cannot be detected. Do not use temporary inboxes for sensitive messages.</p></div>
          <div className="mt-3"><StatusMessage tone="warning">Temporary-mail response fields and lifecycle details are not fully documented upstream. An unrecognized payload is surfaced as an integration error; no sample inboxes are substituted.</StatusMessage></div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Credential setup" description="The provider key is never displayed here and cannot be changed from the browser.">
          <ol className="space-y-3 text-xs leading-5 text-[#9aada3]">
            <li className="flex gap-2"><span className="font-mono text-[#8bf0c2]">01</span>Set <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">NUMBERPANEL_API_KEY</code> as a deployment secret or in an untracked local <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">.env.local</code>.</li>
            <li className="flex gap-2"><span className="font-mono text-[#8bf0c2]">02</span>Set <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">TURSO_DATABASE_URL</code> and <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">TURSO_AUTH_TOKEN</code> for the durable Turso database used for ownership and throttling.</li>
            <li className="flex gap-2"><span className="font-mono text-[#8bf0c2]">03</span>Run <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">npm run db:setup</code> during deployment or initial setup.</li>
          </ol>
        </SectionCard>
        <SectionCard title="Google OAuth" description="Clerk is the only identity provider configured by the application interface.">
          <ul className="space-y-2.5 text-xs leading-5 text-[#9aada3]">
            <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#8bf0c2]" />The sign-in button explicitly starts the <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">oauth_google</code> strategy.</li>
            <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#8bf0c2]" />Disable email/password, email codes, email links, phone, and all other strategies in the Clerk Dashboard.</li>
            <li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[#8bf0c2]" />Set the owner role with server-side <code className="rounded bg-white/[0.05] px-1 text-[#c5d8cc]">OWNER_CLERK_USER_ID</code>; client-supplied roles are ignored.</li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value, ok }: { icon: LucideIcon; label: string; value: string; ok: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.055] bg-[#09120f]/70 px-3.5 py-3"><div className="flex items-center gap-2.5"><Icon size={15} className="text-[#91e8bb]" /><span className="text-xs font-medium text-[#bacbc0]">{label}</span></div><span className={`text-[0.68rem] ${ok ? "text-emerald-200" : "text-amber-100/75"}`}>{value}</span></div>;
}
