import { sql } from "drizzle-orm";
import { EMBEDDED_MIGRATIONS } from "@/db/embedded-migrations";
import type { Database } from "@/lib/db";

// Drizzle's journal table, created exactly as drizzle-orm/libsql/migrator creates
// it, so the automatic bootstrap and `npm run db:setup` share one migration
// history and can never fight over the same database.
const MIGRATIONS_TABLE = sql.identifier("__drizzle_migrations");

// `created_at` stores the migration's folder timestamp; null/empty means nothing
// has been recorded yet.
async function latestAppliedMillis(database: Database): Promise<number | undefined> {
  const rows = await database.values(sql`SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`);
  const raw = rows[0]?.[0];
  if (raw === null || raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

// Applies every committed migration the database has not recorded yet, in one
// write transaction. This mirrors `migrate()` from drizzle-orm/libsql/migrator
// but reads the SQL from db/embedded-migrations.ts instead of the filesystem, so
// it also works on serverless platforms that do not ship db/migrations.
export async function applyPendingMigrations(database: Database): Promise<void> {
  await database.run(sql`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);
  const applied = await latestAppliedMillis(database);
  const pending = EMBEDDED_MIGRATIONS.filter((migration) => applied === undefined || applied < migration.folderMillis);
  if (pending.length === 0) return;
  await database.transaction(async (tx) => {
    for (const migration of pending) {
      for (const statement of migration.sql) {
        if (statement.trim() === "") continue;
        await tx.run(sql.raw(statement));
      }
      await tx.run(sql`INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES (${migration.hash}, ${migration.folderMillis})`);
    }
  });
}

// Instances that cold-start together can race the same migration and one of them
// then fails on an already-created table. When the journal already records the
// newest migration, the winner did our work and the loser may carry on.
export async function isSchemaCurrent(database: Database): Promise<boolean> {
  const newest = EMBEDDED_MIGRATIONS.at(-1)?.folderMillis;
  if (newest === undefined) return true;
  try {
    const applied = await latestAppliedMillis(database);
    return applied !== undefined && applied >= newest;
  } catch {
    return false;
  }
}
