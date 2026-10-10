import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importLedger, validateLedger } from "../scripts/import-ledger.mjs";

let folder;
let client;
let url;
const sessionId = "550e8400-e29b-41d4-a716-446655440000";
const mailboxId = "550e8400-e29b-41d4-a716-446655440001";
const ledger = () => ({ version: 1, tables: {
  number_sessions: [{ id: sessionId, clerk_user_id: "user_a", number: "+18005550192", number_key: "+18005550192", service: "Telegram", country: null, flag: "🇺🇸", network: null, assigned_at: 1791620000123, expires_at: 1791621200123, released_at: null, end_reason: null, created_at: 1791620000124 }],
  active_number_leases: [{ number_key: "+18005550192", session_id: sessionId, clerk_user_id: "user_a", expires_at: 1791621200123 }],
  mailboxes: [{ id: mailboxId, clerk_user_id: "user_b", email: "A@Example.Test", email_key: "a@example.test", domain: null, created_at: 1791620000456 }],
  mailbox_ownership: [{ email_key: "a@example.test", provider_email: "A@Example.Test", mailbox_id: mailboxId, clerk_user_id: "user_b", created_at: 1791620000457 }],
  app_rate_limits: [{ bucket: "number_request:hash", window_start: 1791620000789, request_count: 9 }],
} });

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "yoriotp-transfer-"));
  url = `file:${join(folder, "target.db")}`;
  client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
});

afterEach(async () => {
  client.close();
  await rm(folder, { recursive: true, force: true });
});

describe("existing-ledger Turso cutover", () => {
  it("preserves every field, UUID, nullable timestamp and counter in all five tables", async () => {
    const source = ledger();
    expect(await importLedger(client, structuredClone(source))).toEqual({ number_sessions: 1, active_number_leases: 1, mailboxes: 1, mailbox_ownership: 1, app_rate_limits: 1 });
    for (const [table, rows] of Object.entries(source.tables)) {
      const result = await client.execute(`SELECT * FROM ${table}`);
      expect(result.rows.map((row) => Object.fromEntries(Object.keys(rows[0]).map((key) => [key, row[key]])))).toEqual(rows);
    }
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  });

  it("refuses non-empty targets instead of overwriting owners", async () => {
    await importLedger(client, ledger());
    await expect(importLedger(client, ledger())).rejects.toThrow("target ledger must be empty");
    expect((await client.execute("SELECT COUNT(*) AS count FROM number_sessions")).rows[0].count).toBe(1);
  });

  it("rolls back all previously inserted tables on a late constraint failure", async () => {
    const source = ledger();
    source.tables.app_rate_limits[0].request_count = -1;
    await expect(importLedger(client, source)).rejects.toThrow();
    for (const table of Object.keys(source.tables)) {
      expect((await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count).toBe(0);
    }
  });

  it("rejects orphan relationships and malformed or incomplete exports", async () => {
    const orphan = ledger();
    orphan.tables.active_number_leases[0].session_id = mailboxId;
    await expect(importLedger(client, orphan)).rejects.toThrow();
    const malformed = ledger();
    malformed.tables.number_sessions[0].expires_at = "not-a-timestamp";
    expect(() => validateLedger(malformed)).toThrow();
    const incomplete = ledger();
    delete incomplete.tables.mailbox_ownership;
    expect(() => validateLedger(incomplete)).toThrow();
    const unknown = ledger();
    unknown.tables.mailboxes[0].extra = "unexpected";
    expect(() => validateLedger(unknown)).toThrow();
  });

  it("applies setup twice from .env.local and imports through the actual CLI", async () => {
    const setupScript = join(process.cwd(), "scripts/setup-db.mjs");
    const importScript = join(process.cwd(), "scripts/import-ledger.mjs");
    const exportPath = join(folder, "ledger.json");
    await writeFile(join(folder, ".env.local"), `TURSO_DATABASE_URL=${url}\nTURSO_AUTH_TOKEN=\n`);
    await writeFile(exportPath, JSON.stringify(ledger()));
    const env = { ...process.env, NODE_ENV: "development" };
    delete env.__NEXT_PROCESSED_ENV;
    delete env.TURSO_DATABASE_URL;
    delete env.TURSO_AUTH_TOKEN;
    const options = { cwd: folder, env, encoding: "utf8" };
    expect(execFileSync(process.execPath, [setupScript], options)).toContain("migrations are applied");
    expect(execFileSync(process.execPath, [setupScript], options)).toContain("migrations are applied");
    expect(execFileSync(process.execPath, [importScript, exportPath], options)).toContain("Ledger imported and verified");
    const retry = spawnSync(process.execPath, [importScript, exportPath], options);
    expect(retry.status).toBe(1);
    expect(retry.stderr).not.toContain(url);
  });

  it("does not disclose remote auth tokens when setup configuration is incomplete", () => {
    const token = "placeholder-sensitive-test-token";
    const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/setup-db.mjs")], {
      cwd: folder, env: { ...process.env, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: token }, encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(token);
  });
});
