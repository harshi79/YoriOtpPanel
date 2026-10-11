"use client";

import { useState } from "react";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { Globe2, LoaderCircle } from "lucide-react";
import { AlreadySignedInNotice } from "@/components/auth/already-signed-in-notice";
import { clerkErrorEntries, describeClerkError, isAlreadySignedInClerkError } from "@/lib/clerk-errors";

export function GoogleSignInButton() {
  const { fetchStatus, signIn } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sessionExists, setSessionExists] = useState(false);
  const [busy, setBusy] = useState(false);

  // `/sign-in` redirects signed-in visitors on the server; this is the
  // client-side safety net for a session that becomes visible after that
  // render (for example after a finished OAuth callback or a back navigation).
  // Starting `signIn.sso()` in that state can only fail with
  // `session_exists`, which is what produced "Google sign-in failed".
  if ((isLoaded && isSignedIn) || sessionExists) return <AlreadySignedInNotice />;

  async function continueWithGoogle() {
    if (fetchStatus === "fetching" || busy || !signIn) return;
    setBusy(true);
    setError(null);

    try {
      // Relative same-origin URLs work across the production domain and Vercel
      // deployment aliases without requiring a host-specific redirect URL.
      const result = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl: "/dashboard",
        redirectCallbackUrl: "/sso-callback",
      });

      if (result.error) {
        console.error("[YoriOTP auth] Clerk rejected Google OAuth start", {
          code: result.error.code,
          message: result.error.message,
          longMessage: result.error.longMessage,
          errors: clerkErrorEntries(result.error),
          docsUrl: result.error.docsUrl,
          origin: window.location.origin,
        });
        if (isAlreadySignedInClerkError(result.error)) {
          // Clerk already holds a session for this browser; offer the paths
          // that work (dashboard or sign out) instead of a dead-end error.
          setSessionExists(true);
          return;
        }
        setError(`Google sign-in failed: ${describeClerkError(result.error)}`);
        setBusy(false);
      }
    } catch (caught) {
      console.error("[YoriOTP auth] Google OAuth start threw an error", {
        error: caught,
        origin: window.location.origin,
      });
      if (isAlreadySignedInClerkError(caught)) {
        setSessionExists(true);
        return;
      }
      setError(`Could not start Google sign-in: ${describeClerkError(caught)}`);
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <button className="btn-primary w-full" type="button" onClick={continueWithGoogle} disabled={!isLoaded || fetchStatus === "fetching" || busy || !signIn}>
        {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Globe2 size={17} />}
        Continue with Google
      </button>
      {error && <p className="mt-3 break-words rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
    </div>
  );
}
