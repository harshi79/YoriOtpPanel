import { redirect } from "next/navigation";
import { isClerkConfigured } from "@/lib/auth";
import { SsoCallback } from "@/components/auth/sso-callback";

export default function SsoCallbackPage() {
  if (!isClerkConfigured()) redirect("/sign-in?setup=required");
  return <main className="grid min-h-screen place-items-center px-5"><SsoCallback /></main>;
}
