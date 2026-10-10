import nextEnv from "@next/env";
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";

// This is a one-time offline cutover tool, never an application request path.
// Column specs mirror db/schema.ts; dates are UTC Unix milliseconds in the export.
const tables = {
  number_sessions: { id: "uuid", clerk_user_id: "text", number: "text", number_key: "text", service: "text", country: "text?", flag: "text?", network: "text?", assigned_at: "integer", expires_at: "integer", released_at: "integer?", end_reason: "text?", created_at: "integer" },
  active_number_leases: { number_key: "text", session_id: "uuid", clerk_user_id: "text", expires_at: "integer" },
  mailboxes: { id: "uuid", clerk_user_id: "text", email: "text", email_key: "text", domain: "text?", created_at: "integer" },
  mailbox_ownership: { email_key: "text", provider_email: "text", mailbox_id: "uuid", clerk_user_id: "text", created_at: "integer" },
  app_rate_limits: { bucket: "text", window_start: "integer", request_count: "integer" },
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function validateLedger(value) {
  if (!sameKeys(value, ["version", "tables"]) || value.version !== 1 || !sameKeys(value.tables, Object.keys(tables))) {
    throw new Error("Invalid ledger export format.");
  }
  for (const [table, columns] of Object.entries(tables)) {
    if (!Array.isArray(value.tables[table])) throw new Error("Invalid ledger table.");
    for (const row of value.tables[table]) {
      if (!sameKeys(row, Object.keys(columns))) throw new Error("Ledger columns do not match the schema.");
      for (const [column, spec] of Object.entries(columns)) {
        const field = row[column];
        if (field === null && spec.endsWith("?")) continue;
        if (spec.startsWith("integer")) {
          if (!Number.isSafeInteger(field)) throw new Error("Ledger timestamp/count must be a safe integer.");
        } else if (typeof field !== "string" || (spec === "uuid" && !uuid.test(field))) {
          throw new Error("Invalid ledger field.");
        }
        if (spec === "uuid") row[column] = field.toLowerCase();
      }
    }
  }
  return value.tables;
}

export async function importLedger(client, value) {
  const ledger = validateLedger(value);
  if (Number((await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys) !== 1) {
    throw new Error("Foreign keys must be enabled.");
  }
  const tx = await client.transaction("write");
  try {
    // Check all tables before any insert; never silently replace an ownership row.
    for (const table of Object.keys(tables)) {
      if (Number((await tx.execute(`SELECT COUNT(*) AS count FROM "${table}"`)).rows[0]?.count) !== 0) {
        throw new Error("The target ledger must be empty.");
      }
    }
    // Parent rows precede their ownership rows. All inserts and verification are
    // in one transaction; any conflict, malformed row or mismatch rolls back.
    for (const [table, columns] of Object.entries(tables)) {
      const names = Object.keys(columns);
      const statement = `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(",")}) VALUES (${names.map(() => "?").join(",")})`;
      for (let start = 0; start < ledger[table].length; start += 100) {
        await tx.batch(ledger[table].slice(start, start + 100).map((row) => ({ sql: statement, args: names.map((name) => row[name]) })));
      }
      const actual = (await tx.execute(`SELECT * FROM "${table}"`)).rows;
      const canonical = (rows) => rows.map((row) => JSON.stringify(names.map((name) => row[name]))).sort();
      if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(ledger[table]))) {
        throw new Error("Ledger verification failed.");
      }
    }
    if ((await tx.execute("PRAGMA foreign_key_check")).rows.length) throw new Error("Ledger foreign key verification failed.");
    await tx.commit();
    return Object.fromEntries(Object.keys(tables).map((table) => [table, ledger[table].length]));
  } finally {
    // close() rolls back an uncommitted transaction, including failed imports.
    tx.close();
  }
}

// Keep the functions importable by tests without invoking the CLI.
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  nextEnv.loadEnvConfig(process.cwd());
  let client;
  try {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url || (!url.startsWith("file:") && !process.env.TURSO_AUTH_TOKEN) || !process.argv[2]) {
      throw new Error("Provide a ledger file and Turso configuration.");
    }
    const value = JSON.parse(await readFile(process.argv[2], "utf8"));
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    console.log("Ledger imported and verified:", await importLedger(client, value));
  } catch {
    // Do not print driver errors, exported ownership data, URLs or auth tokens.
    console.error("Ledger import failed. Check the export, empty migrated target and Turso configuration; no partial import is committed.");
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}
