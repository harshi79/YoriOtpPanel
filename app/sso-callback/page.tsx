import { redirect } from "next/navigation";
import { currentClerkUserId, isClerkConfigured } from "@/lib/auth";
import { SsoCallback } from "@/components/auth/sso-callback";

// The callback page must read the session cookie of the current request.
export const dynamic = "force-dynamic";

export default async function SsoCallbackPage() {
  if (!isClerkConfigured()) redirect("/sign-in?setup=required");
  // Reloads and back-navigations after a completed OAuth flow land here with a
  // live session but no pending attempt left to finalize. Send them to the
  // workspace instead of leaving them on a callback page that can only spin.
  if (await currentClerkUserId()) redirect("/dashboard");
  return <main className="grid min-h-screen place-items-center px-5"><SsoCallback /></main>;
}
