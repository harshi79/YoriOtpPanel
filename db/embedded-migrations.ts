// GENERATED FILE — DO NOT EDIT BY HAND.
// Regenerate with `npm run db:embed` after changing db/migrations.
//
// These are the committed drizzle migrations, embedded so the running app can
// create and upgrade its own tables without filesystem access (serverless-safe).
// They are applied with drizzle's own journal semantics (__drizzle_migrations),
// so `npm run db:setup` and the automatic bootstrap never conflict.
import type { MigrationMeta } from "drizzle-orm/migrator";

export const EMBEDDED_MIGRATIONS: MigrationMeta[] = [
  {
    folderMillis: 1791621281578,
    hash: "c66b07fcc8ad1cbf7cacd3388d6b7090376e19dfe7ee20edb872136fd4f92c7b",
    bps: true,
    sql: [
      "CREATE TABLE `active_number_leases` (\n\t`number_key` text PRIMARY KEY NOT NULL,\n\t`session_id` text NOT NULL,\n\t`clerk_user_id` text NOT NULL,\n\t`expires_at` integer NOT NULL,\n\tFOREIGN KEY (`session_id`) REFERENCES `number_sessions`(`id`) ON UPDATE no action ON DELETE cascade\n);\n",
      "\nCREATE UNIQUE INDEX `active_number_leases_session_id_unique` ON `active_number_leases` (`session_id`);",
      "\nCREATE INDEX `active_number_leases_user_expires_idx` ON `active_number_leases` (`clerk_user_id`,`expires_at`);",
      "\nCREATE TABLE `app_rate_limits` (\n\t`bucket` text PRIMARY KEY NOT NULL,\n\t`window_start` integer NOT NULL,\n\t`request_count` integer NOT NULL,\n\tCONSTRAINT \"app_rate_limits_request_count_check\" CHECK(\"app_rate_limits\".\"request_count\" >= 0)\n);\n",
      "\nCREATE TABLE `mailbox_ownership` (\n\t`email_key` text PRIMARY KEY NOT NULL,\n\t`provider_email` text NOT NULL,\n\t`mailbox_id` text NOT NULL,\n\t`clerk_user_id` text NOT NULL,\n\t`created_at` integer DEFAULT (cast(round(unixepoch('subsec') * 1000) as integer)) NOT NULL,\n\tFOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade\n);\n",
      "\nCREATE UNIQUE INDEX `mailbox_ownership_mailbox_id_unique` ON `mailbox_ownership` (`mailbox_id`);",
      "\nCREATE INDEX `mailbox_ownership_user_idx` ON `mailbox_ownership` (`clerk_user_id`);",
      "\nCREATE TABLE `mailboxes` (\n\t`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,\n\t`clerk_user_id` text NOT NULL,\n\t`email` text NOT NULL,\n\t`email_key` text NOT NULL,\n\t`domain` text,\n\t`created_at` integer DEFAULT (cast(round(unixepoch('subsec') * 1000) as integer)) NOT NULL\n);\n",
      "\nCREATE INDEX `mailboxes_user_created_idx` ON `mailboxes` (`clerk_user_id`,\"created_at\" desc);",
      "\nCREATE TABLE `number_sessions` (\n\t`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,\n\t`clerk_user_id` text NOT NULL,\n\t`number` text NOT NULL,\n\t`number_key` text NOT NULL,\n\t`service` text NOT NULL,\n\t`country` text,\n\t`flag` text,\n\t`network` text,\n\t`assigned_at` integer NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`released_at` integer,\n\t`end_reason` text,\n\t`created_at` integer DEFAULT (cast(round(unixepoch('subsec') * 1000) as integer)) NOT NULL\n);\n",
      "\nCREATE INDEX `number_sessions_user_created_idx` ON `number_sessions` (`clerk_user_id`,\"created_at\" desc);",
      "\nCREATE INDEX `number_sessions_number_key_idx` ON `number_sessions` (`number_key`);",
    ],
  },
];
