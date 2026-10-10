import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Database-side defaults also work for setup/import tools that do not use Drizzle.
const uuidDefault = sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))`;
export const databaseNowMs = sql`(cast(round(unixepoch('subsec') * 1000) as integer))`;
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const numberSessions = sqliteTable("number_sessions", {
  id: text("id").primaryKey().notNull().default(uuidDefault),
  clerk_user_id: text("clerk_user_id").notNull(),
  number: text("number").notNull(),
  number_key: text("number_key").notNull(),
  service: text("service").notNull(),
  country: text("country"),
  flag: text("flag"),
  network: text("network"),
  assigned_at: timestamp("assigned_at").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  released_at: timestamp("released_at"),
  end_reason: text("end_reason"),
  created_at: timestamp("created_at").notNull().default(databaseNowMs),
}, (table) => [
  index("number_sessions_user_created_idx").on(table.clerk_user_id, sql`${table.created_at} desc`),
  index("number_sessions_number_key_idx").on(table.number_key),
]);

// A provider phone number is globally leased to at most one YoriOTP user at a time.
export const activeNumberLeases = sqliteTable("active_number_leases", {
  number_key: text("number_key").primaryKey().notNull(),
  session_id: text("session_id").notNull().unique().references(() => numberSessions.id, { onDelete: "cascade" }),
  clerk_user_id: text("clerk_user_id").notNull(),
  expires_at: timestamp("expires_at").notNull(),
}, (table) => [
  index("active_number_leases_user_expires_idx").on(table.clerk_user_id, table.expires_at),
]);

export const mailboxes = sqliteTable("mailboxes", {
  id: text("id").primaryKey().notNull().default(uuidDefault),
  clerk_user_id: text("clerk_user_id").notNull(),
  email: text("email").notNull(),
  email_key: text("email_key").notNull(),
  domain: text("domain"),
  created_at: timestamp("created_at").notNull().default(databaseNowMs),
}, (table) => [
  index("mailboxes_user_created_idx").on(table.clerk_user_id, sql`${table.created_at} desc`),
]);

// The provider has no mailbox release endpoint; ownership records are retained.
export const mailboxOwnership = sqliteTable("mailbox_ownership", {
  email_key: text("email_key").primaryKey().notNull(),
  provider_email: text("provider_email").notNull(),
  mailbox_id: text("mailbox_id").notNull().unique().references(() => mailboxes.id, { onDelete: "cascade" }),
  clerk_user_id: text("clerk_user_id").notNull(),
  created_at: timestamp("created_at").notNull().default(databaseNowMs),
}, (table) => [
  index("mailbox_ownership_user_idx").on(table.clerk_user_id),
]);

// Fixed-window, database-backed rate limits work across server instances.
export const appRateLimits = sqliteTable("app_rate_limits", {
  bucket: text("bucket").primaryKey().notNull(),
  window_start: timestamp("window_start").notNull(),
  request_count: integer("request_count").notNull(),
}, (table) => [
  check("app_rate_limits_request_count_check", sql`${table.request_count} >= 0`),
]);
