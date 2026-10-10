import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

vi.mock("server-only", () => ({}));

let getDb: typeof import("@/lib/db").getDb;
let isDatabaseConfigured: typeof import("@/lib/db").isDatabaseConfigured;
let isUniqueConstraintError: typeof import("@/lib/db").isUniqueConstraintError;
let ownership: typeof import("@/lib/ownership");
let enforceRateLimit: typeof import("@/lib/rate-limit").enforceRateLimit;
import { assertUuid } from "@/lib/api";

const { activeNumberLeases, appRateLimits, mailboxOwnership, mailboxes, numberSessions } = schema;
let folder: string;
let client: Client;
const allocation = (number = "+18005550192") => ({ number, assigned_at: new Date(), service: "Telegram", raw: {} });

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "yoriotp-libsql-"));
  vi.stubEnv("TURSO_DATABASE_URL", `file:${join(folder, "test.db")}`);
  vi.stubEnv("TURSO_AUTH_TOKEN", "");
  client = createClient({ url: process.env.TURSO_DATABASE_URL! });
  await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
  vi.resetModules();
  ({ getDb, isDatabaseConfigured, isUniqueConstraintError } = await import("@/lib/db"));
  ownership = await import("@/lib/ownership");
  ({ enforceRateLimit } = await import("@/lib/rate-limit"));
});

