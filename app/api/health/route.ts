import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/auth";
import { probeDatabase } from "@/lib/health";
import { jsonError } from "@/lib/http";
import { enforceMemoryRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public readiness endpoint. It reports configuration booleans only (never
// secrets) and stays available when the database is down, so a broken setup
// can be diagnosed from the live deployment itself. Probing also applies any
// pending migrations, so a fresh Turso database creates its own tables here.
export async function GET(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    enforceMemoryRateLimit(`health:${forwardedFor || "unknown"}`, 60, 60);
  } catch (error) {
    return jsonError(error);
  }

  try {
    const database = await probeDatabase();
    const clerkConfigured = isClerkConfigured();
    const providerConfigured = Boolean(process.env.NUMBERPANEL_API_KEY);
    const ownerConfigured = Boolean(process.env.OWNER_CLERK_USER_ID);
    const ok = clerkConfigured && providerConfigured && database.configured && database.reachable && database.initialized;

    const nextSteps: string[] = [];
    if (!clerkConfigured) nextSteps.push("Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY on this deployment.");
    if (!providerConfigured) nextSteps.push("Set NUMBERPANEL_API_KEY as a server-side secret on this deployment.");
    if (!database.configured) {
      nextSteps.push("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on this deployment.");
    } else if (!database.reachable) {
      nextSteps.push("The Turso database could not be reached. Verify TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then redeploy.");
    } else if (!database.initialized) {
      nextSteps.push("The ownership tables could not be created automatically. Verify TURSO_AUTH_TOKEN has write access to this deployment's database and that DATABASE_AUTO_MIGRATE is not set to false, then reload this endpoint; `npm run db:setup` also applies them manually.");
    }
    if (!ownerConfigured) nextSteps.push("Set OWNER_CLERK_USER_ID to enable the owner-only /admin overview.");

    return NextResponse.json(
      {
        success: true,
        status: ok ? "ok" : "degraded",
        checks: {
          clerkConfigured,
          providerConfigured,
          databaseConfigured: database.configured,
          databaseReachable: database.reachable,
          tablesInitialized: database.initialized,
          ownerConfigured,
        },
        nextSteps,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
