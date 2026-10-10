import Link from "next/link";
import {
  ArrowDown, ArrowRight, ArrowUpRight, AtSign, Check, CircleDot, Code2, Inbox,
  LockKeyhole, MessageSquareText, ShieldCheck, Sparkles, TimerReset, Workflow,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";

const features = [
  { icon: MessageSquareText, title: "Number sessions", copy: "Request a provider-backed number for an authorized test flow, then keep its short-lived session in view." },
  { icon: Inbox, title: "OTP monitoring", copy: "Poll the latest message, copy a code, and review provider history without exposing your personal number." },
  { icon: AtSign, title: "Temporary inboxes", copy: "Generate an address, revisit your inboxes, and inspect messages in the same workspace." },
  { icon: Workflow, title: "Workflow clarity", copy: "Inventory, active sessions, and message history stay organized in a calm, focused panel." },
];

export default function HomePage() {
  return (
    <main className="overflow-hidden">
      <SiteHeader />
      <section className="relative mx-auto grid min-h-[690px] max-w-[1240px] items-center gap-14 px-5 pb-24 pt-12 md:grid-cols-[1.05fr_.95fr] md:px-8 md:pb-28 md:pt-16">
        <div className="pointer-events-none absolute -left-44 top-16 h-[430px] w-[430px] rounded-full bg-emerald-400/[0.075] blur-[110px]" />
        <div className="relative z-10 max-w-[650px]">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/[0.055] px-3 py-1.5 text-[0.73rem] font-semibold tracking-wide text-emerald-100/90">
            <span className="status-dot" /> PRIVATE BY DESIGN <span className="text-emerald-100/35">/</span> SERVER-SIDE API
          </div>
          <h1 className="max-w-[700px] text-[clamp(3.1rem,7vw,5.8rem)] font-semibold leading-[0.99] tracking-[-0.075em] text-[#f1faf4]">
            Verification workflows, <span className="bg-gradient-to-r from-[#c5f7dc] via-[#8bf0c2] to-[#58dca0] bg-clip-text text-transparent">without the noise.</span>
          </h1>
          <p className="mt-7 max-w-[560px] text-[1.03rem] leading-7 text-[#9baea5] md:text-[1.1rem] md:leading-8">
            A secure workspace for authorized SMS testing and temporary inbox workflows. Discover live provider inventory, manage short-lived sessions, and keep your codes organized.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="btn-primary" href="/sign-in">Continue with Google <ArrowRight size={16} /></Link>
            <Link className="btn-secondary" href="#features">Explore the panel <ArrowDown size={15} /></Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[0.78rem] text-[#81978c]">
            <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-[#8bf0c2]" /> No credits or payments</span>
            <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-[#8bf0c2]" /> Google sign-in only</span>
            <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-[#8bf0c2]" /> Provider key stays server-side</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[540px] md:ml-auto">
          <div className="pointer-events-none absolute inset-8 rounded-[36px] bg-emerald-300/10 blur-[75px]" />
          <div className="surface mint-glow float-slow relative rounded-[25px] p-4 md:p-5">
            <div className="flex items-center justify-between px-1 pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200"><CircleDot size={18} /></span>
                <div><p className="text-sm font-semibold text-[#eaf7ef]">Workspace preview</p><p className="mt-0.5 text-[0.68rem] text-[#81978c]">Live data loads after Google sign-in</p></div>
              </div>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[0.65rem] font-medium text-[#9eafa5]">PREVIEW</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="surface-soft rounded-2xl p-4"><p className="text-[0.7rem] text-[#8ea39a]">Number sessions</p><p className="mt-4 text-xl font-semibold tracking-tight text-[#e4f1e9]">Provider-backed</p><p className="mt-1 text-[0.68rem] text-[#73897e]">No sample counts</p></div>
              <div className="surface-soft rounded-2xl p-4"><p className="text-[0.7rem] text-[#8ea39a]">OTP inbox</p><p className="mt-4 text-xl font-semibold tracking-tight text-[#e4f1e9]">Private view</p><p className="mt-1 text-[0.68rem] text-[#73897e]">Scoped to your account</p></div>
            </div>
            <div className="surface-soft mt-3 rounded-2xl p-4">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold text-[#d9e8df]"><LockKeyhole size={14} className="text-[#8bf0c2]" /> Secure provider bridge</div><span className="text-[0.65rem] text-[#83998e]">SERVER-SIDE</span></div>
              <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-white/[0.055] bg-[#08110e] p-3.5">
                <div><div className="loading-bar w-[82%]" /><div className="mt-2.5 loading-bar w-[58%] opacity-50" /></div>
                <span className="rounded-lg bg-emerald-300/10 p-2 text-emerald-200"><ShieldCheck size={17} /></span>
              </div>
              <p className="mt-3 text-[0.7rem] leading-5 text-[#82988d]">Inventory and messages are fetched from NumberPanel only when authenticated. The preview contains no fabricated phone numbers or OTPs.</p>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200/10 bg-emerald-200/[0.04] px-3.5 py-3 text-[0.72rem] text-emerald-100/80"><span className="inline-flex items-center gap-2"><Sparkles size={14} /> One panel. Focused workflows.</span><span className="font-mono text-[0.65rem]">YORI / OTP</span></div>
          </div>
          <div className="surface absolute -bottom-6 -left-8 hidden items-center gap-3 rounded-2xl px-4 py-3 shadow-xl md:flex"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-200/10 text-emerald-200"><TimerReset size={17} /></span><div><p className="text-xs font-semibold text-[#e4f1e9]">Short-lived by default</p><p className="mt-0.5 text-[0.66rem] text-[#87998f]">Number leases expire after 20 min</p></div></div>
          <div className="surface absolute -right-5 top-16 hidden items-center gap-3 rounded-2xl px-4 py-3 shadow-xl lg:flex"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-200/10 text-emerald-200"><Code2 size={17} /></span><div><p className="text-xs font-semibold text-[#e4f1e9]">API-ready</p><p className="mt-0.5 text-[0.66rem] text-[#87998f]">Documented provider endpoints</p></div></div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
        <div className="max-w-[650px]"><p className="eyebrow">Built for the work</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#edf8f1] md:text-5xl">A clearer way to run test workflows.</h2><p className="mt-4 max-w-[570px] leading-7 text-[#91a59b]">The panel brings the documented NumberPanel number and temporary-mail tools into one responsive workspace, with explicit ownership checks around shared provider resources.</p></div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, copy }, index) => <article key={title} className="surface group rounded-2xl p-5 transition hover:-translate-y-1 hover:border-emerald-200/20">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-200/10 bg-emerald-200/[0.06] text-emerald-200"><Icon size={19} /></span>
            <p className="mt-5 text-[0.67rem] font-bold tracking-[0.14em] text-[#6d887b]">0{index + 1}</p>
            <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-[#e8f5ed]">{title}</h3>
            <p className="mt-2.5 text-sm leading-6 text-[#8fa49a]">{copy}</p>
          </article>)}
        </div>
      </section>

      <section id="workflow" className="border-y border-white/[0.055] bg-[#09130f]/55">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 md:grid-cols-[.75fr_1.25fr] md:px-8 md:py-24">
          <div><p className="eyebrow">Simple by design</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-[#edf8f1] md:text-4xl">From inventory to inbox, in a few steps.</h2><p className="mt-4 leading-7 text-[#91a59b]">No wallet, credit counter, subscription, or payment step. Access follows provider availability and documented limits.</p><Link className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#9bf1c7] hover:text-white" href="/sign-in">Continue with Google <ArrowUpRight size={15} /></Link></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Sign in", "Use Google OAuth. The app verifies your identity on the server."],
              ["02", "Choose inventory", "Load available services and countries directly from NumberPanel."],
              ["03", "Monitor safely", "Track only resources created and owned by your YoriOTP account."],
            ].map(([number, title, copy]) => <div key={number} className="surface-soft rounded-2xl p-5"><span className="font-mono text-sm text-[#8bf0c2]">{number}</span><h3 className="mt-8 text-base font-semibold text-[#e7f4ec]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#8ea39a]">{copy}</p></div>)}
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-[1240px] px-5 py-20 md:px-8 md:py-28">
        <div className="surface relative overflow-hidden rounded-[26px] p-7 md:p-10">
          <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-emerald-300/10 blur-[90px]" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div><p className="eyebrow">Privacy & isolation</p><h2 className="mt-3 max-w-[700px] text-3xl font-semibold tracking-[-0.05em] text-[#edf8f1] md:text-4xl">Your account is the boundary.</h2><p className="mt-4 max-w-[720px] leading-7 text-[#91a59b]">NumberPanel uses one provider account behind this panel. YoriOTP records who created each number or inbox and checks that ownership on every read and action. The provider itself does not document per-Clerk-user isolation.</p></div>
            <div className="flex flex-wrap gap-2 text-xs text-[#a9bcb1]"><span className="status-pill"><ShieldCheck size={13} /> Server-side key</span><span className="status-pill"><LockKeyhole size={13} /> Owner checks</span></div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] px-5 py-8 md:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><span className="text-sm font-semibold text-[#deece3]">YoriOTP Panel</span><span className="text-xs text-[#667a70]">Authorized test workflows, thoughtfully organized.</span></div>
          <div className="flex gap-5 text-xs text-[#82968c]"><Link href="/sign-in" className="hover:text-white">Sign in</Link><Link href="/dashboard/settings" className="hover:text-white">Security</Link></div>
        </div>
      </footer>
    </main>
  );
}
