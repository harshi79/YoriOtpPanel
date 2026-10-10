"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Activity, AtSign, LayoutDashboard, Menu, PanelLeftClose, Settings2, Shield, Smartphone, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/numbers", label: "Numbers", icon: Smartphone },
  { href: "/dashboard/mail", label: "Temporary mail", icon: AtSign },
  { href: "/dashboard/history", label: "OTP history", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];

export function DashboardShell({ children, showAdmin = false }: { children: React.ReactNode; showAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Google account";

  return (
    <div className="page-grid">
      {open && <button aria-label="Close navigation" className="sidebar-scrim lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`app-sidebar ${open ? "open" : ""}`}>
        <div className="flex h-full flex-col px-4 py-5">
          <div className="flex items-center justify-between px-2"><Logo href="/dashboard" /><button className="rounded-lg p-2 text-[#80958a] hover:bg-white/5 lg:hidden" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
          <div className="mx-2 mt-7 rounded-xl border border-emerald-200/10 bg-emerald-200/[0.04] p-3"><p className="text-[0.66rem] font-bold tracking-[0.13em] text-emerald-100/65">WORKSPACE</p><p className="mt-1.5 truncate text-xs font-semibold text-[#d4e6dc]">YoriOTP Panel</p><p className="mt-1 text-[0.67rem] text-[#799084]">Provider-backed tools</p></div>
          <nav className="mt-7 space-y-1" aria-label="Dashboard navigation">
            <p className="mb-2 px-3 text-[0.64rem] font-bold tracking-[0.15em] text-[#65796f]">PANEL</p>
            {links.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return <Link key={href} onClick={() => setOpen(false)} className={`nav-item ${active ? "active" : ""}`} href={href} aria-current={active ? "page" : undefined}><Icon size={16} strokeWidth={1.9} />{label}</Link>;
            })}
            {showAdmin && <><p className="mb-2 mt-7 px-3 text-[0.64rem] font-bold tracking-[0.15em] text-[#65796f]">OWNER</p><Link onClick={() => setOpen(false)} className={`nav-item ${pathname.startsWith("/admin") ? "active" : ""}`} href="/admin"><Shield size={16} strokeWidth={1.9} />Administration</Link></>}
          </nav>
          <div className="mt-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-[#b9d2c4]"><span className="status-dot" />API bridge</div><p className="mt-1.5 text-[0.68rem] leading-5 text-[#72877c]">Provider requests run on the server. User data is scoped to your account.</p></div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] px-1 pt-4"><div className="min-w-0"><p className="truncate text-[0.72rem] font-semibold text-[#d9e8df]">{name}</p><p className="mt-0.5 text-[0.63rem] text-[#71867b]">Google account</p></div><SignOutButton /></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-white/[0.055] bg-[#07100d]/85 px-4 backdrop-blur-xl md:px-7 lg:hidden">
          <div className="flex items-center gap-2.5"><button onClick={() => setOpen(true)} className="rounded-lg border border-white/[0.07] p-2 text-[#a7b8ae]" aria-label="Open navigation"><Menu size={17} /></button><Logo compact={false} href="/dashboard" /></div>
          <PanelLeftClose size={17} className="text-[#53695e]" />
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
