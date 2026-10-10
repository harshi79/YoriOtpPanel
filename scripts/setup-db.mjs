import nextEnv from "@next/env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fileURLToPath } from "node:url";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.TURSO_DATABASE_URL;
if (!url || (!url.startsWith("file:") && !process.env.TURSO_AUTH_TOKEN)) {
  console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required (the token is optional for file: databases).");
  process.exit(1);
}

let client;
try {
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../db/migrations", import.meta.url)) });
  const result = await client.execute("PRAGMA foreign_keys");
  if (Number(result.rows[0]?.foreign_keys) !== 1) throw new Error("Foreign keys must be enabled.");
  console.log("YoriOTP Turso database migrations are applied.");
} catch {
  // Driver errors can include connection details; never print credentials.
  console.error("Database migration failed. Check the Turso configuration and migration state.");
  process.exitCode = 1;
} finally {
  client?.close();
}
