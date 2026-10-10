import { isDatabaseConfigured } from "@/lib/db";
import { apiHandler } from "@/lib/http";
import { isOwnerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return apiHandler("inventory", request, async (userId) => ({
    success: true,
    providerConfigured: Boolean(process.env.NUMBERPANEL_API_KEY),
    databaseConfigured: isDatabaseConfigured(),
    googleOAuthOnlyUi: true,
    owner: isOwnerId(userId, process.env.OWNER_CLERK_USER_ID),
    providerDataScope: "shared-provider-account-with-local-YoriOTP-ownership",
  }));
}
