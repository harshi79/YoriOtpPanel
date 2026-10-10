import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isClerkConfigured, isOwnerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!isClerkConfigured()) redirect("/sign-in?setup=required");
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isOwnerId(userId, process.env.OWNER_CLERK_USER_ID)) redirect("/dashboard");
  return <DashboardShell showAdmin>{children}</DashboardShell>;
}
