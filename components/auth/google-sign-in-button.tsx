"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Globe2, LoaderCircle } from "lucide-react";

export function GoogleSignInButton() {
  const { fetchStatus, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function continueWithGoogle() {
    if (fetchStatus === "fetching" || busy || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/dashboard`,
        redirectCallbackUrl: `${window.location.origin}/sso-callback`,
      });
      if (result.error) throw new Error("Google OAuth failed");
    } catch {
      setError("Google sign-in could not be started. Check the Google provider configuration in Clerk and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <button className="btn-primary w-full" type="button" onClick={continueWithGoogle} disabled={fetchStatus === "fetching" || busy || !signIn}>
        {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Globe2 size={17} />}
        Continue with Google
      </button>
      {error && <p className="mt-3 rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
    </div>
  );
}
