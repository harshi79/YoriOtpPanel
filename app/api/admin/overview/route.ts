import { ownerApiHandler } from "@/lib/http";
import { getOwnerOverview } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return ownerApiHandler("admin_overview", request, async () => ({
    success: true,
    providerKeyConfigured: Boolean(process.env.NUMBERPANEL_API_KEY),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    counts: await getOwnerOverview(),
  }));
}
