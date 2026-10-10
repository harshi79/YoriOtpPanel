import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { MigrationMeta } from "drizzle-orm/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The automatic bootstrap must keep working after the next schema change, not
// only for the migration that exists today. This appends a synthetic "future"
// migration to the committed set; everything below asserts it is applied too.
vi.mock("@/db/embedded-migrations", async (importOriginal) => {
  const original = await importOriginal<{ EMBEDDED_MIGRATIONS: MigrationMeta[] }>();
  const newest = original.EMBEDDED_MIGRATIONS.at(-1)!;
  return {
    EMBEDDED_MIGRATIONS: [
      ...original.EMBEDDED_MIGRATIONS,
      {
        folderMillis: newest.folderMillis + 1000,
        hash: "f".repeat(64),
        bps: true,
        sql: [
          "CREATE TABLE `bootstrap_probe` (\n\t`id` text PRIMARY KEY NOT NULL\n);\n",
          "\nCREATE INDEX `bootstrap_probe_id_idx` ON `bootstrap_probe` (`id`);",
        ],
      },
    ],
  };
});

const { EMBEDDED_MIGRATIONS } = await import("@/db/embedded-migrations");
const expectedJournal = EMBEDDED_MIGRATIONS.map((migration) => migration.folderMillis);

let folder: string;
let dbFile: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "yoriotp-bootstrap-"));
  dbFile = join(folder, "test.db");
  vi.stubEnv("TURSO_DATABASE_URL", `file:${dbFile}`);
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  vi.resetModules();
});

afterEach(async () => {
  try {
    const { getDb } = await import("@/lib/db");
    getDb().$client.close();
  } catch {
    // Never-connected databases have no client to close.
  }
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

async function readJournal() {
  const { getDb } = await import("@/lib/db");
  const rows = await getDb().all<{ created_at: number }>(
    sql`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at`,
  );
  return rows.map((row) => Number(row.created_at));
}

async function tableNames() {
  const { getDb } = await import("@/lib/db");
  const rows = await getDb().all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`);
  return rows.map((row) => row.name).sort();
}

describe("automatic schema bootstrap", () => {
  it("applies every committed migration, including ones added later", async () => {
    const { ensureDatabaseSchema } = await import("@/lib/db");
    await ensureDatabaseSchema();

    expect(await tableNames()).toEqual([
      "__drizzle_migrations", "active_number_leases", "app_rate_limits", "bootstrap_probe",
      "mailbox_ownership", "mailboxes", "number_sessions",
    ]);
    expect(await readJournal()).toEqual(expectedJournal);
  });

  it("is idempotent: repeated runs never duplicate the journal", async () => {
    const { ensureDatabaseSchema, getDb } = await import("@/lib/db");
    const { applyPendingMigrations } = await import("@/db/bootstrap");

    await ensureDatabaseSchema();
    await ensureDatabaseSchema();
    await applyPendingMigrations(getDb());
    expect(await readJournal()).toEqual(expectedJournal);
    expect(await tableNames()).toContain("bootstrap_probe");
  });

  it("adds only pending migrations on top of a db:setup-initialized database", async () => {
    const client = createClient({ url: `file:${dbFile}` });
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
    client.close();

    const { ensureDatabaseSchema } = await import("@/lib/db");
    await ensureDatabaseSchema();

    expect(await readJournal()).toEqual(expectedJournal);
    expect(await tableNames()).toContain("bootstrap_probe");
  });

  it("recognizes a schema another instance already brought up to date", async () => {
    const { getDb } = await import("@/lib/db");
    const { applyPendingMigrations, isSchemaCurrent } = await import("@/db/bootstrap");

    // Nothing recorded yet: a failure here must not be mistaken for success.
    expect(await isSchemaCurrent(getDb())).toBe(false);
    await applyPendingMigrations(getDb());
    expect(await isSchemaCurrent(getDb())).toBe(true);
  });

  it("leaves the journal untouched when a migration statement fails", async () => {
    const { getDb } = await import("@/lib/db");
    const { applyPendingMigrations } = await import("@/db/bootstrap");

    // Block the very last statement of the set; the whole write transaction —
    // including the journal rows — must roll back so the next attempt retries.
    await getDb().run(sql`CREATE TABLE "bootstrap_probe" ("id" text PRIMARY KEY NOT NULL)`);
    await expect(applyPendingMigrations(getDb())).rejects.toThrow();
    const tables = await getDb().all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_rate_limits'`,
    );
    expect(tables).toEqual([]);
  });
});
