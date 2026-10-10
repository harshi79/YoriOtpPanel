import { isDatabaseConfigured } from "@/lib/db";
import { ownerApiHandler } from "@/lib/http";
import { getOwnerOverview } from "@/lib/ownership";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return ownerApiHandler("admin_overview", request, async () => ({
    success: true,
    providerKeyConfigured: Boolean(process.env.NUMBERPANEL_API_KEY),
    databaseConfigured: isDatabaseConfigured(),
    counts: await getOwnerOverview(),
  }));
}
