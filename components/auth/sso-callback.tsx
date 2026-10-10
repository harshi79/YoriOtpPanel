"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export function SsoCallback() {
  const router = useRouter();

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
    <div className="inline-flex items-center gap-2 text-sm text-[#94a99e]"><LoaderCircle size={16} className="animate-spin text-[#8bf0c2]" /> Completing Google sign-in…</div>
  </>;
}
