// Regenerates db/embedded-migrations.ts from db/migrations.
//
// A deployed serverless function cannot rely on reading db/migrations from disk,
// so the committed migration SQL is embedded in code and applied automatically by
// the app itself (see lib/db.ts). Run `npm run db:embed` after every
// `npm run db:generate`; tests/embedded-migrations.test.ts fails when the
// generated file no longer matches db/migrations.
import { readMigrationFiles } from "drizzle-orm/migrator";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = join(root, "db", "embedded-migrations.ts");
const migrations = readMigrationFiles({ migrationsFolder: join(root, "db", "migrations") });

if (migrations.length === 0) {
  console.error("db/migrations/meta/_journal.json lists no migrations.");
  process.exit(1);
}

const header = `// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with \`npm run db:embed\` after changing db/migrations.
//
// These are the committed drizzle migrations, embedded so the running app can
// create and upgrade its own tables without filesystem access (serverless-safe).
// They are applied with drizzle's own journal semantics (__drizzle_migrations),
// so \`npm run db:setup\` and the automatic bootstrap never conflict.
import type { MigrationMeta } from "drizzle-orm/migrator";

export const EMBEDDED_MIGRATIONS: MigrationMeta[] = [
`;

const entries = migrations.map((migration) => [
  "  {",
  `    folderMillis: ${migration.folderMillis},`,
  `    hash: ${JSON.stringify(migration.hash)},`,
  `    bps: ${migration.bps},`,
  "    sql: [",
  ...migration.sql.map((statement) => `      ${JSON.stringify(statement)},`),
  "    ],",
  "  },",
].join("\n")).join("\n");

const output = `${header}${entries}\n];\n`;

if (process.argv.includes("--check")) {
  const current = (() => {
    try {
      return readFileSync(target, "utf8");
    } catch {
      return "";
    }
  })();
  if (current !== output) {
    console.error("db/embedded-migrations.ts is out of date. Run `npm run db:embed`.");
    process.exit(1);
  }
  console.log("db/embedded-migrations.ts matches db/migrations.");
  process.exit(0);
}

writeFileSync(target, output);
console.log(`db/embedded-migrations.ts regenerated with ${migrations.length} migration(s).`);
