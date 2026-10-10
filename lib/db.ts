import "server-only";
import postgres from "postgres";
import { AppError } from "@/lib/http";

type SqlClient = ReturnType<typeof postgres>;
let client: SqlClient | undefined;

export function getDb(): SqlClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new AppError(503, "database_not_configured", "Database setup is required for protected actions.");
  }
  client ??= postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return client;
}
