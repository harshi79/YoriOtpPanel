import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";
import { EMBEDDED_MIGRATIONS } from "@/db/embedded-migrations";

// The app creates its own tables from db/embedded-migrations.ts because a
// serverless deployment cannot read db/migrations from disk. These tests keep the
// committed drizzle migrations and the embedded copy identical: after
// `npm run db:generate`, run `npm run db:embed`.
const committed = readMigrationFiles({ migrationsFolder: "db/migrations" });
const shape = (migrations: readonly { sql: string[]; bps: boolean; folderMillis: number; hash: string }[]) =>
  migrations.map(({ sql, bps, folderMillis, hash }) => ({ sql, bps, folderMillis, hash }));

describe("embedded migrations", () => {
  it("matches every committed drizzle migration exactly", () => {
    expect(committed.length).toBeGreaterThan(0);
    expect(shape(EMBEDDED_MIGRATIONS)).toEqual(shape(committed));
  });

  it("stays ordered by journal timestamp so the applied-migration check is monotonic", () => {
    const timestamps = EMBEDDED_MIGRATIONS.map((migration) => migration.folderMillis);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it("carries only executable SQL statements", () => {
    for (const migration of EMBEDDED_MIGRATIONS) {
      expect(migration.sql.length).toBeGreaterThan(0);
      expect(migration.hash).toMatch(/^[0-9a-f]{64}$/);
      for (const statement of migration.sql) {
        expect(statement).not.toContain("--> statement-breakpoint");
        expect(statement.trim()).not.toBe("");
      }
    }
  });
});
