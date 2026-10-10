import { apiStatusHandler } from "@/lib/http";
import { isOwnerId } from "@/lib/auth";
import { probeDatabase } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // Diagnostics use the in-memory throttle (not the database-backed one) so
  // this endpoint keeps working when the database itself is misconfigured.
  return apiStatusHandler(request, async (userId) => {
    const database = await probeDatabase();
    return {
      success: true,
      providerConfigured: Boolean(process.env.NUMBERPANEL_API_KEY),
      databaseConfigured: database.configured,
      databaseReachable: database.reachable,
      tablesInitialized: database.initialized,
      googleOAuthOnlyUi: true,
      owner: isOwnerId(userId, process.env.OWNER_CLERK_USER_ID),
      providerDataScope: "shared-provider-account-with-local-YoriOTP-ownership",
    };
  });
}
