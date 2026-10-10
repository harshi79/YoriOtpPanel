import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to initialize the ownership/rate-limit tables.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, prepare: false });
try {
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const statements = schema.split(";").map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await sql.unsafe(statement);
  console.log("YoriOTP database schema is ready.");
} catch (error) {
  console.error("Database schema setup failed.", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
} finally {
  await sql.end();
}
