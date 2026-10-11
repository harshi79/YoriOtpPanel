import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { isClerkConfigured } from "@/lib/auth";
import { HeaderAuthActions } from "@/components/auth/header-auth-actions";
import { Logo } from "@/components/logo";

const signedOutActions = (
  <>
    <Link className="hidden text-sm font-semibold text-[#cad8d0] transition hover:text-white sm:inline-flex" href="/sign-in">Sign in</Link>
    <Link className="btn-primary min-h-10 px-3.5 text-[0.82rem]" href="/sign-in">Open panel <ArrowUpRight size={15} /></Link>
  </>
);

export function SiteHeader() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-5 md:px-8">
      <Logo />
      <nav className="hidden items-center gap-8 text-sm text-[#9db0a6] md:flex" aria-label="Main navigation">
        <Link className="transition hover:text-white" href="#features">Platform</Link>
        <Link className="transition hover:text-white" href="#workflow">How it works</Link>
        <Link className="transition hover:text-white" href="#security">Security</Link>
      </nav>
      <div className="flex items-center gap-3">
        {isClerkConfigured() ? <HeaderAuthActions /> : signedOutActions}
      </div>
    </header>
  );
}
