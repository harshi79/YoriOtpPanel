"use client";

import { useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { ArrowRight, LoaderCircle, LogOut } from "lucide-react";

/**
 * Shown instead of the Google button when this browser already holds a Clerk
 * session. Clerk's single-session instances reject a second sign-in with
 * `session_exists` ("You're already signed in."), so the panel offers the two
 * actions that can actually succeed: continue with the active session, or sign
 * out and pick a different Google account.
 */
export function AlreadySignedInNotice() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-4" role="status">
      <p className="text-sm font-semibold text-emerald-100">You&apos;re already signed in.</p>
      <p className="mt-1 text-sm leading-6 text-emerald-100/70">
        This browser already has an active YoriOTP session, so Clerk will not start a second Google sign-in. Continue to your dashboard, or sign out to use a different Google account.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="btn-primary min-h-10 px-3.5 text-[0.82rem]" href="/dashboard">
          Open dashboard <ArrowRight size={15} />
        </Link>
        <button
          className="btn-secondary min-h-10 px-3.5 text-[0.82rem]"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signOut({ redirectUrl: "/sign-in" });
          }}
        >
          {busy ? <LoaderCircle className="animate-spin" size={15} /> : <LogOut size={15} />} Sign out &amp; switch account
        </button>
      </div>
    </div>
  );
}
