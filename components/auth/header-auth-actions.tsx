"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Header actions for the public pages. Clerk loads in the browser, so the
 * pre-hydration markup matches the signed-out links; signed-in visitors are
 * then pointed at the workspace instead of a second sign-in, which Clerk's
 * single-session mode would reject with `session_exists`.
 */
export function HeaderAuthActions() {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && isSignedIn) {
    return (
      <>
        <Link className="btn-primary min-h-10 px-3.5 text-[0.82rem]" href="/dashboard"><LayoutDashboard size={15} /> Dashboard</Link>
        <SignOutButton />
      </>
    );
  }

  return (
    <>
      <Link className="hidden text-sm font-semibold text-[#cad8d0] transition hover:text-white sm:inline-flex" href="/sign-in">Sign in</Link>
      <Link className="btn-primary min-h-10 px-3.5 text-[0.82rem]" href="/sign-in">Open panel <ArrowUpRight size={15} /></Link>
    </>
  );
}
