import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Headers }) => ({
      status: init?.status ?? 200,
      headers: init?.headers,
      json: async () => body,
    }),
  },
}));

let folder: string;
let dbFile: string;

async function useDatabase(url: string | undefined, token = ""): Promise<void> {
  if (url === undefined) vi.stubEnv("TURSO_DATABASE_URL", "");
  else vi.stubEnv("TURSO_DATABASE_URL", url);
  vi.stubEnv("TURSO_AUTH_TOKEN", token);
  vi.resetModules();
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "yoriotp-health-"));
  dbFile = join(folder, "test.db");
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

describe("database error mapping", () => {
  it("detects missing tables anywhere in the Drizzle/libSQL cause chain", async () => {
    await useDatabase(`file:${dbFile}`);
    const { isMissingTableError, mapDatabaseError } = await import("@/lib/db");
    const wrapped = {
      name: "DrizzleQueryError",
      message: "Failed query: insert ...",
      cause: {
        name: "LibsqlError",
        code: "SQLITE_ERROR",
        message: "SQLITE_ERROR: no such table: app_rate_limits",
        cause: { name: "SqliteError", message: "no such table: app_rate_limits" },
      },
    };
    expect(isMissingTableError(wrapped)).toBe(true);
    expect(mapDatabaseError(wrapped)).toMatchObject({ status: 503, code: "database_not_initialized" });
    expect(isMissingTableError(new Error("connection reset"))).toBe(false);
    expect(mapDatabaseError(new Error("connection reset"))).toMatchObject({ status: 503, code: "database_unavailable" });
  });

  it("passes AppErrors through untouched", async () => {
    await useDatabase(`file:${dbFile}`);
    const { mapDatabaseError } = await import("@/lib/db");
    const { AppError } = await import("@/lib/errors");
    const original = new AppError(409, "provider_number_already_leased", "busy");
    expect(mapDatabaseError(original)).toBe(original);
  });

  it("reports an unmigrated database as 503 database_not_initialized, not generic 500", async () => {
    // Fresh file, migrations deliberately NOT applied: this is the production
    // state when `npm run db:setup` was never run against the Turso database.
    await useDatabase(`file:${dbFile}`);
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    const ownership = await import("@/lib/ownership");
    const { jsonError } = await import("@/lib/http");

    await expect(enforceRateLimit("user_123", "inventory"))
      .rejects.toMatchObject({ status: 503, code: "database_not_initialized" });
    await expect(ownership.listOwnedActiveNumbers("user_123"))
      .rejects.toMatchObject({ status: 503, code: "database_not_initialized" });
    await expect(ownership.listOwnedNumberHistory("user_123"))
      .rejects.toMatchObject({ status: 503, code: "database_not_initialized" });
    await expect(ownership.listOwnedMailboxes("user_123"))
      .rejects.toMatchObject({ status: 503, code: "database_not_initialized" });
    await expect(ownership.getOwnerOverview())
      .rejects.toMatchObject({ status: 503, code: "database_not_initialized" });

    const response = jsonError(await enforceRateLimit("user_123", "inventory").then(
      () => new Error("unreachable"),
      (cause: unknown) => cause,
    ));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, code: "database_not_initialized" });
  });

  it("keeps validation and conflict errors intact when the database is broken", async () => {
    await useDatabase(`file:${dbFile}`);
    const ownership = await import("@/lib/ownership");
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    await expect(ownership.createNumberOwnership("user_a", { number: "x", assigned_at: new Date(), raw: {} }))
      .rejects.toMatchObject({ status: 502, code: "provider_contract_error" });
    await expect(ownership.createMailboxOwnership("user_a", "not-an-email", ""))
      .rejects.toMatchObject({ status: 502, code: "provider_contract_error" });
    await expect(enforceRateLimit("user_a", "nope"))
      .rejects.toMatchObject({ status: 500, code: "invalid_rate_limit_action" });
  });

  it("still reports an unreachable database as 503 database_unavailable", async () => {
    await useDatabase("libsql://invalid-host.invalid", "placeholder-test-token");
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    await expect(enforceRateLimit("user_123", "inventory"))
      .rejects.toMatchObject({ status: 503, code: expect.stringMatching(/database_(unavailable|not_initialized)/) });
  });
});

describe("database readiness probe", () => {
  it("reports unconfigured when no database URL is set", async () => {
    await useDatabase(undefined);
    const { probeDatabase } = await import("@/lib/health");
    expect(await probeDatabase()).toEqual({ configured: false, reachable: false, initialized: false });
  });

  it("distinguishes reachable-but-unmigrated from fully initialized", async () => {
    await useDatabase(`file:${dbFile}`);
    const { probeDatabase } = await import("@/lib/health");
    expect(await probeDatabase()).toEqual({ configured: true, reachable: true, initialized: false });

    const client = createClient({ url: `file:${dbFile}` });
    await migrate(drizzle(client), { migrationsFolder: "db/migrations" });
    client.close();
    expect(await probeDatabase()).toEqual({ configured: true, reachable: true, initialized: true });
  });
});

describe("in-memory diagnostics throttle", () => {
  it("allows a burst, then fails closed with 429 and Retry-After", async () => {
    await useDatabase(`file:${dbFile}`);
    const { enforceMemoryRateLimit } = await import("@/lib/rate-limit");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      enforceMemoryRateLimit("health:test-bucket", 3, 60);
    }
    try {
      enforceMemoryRateLimit("health:test-bucket", 3, 60);
      expect.unreachable("expected the fourth request to be throttled");
    } catch (error) {
      expect(error).toMatchObject({ status: 429, code: "app_rate_limited" });
      expect((error as { retryAfter?: number }).retryAfter).toBeGreaterThan(0);
    }
    // Other buckets are unaffected.
    enforceMemoryRateLimit("health:other-bucket", 3, 60);
  });
});
