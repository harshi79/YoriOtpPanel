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
