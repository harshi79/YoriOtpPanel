"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Globe2, LoaderCircle } from "lucide-react";

type ClerkErrorDetails = {
  code?: unknown;
  longMessage?: unknown;
  message?: unknown;
  docsUrl?: unknown;
};

function describeAuthError(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as ClerkErrorDetails;
    const message = typeof details.longMessage === "string"
      ? details.longMessage
      : typeof details.message === "string"
        ? details.message
        : undefined;
    const code = typeof details.code === "string" ? details.code : undefined;

    if (message || code) {
      return [message, code ? `Clerk error: ${code}` : undefined]
        .filter(Boolean)
        .join(" — ");
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return "Clerk returned an unexpected error. Check the browser console for details.";
}

export function GoogleSignInButton() {
  const { fetchStatus, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          docsUrl: result.error.docsUrl,
          origin: window.location.origin,
        });
        setError(`Google sign-in failed: ${describeAuthError(result.error)}`);
        setBusy(false);
      }
    } catch (caught) {
      console.error("[YoriOTP auth] Google OAuth start threw an error", {
        error: caught,
        origin: window.location.origin,
      });
      setError(`Could not start Google sign-in: ${describeAuthError(caught)}`);
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <button className="btn-primary w-full" type="button" onClick={continueWithGoogle} disabled={fetchStatus === "fetching" || busy || !signIn}>
        {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Globe2 size={17} />}
        Continue with Google
      </button>
      {error && <p className="mt-3 break-words rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
    </div>
  );
}