afterEach(async () => {
  getDb().$client.close();
  client.close();
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

describe("Turso database configuration", () => {
  it("fails closed without a URL or a remote token, permits tokenless local libSQL", () => {
    vi.stubEnv("TURSO_DATABASE_URL", "");
    expect(isDatabaseConfigured()).toBe(false);
    expect(() => getDb()).toThrow(expect.objectContaining({ status: 503, code: "database_not_configured" }));
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://example.turso.io");
    expect(isDatabaseConfigured()).toBe(false);
    vi.stubEnv("TURSO_AUTH_TOKEN", "placeholder-test-token");
    expect(isDatabaseConfigured()).toBe(true);
    vi.stubEnv("TURSO_DATABASE_URL", `file:${join(folder, "test.db")}`);
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    expect(isDatabaseConfigured()).toBe(true);
  });

  it("only translates uniqueness errors, including Drizzle-wrapped remote errors", () => {
    expect(isUniqueConstraintError({ cause: { code: "SQLITE_CONSTRAINT_PRIMARYKEY" } })).toBe(true);
    expect(isUniqueConstraintError({ cause: { code: "SQLITE_CONSTRAINT", extendedCode: "SQLITE_CONSTRAINT_UNIQUE" } })).toBe(true);
    expect(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" })).toBe(false);
    expect(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT_CHECK" })).toBe(false);
    expect(isUniqueConstraintError({ cause: { code: "SQLITE_CONSTRAINT", message: "SQLITE_CONSTRAINT: UNIQUE constraint failed: active_number_leases.number_key" } })).toBe(true);
    expect(isUniqueConstraintError({ code: "SQLITE_CONSTRAINT", message: "SQLITE_CONSTRAINT: CHECK constraint failed: counts" })).toBe(false);
    expect(isUniqueConstraintError(new Error("offline"))).toBe(false);
  });
});

describe("Turso schema and ownership operations", () => {
  it("reapplies migrations without losing data and preserves all tables/indexes", async () => {
    const db = drizzle(client, { schema });
    await db.insert(mailboxes).values({ clerk_user_id: "user_a", email: "a@example.test", email_key: "a@example.test" });
    await migrate(db, { migrationsFolder: "db/migrations" });
    expect(await db.select().from(mailboxes)).toHaveLength(1);
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name != '__drizzle_migrations'");
    expect(tables.rows.map((row) => row.name).sort()).toEqual([
      "active_number_leases", "app_rate_limits", "mailbox_ownership", "mailboxes", "number_sessions",
    ]);
    const indexes = await client.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'");
    expect(indexes.rows.map((row) => row.name).sort()).toEqual([
      "active_number_leases_session_id_unique", "active_number_leases_user_expires_idx",
      "mailbox_ownership_mailbox_id_unique", "mailbox_ownership_user_idx",
      "mailboxes_user_created_idx", "number_sessions_number_key_idx", "number_sessions_user_created_idx",
    ]);
    const order = await client.execute("PRAGMA index_xinfo(number_sessions_user_created_idx)");
    expect(order.rows.find((row) => row.name === "created_at")?.desc).toBe(1);
  });

  it("creates UUIDs, nullable columns and millisecond Date values without changing API shapes", async () => {
    const input = { ...allocation(), country: "United States", flag: "🇺🇸", network: "Pool" };
    const row = await ownership.createNumberOwnership("user_a", input);
    expect(assertUuid(row.id)).toBe(row.id);
    expect(row).toMatchObject({ clerk_user_id: "user_a", country: input.country, flag: input.flag, network: input.network, released_at: null, end_reason: null });
    expect(row.assigned_at).toEqual(input.assigned_at);
    expect(row.expires_at.getTime()).toBe(input.assigned_at.getTime() + 1_200_000);
    expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(2000);
    expect(await ownership.getOwnedActiveNumber("user_a", row.id.toUpperCase())).toEqual(row);
    expect(await ownership.listOwnedActiveNumbers("user_a")).toEqual([row]);
  });

  it("isolates user reads and releases, and atomically finishes leases", async () => {
    const row = await ownership.createNumberOwnership("user_a", allocation());
    expect(await ownership.listOwnedActiveNumbers("user_b")).toEqual([]);
    expect(await ownership.listOwnedNumberHistory("user_b")).toEqual([]);
    await expect(ownership.getOwnedActiveNumber("user_b", row.id)).rejects.toMatchObject({ status: 404 });
    await expect(ownership.finishNumberOwnership("user_b", row.id, "released")).rejects.toMatchObject({ status: 404 });
    const endedAt = new Date();
    await ownership.finishNumberOwnership("user_a", row.id.toUpperCase(), "released", endedAt);
    expect(await ownership.listOwnedActiveNumbers("user_a")).toEqual([]);
    expect((await ownership.listOwnedNumberHistory("user_a"))[0]).toMatchObject({ released_at: endedAt, end_reason: "released" });
    await expect(ownership.finishNumberOwnership("user_a", row.id, "released")).rejects.toMatchObject({ status: 404 });
  });

  it("rolls back duplicate normalized number assignments without exposing or orphaning a session", async () => {
    const first = await ownership.createNumberOwnership("user_a", allocation());
    await expect(ownership.createNumberOwnership("user_b", allocation("+1 (800) 555-0192")))
      .rejects.toMatchObject({ status: 409, code: "provider_number_already_leased" });
    expect(await ownership.getOwnerOverview()).toEqual({ users: 1, activeNumbers: 1, totalNumbers: 1, mailboxes: 0 });
    expect(await ownership.getOwnedActiveNumber("user_a", first.id)).toEqual(first);
  });

  it("rolls back number and mailbox parents when an ownership write fails", async () => {
    await client.execute("CREATE TRIGGER fail_lease BEFORE INSERT ON active_number_leases BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    await expect(ownership.createNumberOwnership("user_a", allocation())).rejects.toThrow();
    expect(await getDb().select().from(numberSessions)).toEqual([]);
    await client.execute("CREATE TRIGGER fail_mail_owner BEFORE INSERT ON mailbox_ownership BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    await expect(ownership.createMailboxOwnership("user_a", "a@example.test", "")).rejects.toThrow();
    expect(await getDb().select().from(mailboxes)).toEqual([]);
  });

  it("expires stale rows and allows reassignment while preserving the old history", async () => {
    const db = getDb();
    const row = await ownership.createNumberOwnership("user_a", allocation());
    const endedAt = new Date(Date.now() - 1);
    await db.update(numberSessions).set({ expires_at: endedAt }).where(eq(numberSessions.id, row.id));
    await db.update(activeNumberLeases).set({ expires_at: endedAt }).where(eq(activeNumberLeases.session_id, row.id));
    await ownership.expireStaleNumberLeases();
    const next = await ownership.createNumberOwnership("user_b", allocation());
    expect((await ownership.listOwnedNumberHistory("user_a"))[0]).toMatchObject({ released_at: endedAt, end_reason: "expired" });
    expect(await ownership.listOwnedActiveNumbers("user_a")).toEqual([]);
    expect(await ownership.listOwnedActiveNumbers("user_b")).toEqual([next]);
  });

  it("caps reassigned history only earlier, never for another user", async () => {
    const row = await ownership.createNumberOwnership("user_a", allocation());
    const earlier = new Date(row.assigned_at.getTime() + 1000);
    await ownership.capNumberHistoryAt("user_b", row.id, earlier);
    expect(await ownership.getOwnedActiveNumber("user_a", row.id)).toEqual(row);
    await ownership.capNumberHistoryAt("user_a", row.id, earlier);
    await ownership.capNumberHistoryAt("user_a", row.id, new Date(earlier.getTime() + 1000));
    expect((await ownership.listOwnedNumberHistory("user_a"))[0]).toMatchObject({ released_at: earlier, end_reason: "expired" });
    expect(await ownership.listOwnedActiveNumbers("user_a")).toEqual([]);
    await expect(ownership.capNumberHistoryAt("user_a", row.id, new Date(NaN))).rejects.toMatchObject({ code: "invalid_lease_end" });
  });

  it("orders and limits number history with the same bounds", async () => {
    const db = getDb();
    const first = await ownership.createNumberOwnership("user_a", allocation());
    const second = await ownership.createNumberOwnership("user_a", allocation("+18005550193"));
    await db.update(numberSessions).set({ created_at: new Date(1000) }).where(eq(numberSessions.id, first.id));
    expect((await ownership.listOwnedNumberHistory("user_a", 1.9)).map((row) => row.id)).toEqual([second.id]);
    expect(await ownership.listOwnedNumberHistory("user_a", 0)).toHaveLength(1);
    expect(await ownership.listOwnedNumberHistory("user_a", 500)).toHaveLength(2);
  });

  it("keeps mailbox ownership globally unique, isolated and retained", async () => {
    const row = await ownership.createMailboxOwnership("user_a", " A@Example.Test ", "");
    expect(assertUuid(row.id)).toBe(row.id);
    expect(row).toMatchObject({ email: "A@Example.Test", email_key: "a@example.test", domain: "example.test" });
    expect(await ownership.getOwnedMailbox("user_a", row.id.toUpperCase())).toEqual(row);
    expect(await ownership.listOwnedMailboxes("user_b")).toEqual([]);
    await expect(ownership.getOwnedMailbox("user_b", row.id)).rejects.toMatchObject({ status: 404 });
    await expect(ownership.createMailboxOwnership("user_b", "a@example.test", "example.test"))
      .rejects.toMatchObject({ status: 409, code: "provider_mailbox_already_owned" });
    expect(await ownership.getOwnerOverview()).toEqual({ users: 1, activeNumbers: 0, totalNumbers: 0, mailboxes: 1 });
    expect(ownership.toMailboxSummary(row, new Set([row.email_key]))).toEqual({ id: row.id, email: row.email, domain: "example.test", createdAt: row.created_at.toISOString(), listedUpstream: true });
    await ownership.expireStaleNumberLeases();
    expect(await getDb().select().from(mailboxOwnership)).toHaveLength(1);
  });

  it("enforces foreign keys, unique relationships, not-null fields and nonnegative rate counts", async () => {
    const db = getDb();
    expect(Number((await client.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys)).toBe(1);
    await expect(db.insert(activeNumberLeases).values({ number_key: "+12345", session_id: "missing", clerk_user_id: "user_a", expires_at: new Date() })).rejects.toThrow();
    await expect(db.insert(mailboxOwnership).values({ email_key: "a@example.test", provider_email: "a@example.test", mailbox_id: "missing", clerk_user_id: "user_a" })).rejects.toThrow();
    await expect(db.insert(appRateLimits).values({ bucket: "bad", window_start: new Date(), request_count: -1 })).rejects.toThrow();
    await expect(client.execute("INSERT INTO mailboxes (clerk_user_id, email, email_key) VALUES (NULL, 'a', 'a')")).rejects.toThrow();
    const number = await ownership.createNumberOwnership("user_a", allocation());
    const mailbox = await ownership.createMailboxOwnership("user_a", "a@example.test", "");
    await expect(db.insert(activeNumberLeases).values({ number_key: "+99999", session_id: number.id, clerk_user_id: "user_a", expires_at: new Date() })).rejects.toThrow();
    await expect(db.insert(mailboxOwnership).values({ email_key: "b@example.test", provider_email: "b@example.test", mailbox_id: mailbox.id, clerk_user_id: "user_a" })).rejects.toThrow();
    await db.delete(numberSessions).where(eq(numberSessions.id, number.id));
    await db.delete(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(await db.select().from(activeNumberLeases)).toEqual([]);
    expect(await db.select().from(mailboxOwnership)).toEqual([]);
  });

  it("fails closed for stale/invalid provider allocations and invalid mail", async () => {
    await expect(ownership.createNumberOwnership("user_a", { number: "x", assigned_at: new Date(), raw: {} })).rejects.toMatchObject({ status: 502 });
    await expect(ownership.createNumberOwnership("user_a", { ...allocation(), assigned_at: new Date(Date.now() - 120_001) })).rejects.toMatchObject({ status: 502 });
    await expect(ownership.createMailboxOwnership("user_a", "invalid", "")).rejects.toMatchObject({ status: 502 });
    expect(await ownership.getOwnerOverview()).toEqual({ users: 0, activeNumbers: 0, totalNumbers: 0, mailboxes: 0 });
  });

  it("counts distinct ledger users and excludes expired active leases", async () => {
    await ownership.createNumberOwnership("user_a", allocation());
    await ownership.createMailboxOwnership("user_a", "a@example.test", "");
    await ownership.createMailboxOwnership("user_b", "b@example.test", "");
    expect(await ownership.getOwnerOverview()).toEqual({ users: 2, activeNumbers: 1, totalNumbers: 1, mailboxes: 2 });
  });
});

describe("Turso fixed-window rate limiting", () => {
  it("enforces identical action limits and separates users/actions with hashed buckets", async () => {
    for (let i = 0; i < 8; i++) await enforceRateLimit("user_a", "number_request");
    await expect(enforceRateLimit("user_a", "number_request")).rejects.toMatchObject({ status: 429, code: "app_rate_limited", retryAfter: expect.any(Number) });
    await enforceRateLimit("user_b", "number_request");
    await enforceRateLimit("user_a", "mail_generate");
    const bucket = `number_request:${createHash("sha256").update("user_a:number_request").digest("hex")}`;
    const [row] = await getDb().select().from(appRateLimits).where(eq(appRateLimits.bucket, bucket));
    expect(row.request_count).toBe(9);
    expect(row.window_start).toBeInstanceOf(Date);
    expect(bucket).not.toContain("user_a");
  });

  it("does not lose increments or over-admit concurrent app requests", async () => {
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => enforceRateLimit("user_a", "number_request")));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(8);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(22);
    expect((await getDb().select().from(appRateLimits))[0].request_count).toBe(30);
  });

  it("preserves every existing action's short-window limit", async () => {
    const limits = { inventory: 60, number_request: 8, number_list: 30, otp_poll: 20, history: 10, number_release: 10, mail_domains: 30, mail_generate: 8, mail_history: 20, mail_messages: 20, admin_overview: 20 };
    for (const [action, max] of Object.entries(limits)) {
      for (let i = 0; i < max; i++) await enforceRateLimit("user_a", action);
      await expect(enforceRateLimit("user_a", action)).rejects.toMatchObject({ status: 429, retryAfter: expect.any(Number) });
    }
  });

  it("atomically handles concurrent upserts from independent clients", async () => {
    const other = createClient({ url: process.env.TURSO_DATABASE_URL! });
    try {
      const dbs = [drizzle(client, { schema }), drizzle(other, { schema })];
      await Promise.all(Array.from({ length: 30 }, (_, i) => dbs[i % 2].insert(appRateLimits)
        .values({ bucket: "concurrent", window_start: new Date(), request_count: 1 })
        .onConflictDoUpdate({ target: appRateLimits.bucket, set: { request_count: sql`${appRateLimits.request_count} + 1` } })));
      expect((await dbs[0].select().from(appRateLimits))[0].request_count).toBe(30);
    } finally {
      other.close();
    }
  });

  it("resets both count and DB-clock timestamp at the fixed-window boundary", async () => {
    await enforceRateLimit("user_a", "number_request");
    const db = getDb();
    await db.update(appRateLimits).set({ window_start: new Date(Date.now() - 60_000), request_count: 100 });
    await enforceRateLimit("user_a", "number_request");
    const [row] = await db.select().from(appRateLimits);
    expect(row.request_count).toBe(1);
    expect(Math.abs(row.window_start.getTime() - Date.now())).toBeLessThan(2000);
    await expect(enforceRateLimit("user_a", "not_an_action")).rejects.toMatchObject({ code: "invalid_rate_limit_action" });
    expect(await db.select().from(appRateLimits).where(and(eq(appRateLimits.bucket, row.bucket), eq(appRateLimits.request_count, 1)))).toHaveLength(1);
  });
});
