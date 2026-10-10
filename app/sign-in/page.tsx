import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { isClerkConfigured } from "@/lib/auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Logo } from "@/components/logo";

export const metadata = { title: "Sign in" };

type Props = { searchParams: Promise<{ setup?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  return <SignInContent setupRequired={!isClerkConfigured() || params.setup === "required"} />;
}

function SignInContent({ setupRequired = false }: { setupRequired?: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="fixed left-5 top-5"><Logo /></div>
      <div className="surface w-full max-w-[450px] rounded-[25px] p-7 md:p-9">
        <Link className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-[#82978d] hover:text-white" href="/"><ArrowLeft size={14} /> Back to home</Link>
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl border border-emerald-200/15 bg-emerald-200/[0.07] text-emerald-200"><ShieldCheck size={22} /></div>
        <p className="eyebrow">YoriOTP access</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#eff8f2]">Continue securely.</h1>
        <p className="mt-3 text-sm leading-6 text-[#91a59b]">Use Google to access your isolated dashboard. The provider API key is never sent to your browser.</p>
        <div className="mt-7">
          {isClerkConfigured()
            ? <GoogleSignInButton />
            : <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-4 text-sm leading-6 text-amber-100/85" role="status">
                <p className="font-semibold">Google sign-in is not configured yet.</p>
                <p className="mt-1 text-amber-100/65">Set the Clerk publishable and secret keys, then enable Google OAuth as the only sign-in method in the Clerk Dashboard. See the setup guide in <code className="text-amber-100">README.md</code>.</p>
              </div>}
        </div>
        <div className="my-6 divider" />
        <div className="flex items-start gap-2.5 text-[0.72rem] leading-5 text-[#7c9287]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#8bf0c2]" /> Google OAuth only. No email/password, email-code, email-link, or other authentication strategies are offered by this interface.</div>
        {setupRequired && <span className="sr-only">Protected routes require Clerk configuration.</span>}
      </div>
      <p className="fixed bottom-5 text-center text-[0.68rem] text-[#667a70]">Authorized workflows only · YoriOTP Panel</p>
    </main>
  );
}
