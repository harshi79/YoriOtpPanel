import "server-only";
import { sql } from "drizzle-orm";
import { ensureDatabaseSchema, getDb, isDatabaseConfigured } from "@/lib/db";

export const REQUIRED_TABLES = [
  "number_sessions",
  "active_number_leases",
  "mailboxes",
  "mailbox_ownership",
  "app_rate_limits",
] as const;

export type DatabaseProbe = {
  configured: boolean;
  reachable: boolean;
  initialized: boolean;
};

// Best-effort readiness probe for diagnostics routes. It never throws: any
// failure is reported as unreachable/uninitialized booleans instead.
//
// It is also self-healing: pending migrations are applied first, so a freshly
// provisioned Turso database creates its own tables and this probe reports
// initialized without anyone running `npm run db:setup`.
export async function probeDatabase(): Promise<DatabaseProbe> {
  if (!isDatabaseConfigured()) {
    return { configured: false, reachable: false, initialized: false };
  }
  try {
    await ensureDatabaseSchema();
  } catch {
    // Reported as reachable:false / initialized:false by the probe below.
  }
  try {
    const tables = await getDb().all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
    );
    const names = new Set(tables.map((table) => table.name));
    const initialized = REQUIRED_TABLES.every((table) => names.has(table));
    return { configured: true, reachable: true, initialized };
  } catch {
    return { configured: true, reachable: false, initialized: false };
  }
}
