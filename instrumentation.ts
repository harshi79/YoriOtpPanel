// Next.js instrumentation: `register` runs once per server instance, before it
// serves any traffic. Applying migrations here means a freshly provisioned Turso
// database already has its ownership tables when the first request arrives,
// instead of paying for them on that request.
//
// This is an optimization, not a requirement: lib/db.ts runs the same bootstrap
// lazily before every database operation and /api/health re-runs it on demand, so
// a failure here only defers table creation.
export async function register(): Promise<void> {
  // Only the Node.js runtime talks to Turso; skip the edge bundle entirely.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureDatabaseSchema, isDatabaseConfigured } = await import("@/lib/db");
    // Stay silent when no database is configured: the sign-in and marketing
    // routes render without one, and setup guidance belongs to /api/health.
    if (!isDatabaseConfigured()) return;
    await ensureDatabaseSchema();
  } catch {
    console.warn(JSON.stringify({
      level: "warn",
      code: "database_auto_migrate_deferred",
      message: "Startup database migration did not complete; it will be retried on the first database request.",
    }));
  }
}
