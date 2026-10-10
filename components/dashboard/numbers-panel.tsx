"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Check, Copy, LoaderCircle, RefreshCw, Smartphone, TimerReset, Trash2 } from "lucide-react";
import { clientApi, formatDate, messageFor, timeRemaining } from "@/lib/client-api";
import { startSafePoll } from "@/components/dashboard/polling";
import { EmptyState, ErrorNotice, LoadingCard, PageHeading, SectionCard, StatusMessage } from "@/components/dashboard/ui";

type Service = { name: string; key: string; count: number };
type Country = { name: string; flag: string; count: number; displayName: string; requestValue: string };
type NumberSession = { id: string; number: string; service: string; country: string | null; flag: string | null; network: string | null; assignedAt: string; expiresAt: string; status: string; otp?: string | null; message?: string | null };
type PollResult = { id: string; hasOtp: boolean; otp: string | null; message: string | null; receivedAt: string | null; expiresAt: string };

export function NumbersPanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [serviceKey, setServiceKey] = useState("");
  const [countryValue, setCountryValue] = useState("random");
  const [sessions, setSessions] = useState<NumberSession[]>([]);
  const [pollResults, setPollResults] = useState<Record<string, PollResult>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [countriesForService, setCountriesForService] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const countriesLoading = Boolean(serviceKey && countriesForService !== serviceKey);

  const refreshInventory = useCallback(async () => {
    setInventoryLoading(true);
    setError(null);
    try {
      const data = await clientApi<{ services: Service[] }>("/api/provider/services");
      setServices(data.services);
      const nextService = data.services.some((service) => service.key === serviceKey) ? serviceKey : data.services[0]?.key ?? "";
      if (nextService !== serviceKey) { setServiceKey(nextService); setCountryValue("random"); setCountriesForService(""); }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setInventoryLoading(false);
    }
  }, [serviceKey]);

  const refreshSessions = useCallback(async () => {
    try {
      const data = await clientApi<{ numbers: NumberSession[] }>("/api/provider/numbers");
      setSessions(data.numbers);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    clientApi<{ services: Service[] }>("/api/provider/services")
      .then((data) => {
        if (cancelled) return;
        setServices(data.services);
        setServiceKey((current) => data.services.some((service) => service.key === current) ? current : data.services[0]?.key ?? "");
      })
      .catch((cause) => { if (!cancelled) setError(messageFor(cause)); })
      .finally(() => { if (!cancelled) setInventoryLoading(false); });
    clientApi<{ numbers: NumberSession[] }>("/api/provider/numbers")
      .then((data) => { if (!cancelled) setSessions(data.numbers); })
      .catch((cause) => { if (!cancelled) setError(messageFor(cause)); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; window.clearInterval(clock); };
  }, []);

  useEffect(() => {
    if (!serviceKey) return;
    let cancelled = false;
    const requestedService = serviceKey;
    clientApi<{ countries: Country[] }>(`/api/provider/countries?service=${encodeURIComponent(requestedService)}`)
      .then((data) => {
        if (!cancelled) {
          setCountries(data.countries);
          setCountriesForService(requestedService);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setCountries([]);
          setError(messageFor(cause));
          setCountriesForService(requestedService);
        }
      });
    return () => { cancelled = true; };
  }, [serviceKey]);

  useEffect(() => {
    if (!sessions.length) return;
    return startSafePoll(() => { void refreshSessions(); }, 15_000);
  }, [sessions.length, refreshSessions]);

  const selectedSession = sessions.find((item) => item.id === selectedId);
  const selectedPoll = selectedId ? pollResults[selectedId] : undefined;
  const selectedHasOtp = Boolean(selectedPoll?.hasOtp || selectedSession?.otp);
  const selectedActive = Boolean(selectedSession && (now === 0 || new Date(selectedSession.expiresAt).getTime() > now));

  useEffect(() => {
    if (!selectedId || !selectedActive || selectedHasOtp) return;
    let disposed = false;
    let inFlight = false;
    let timer: number | undefined;
    const poll = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const data = await clientApi<PollResult>(`/api/provider/numbers/${selectedId}/otp`);
        if (!disposed) {
          setPollResults((current) => ({ ...current, [selectedId]: data }));
          setPollError(null);
        }
      } catch (cause) {
        if (!disposed) setPollError(messageFor(cause));
      } finally {
        inFlight = false;
      }
    };
    const startPolling = () => {
      if (document.visibilityState === "visible" && !timer) {
        void poll();
        timer = window.setInterval(() => void poll(), 5000);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && timer) {
        window.clearInterval(timer);
        timer = undefined;
      } else {
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    startPolling();
    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedId, selectedActive, selectedHasOtp]);

  const selectedService = useMemo(() => services.find((item) => item.key === serviceKey), [services, serviceKey]);

  async function requestNumber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      const data = await clientApi<{ number: NumberSession }>("/api/provider/numbers", {
        method: "POST",
        body: JSON.stringify({ service: serviceKey, country: countryValue }),
      });
      setSuccess(`Number allocated for ${data.number.service}. It expires after the provider's 20-minute lease.`);
      setSessions((current) => [data.number, ...current.filter((item) => item.id !== data.number.id)]);
      setSelectedId(data.number.id);
      await refreshSessions();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function releaseNumber(session: NumberSession) {
    if (!window.confirm(`Release ${session.number} now? This ends the active provider session.`)) return;
    setReleasingId(session.id); setError(null); setSuccess(null);
    try {
      await clientApi(`/api/provider/numbers/${session.id}/release`, { method: "POST", body: "{}" });
      setSessions((current) => current.filter((item) => item.id !== session.id));
      if (selectedId === session.id) setSelectedId(null);
      setSuccess("Number released.");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setReleasingId(null);
    }
  }

  async function copyNumber(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setError("Clipboard access was blocked by the browser. Select and copy the number manually.");
    }
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeading eyebrow="SMS workspace" title="Number sessions" description="Discover live inventory, allocate a temporary number, and monitor your own sessions." action={<button className="btn-secondary min-h-10" onClick={() => { void refreshInventory(); void refreshSessions(); }}><RefreshCw size={15} /> Refresh</button>} />
      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={() => { void refreshInventory(); void refreshSessions(); }} /></div>}
      {success && <div className="mb-4"><StatusMessage tone="success">{success}</StatusMessage></div>}

      <div className="grid items-start gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
        <SectionCard title="Request a number" description="Only current provider services and countries are accepted.">
          {inventoryLoading ? <LoadingCard rows={2} /> : services.length ? <form className="space-y-4" onSubmit={requestNumber}>
            <div><label className="label" htmlFor="service">Service</label><select id="service" className="select-control" value={serviceKey} onChange={(event) => { setCountryValue("random"); setCountriesForService(""); setServiceKey(event.target.value); }} required><option value="" disabled>Select a service</option>{services.map((service) => <option key={service.key} value={service.key}>{service.name} · {service.count.toLocaleString()} available</option>)}</select></div>
            <div><label className="label" htmlFor="country">Country</label><select id="country" className="select-control" value={countryValue} onChange={(event) => setCountryValue(event.target.value)} disabled={!serviceKey || countriesLoading}><option value="random">🌐 Any available country</option>{countries.map((country) => <option key={country.name} value={country.requestValue} disabled={country.count === 0}>{country.flag} {country.displayName} · {country.count.toLocaleString()}</option>)}</select>{countriesLoading && <p className="mt-1.5 text-[0.68rem] text-[#788d82]">Loading current country availability…</p>}</div>
            <div className="rounded-xl border border-white/[0.06] bg-[#09120f] px-3.5 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#c8d9ce]"><TimerReset size={15} className="text-[#8bf0c2]" /> 20-minute provider lease</div><p className="mt-1.5 text-[0.68rem] leading-5 text-[#7d9187]">The provider may not deliver every message. Release a number when your authorized test is complete.</p></div>
            <button className="btn-primary w-full" disabled={submitting || !serviceKey || (selectedService?.count ?? 0) === 0}>{submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Smartphone size={16} />} {submitting ? "Requesting…" : "Request number"}</button>
            {!services.length && <p className="text-xs text-amber-100/70">No services are currently listed by the provider.</p>}
          </form> : <EmptyState title="No services available" message="The provider did not return any requestable services. Refresh later." icon={Smartphone} action={<button className="btn-secondary min-h-9 text-xs" onClick={() => void refreshInventory()}>Retry inventory</button>} />}
          <p className="mt-4 text-[0.65rem] leading-5 text-[#65796f]">Inventory values are live provider responses and may change before an allocation completes.</p>
        </SectionCard>

        <div className="space-y-4">
          {selectedSession && <SectionCard title="OTP monitor" description="Only one selected waiting session is polled, every 5 seconds. Polling pauses when this tab is hidden." action={<button onClick={() => setSelectedId(null)} className="text-xs text-[#80958a] hover:text-white">Close</button>}>
            {pollError && <div className="mb-3"><ErrorNotice message={pollError} onRetry={() => setPollError(null)} /></div>}
            <div className="rounded-xl border border-emerald-200/12 bg-emerald-200/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-base font-semibold text-[#edf8f1]">{selectedSession.number}</p><p className="mt-1 text-xs text-[#8da197]">{selectedSession.service}{selectedSession.country ? ` · ${selectedSession.country}` : ""}</p></div><span className="status-pill"><span className="status-dot" /> {selectedHasOtp ? "Code received" : selectedActive ? "Waiting for SMS" : "Lease expired"}</span></div>
              {selectedHasOtp ? <div className="mt-4 rounded-xl border border-emerald-200/15 bg-[#09130f] p-4"><p className="text-[0.67rem] font-semibold tracking-wide text-[#81968b]">LATEST OTP</p><div className="mt-2 flex items-center justify-between gap-3"><p className="break-all font-mono text-2xl font-bold tracking-[0.12em] text-[#aaf3ce]">{selectedPoll?.otp ?? selectedSession.otp ?? "Received"}</p>{(selectedPoll?.otp || selectedSession.otp) && <button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => void copyNumber((selectedPoll?.otp ?? selectedSession.otp)!, `otp-${selectedSession.id}`)}>{copiedId === `otp-${selectedSession.id}` ? <Check size={14} /> : <Copy size={14} />} Copy</button>}</div><p className="mt-3 text-sm leading-6 text-[#bfd0c5]">{selectedPoll?.message ?? selectedSession.message ?? "The provider has delivered an OTP."}</p><p className="mt-2 text-[0.68rem] text-[#778d82]">Received {formatDate(selectedPoll?.receivedAt)}</p></div> : <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#09120f] p-4"><LoaderCircle size={17} className="animate-spin text-[#8bf0c2]" /><div><p className="text-sm font-semibold text-[#d6e6dc]">Waiting for an OTP</p><p className="mt-1 text-xs text-[#80958a]">Polls pause automatically when a code arrives, the session expires, or this tab is hidden.</p></div></div>}
              <p className="mt-3 text-[0.68rem] text-[#758a7f]">Time remaining: <span className="font-mono text-[#b8d2c3]">{now ? timeRemaining(selectedSession.expiresAt, now) : "—"}</span></p>
            </div>
          </SectionCard>}

          <SectionCard title="Your active numbers" description="Provider data is filtered against the server-side ownership ledger." action={<span className="text-[0.68rem] text-[#82968c]">{sessions.length} active</span>}>
            {sessionsLoading ? <LoadingCard rows={3} /> : sessions.length ? <div className="space-y-2.5">
              {sessions.map((session) => {
                const expired = new Date(session.expiresAt).getTime() <= now;
                const polled = pollResults[session.id];
                const otp = polled?.otp ?? session.otp;
                return <article key={session.id} className={`rounded-xl border ${selectedId === session.id ? "border-emerald-200/20 bg-emerald-200/[0.035]" : "border-white/[0.06] bg-[#09120f]/65"} p-3.5`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.035] text-[#9bb2a4]">{session.flag ?? <Smartphone size={16} />}</span><div className="min-w-0"><p className="truncate font-mono text-sm font-semibold text-[#e6f2e9]">{session.number}</p><p className="mt-1 truncate text-[0.68rem] text-[#7f9489]">{session.service}{session.country ? ` · ${session.country}` : ""}{session.network ? ` · ${session.network}` : ""}</p></div></div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end"><span className="text-[0.68rem] text-[#80958a]">{expired ? "Expired" : timeRemaining(session.expiresAt, now)}</span>{otp && <span className="rounded-lg border border-emerald-200/15 bg-emerald-200/[0.06] px-2 py-1.5 font-mono text-xs text-emerald-100">{otp}</span>}
                      <button className="btn-secondary min-h-9 px-3 text-xs" onClick={() => { setSelectedId(session.id); setPollError(null); }}>{otp ? "View OTP" : "Monitor"}<ArrowRight size={13} /></button>
                      {!expired && <button className="btn-danger min-h-9 px-3 text-xs" disabled={releasingId === session.id} onClick={() => void releaseNumber(session)}>{releasingId === session.id ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />} Release</button>}
                    </div>
                  </div>
                </article>;
              })}
            </div> : <EmptyState title="No active numbers" message="Request a number from the current provider inventory to start a session." icon={Activity} />}
          </SectionCard>
        </div>
      </div>
      <p className="mt-5 text-center text-[0.66rem] leading-5 text-[#63786d]">NumberPanel documents a 20-minute lease and polling interval guidance. Delivery and country acceptance are subject to upstream behavior.</p>
    </div>
  );
}
