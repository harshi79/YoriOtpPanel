"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandleSSOCallback } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";

// A callback page opened without a pending OAuth attempt (for example a reload
// after the flow already finished, or a direct visit) has nothing to finalize.
// Offer a way back instead of an endless spinner.
const FALLBACK_DELAY_MS = 10_000;

export function SsoCallback() {
  const router = useRouter();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return <>
    <HandleSSOCallback
      navigateToApp={({ decorateUrl }) => {
        const destination = decorateUrl("/dashboard");
        if (destination.startsWith("http")) window.location.assign(destination);
        else router.replace(destination);
      }}
      navigateToSignIn={() => router.replace("/sign-in")}
      navigateToSignUp={() => router.replace("/sign-in")}
    />
    <div className="flex flex-col items-center gap-3">
      <div className="inline-flex items-center gap-2 text-sm text-[#94a99e]"><LoaderCircle size={16} className="animate-spin text-[#8bf0c2]" /> Completing Google sign-in…</div>
      {showFallback && <Link className="text-xs font-semibold text-[#9bf1c7] underline-offset-4 hover:text-white hover:underline" href="/sign-in">Taking longer than expected? Return to sign-in</Link>}
    </div>
  </>;
}
