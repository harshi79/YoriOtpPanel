import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleDashed, Inbox } from "lucide-react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.055em] text-[#eff8f2] md:text-[2.35rem]">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8ea39a]">{description}</p>}</div>{action && <div className="shrink-0">{action}</div>}</div>;
}

export function MetricCard({ icon: Icon, label, value, hint, loading = false }: { icon: LucideIcon; label: string; value: string | number | null; hint: string; loading?: boolean }) {
  return <div className="surface rounded-2xl p-4 md:p-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-[#8da197]">{label}</p><span className="rounded-lg bg-emerald-200/[0.07] p-2 text-emerald-200"><Icon size={16} /></span></div>{loading ? <div className="mt-5 loading-bar w-20" /> : <p className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-[#edf8f1]">{value ?? "—"}</p>}<p className="mt-1.5 text-[0.69rem] text-[#71867b]">{hint}</p></div>;
}

export function LoadingCard({ rows = 3 }: { rows?: number }) {
  return <div className="surface rounded-2xl p-5" aria-label="Loading"><div className="loading-bar w-36" />{Array.from({ length: rows }).map((_, index) => <div key={index} className={`mt-5 loading-bar ${index % 2 ? "w-[62%]" : "w-[88%]"}`} />)}</div>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="flex flex-col gap-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-4 sm:flex-row sm:items-center sm:justify-between" role="alert"><div className="flex items-start gap-2.5"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-200" /><p className="text-sm leading-6 text-rose-100/85">{message}</p></div>{onRetry && <button className="btn-secondary min-h-9 px-3 text-xs" onClick={onRetry}>Retry</button>}</div>;
}

export function EmptyState({ title, message, icon: Icon = Inbox, action }: { title: string; message: string; icon?: LucideIcon; action?: React.ReactNode }) {
  return <div className="grid min-h-[210px] place-items-center rounded-2xl border border-dashed border-emerald-100/10 bg-white/[0.012] px-5 py-8 text-center"><div className="max-w-md"><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-emerald-200/[0.06] text-emerald-200"><Icon size={19} /></span><h3 className="mt-4 text-sm font-semibold text-[#e5f2e9]">{title}</h3><p className="mt-1.5 text-xs leading-5 text-[#83988e]">{message}</p>{action && <div className="mt-4">{action}</div>}</div></div>;
}

export function SectionCard({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="surface rounded-2xl p-4 md:p-5"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="card-title">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-[#81958b]">{description}</p>}</div>{action}</div>{children}</section>;
}

export function StatusMessage({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : CircleDashed;
  const colors = tone === "success" ? "border-emerald-200/15 bg-emerald-200/[0.04] text-emerald-100/80" : tone === "warning" ? "border-amber-200/15 bg-amber-200/[0.04] text-amber-100/80" : "border-white/[0.07] bg-white/[0.025] text-[#a5b7ad]";
  return <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-5 ${colors}`}><Icon size={15} className="mt-0.5 shrink-0" />{children}</div>;
}
