import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/errors";

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
let database: Database | undefined;

export function isDatabaseConfigured(): boolean {
  const url = process.env.TURSO_DATABASE_URL;
  return Boolean(url && (url.startsWith("file:") || process.env.TURSO_AUTH_TOKEN));
}

export function getDb(): Database {
  if (!isDatabaseConfigured()) {
    throw new AppError(503, "database_not_configured", "Database setup is required for protected actions.");
  }
  if (!database) {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    database = drizzle(client, { schema });
  }
  return database;
}

// Drizzle wraps driver errors in `cause`. Only uniqueness conflicts map to 409;
// FK/check/not-null failures and outages must continue to fail closed.
export function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.code === "SQLITE_CONSTRAINT_PRIMARYKEY")) return true;
  if ("extendedCode" in error && (error.extendedCode === "SQLITE_CONSTRAINT_UNIQUE" || error.extendedCode === "SQLITE_CONSTRAINT_PRIMARYKEY")) return true;
  // Some Hrana versions expose only the base SQLite constraint code.
  if ("code" in error && error.code === "SQLITE_CONSTRAINT" && "message" in error && typeof error.message === "string"
    && /^(?:SQLITE_CONSTRAINT: )?UNIQUE constraint failed: /.test(error.message)) return true;
  return "cause" in error && error.cause !== error && isUniqueConstraintError(error.cause);
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current !== null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    let next: unknown;
    if ("cause" in current) {
      next = (current as { cause?: unknown }).cause;
    } else {
      // Some drivers attach the underlying failure under a symbol key.
      for (const symbol of Object.getOwnPropertySymbols(current)) {
        if (symbol.description?.toLowerCase().includes("cause")) {
          next = (current as Record<symbol, unknown>)[symbol];
          break;
        }
      }
    }
    if (next === undefined || next === null || typeof next !== "object" || next === current) break;
    current = next;
  }
  return chain;
}

// A reachable database without migrated tables (setup never ran against it)
// fails every query with "no such table". Detect it anywhere in the wrapped
// Drizzle/libSQL cause chain, for both local sqlite and remote Hrana errors.
export function isMissingTableError(error: unknown): boolean {
  return causeChain(error).some((entry) =>
    typeof entry === "object" && entry !== null && "message" in entry
    && typeof entry.message === "string" && /no such table/i.test(entry.message),
  );
}

// Translate driver failures escaping a database-only operation into safe,
// actionable AppErrors. Callers must only use this where the operation performs
// no other fallible I/O, so any non-AppError is a database failure by construction.
// AppErrors (auth, validation, conflicts, rate limits) always pass through untouched.
export function mapDatabaseError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isMissingTableError(error)) {
    return new AppError(
      503,
      "database_not_initialized",
      "The ownership database is reachable but its tables are missing. Run the database setup (npm run db:setup) against this deployment's Turso database, then retry.",
    );
  }
  return new AppError(
    503,
    "database_unavailable",
    "The ownership database could not be reached. Check the Turso configuration of this deployment and try again.",
  );
}

export async function withDatabaseErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapDatabaseError(error);
  }
}
