CREATE TABLE `active_number_leases` (
	`number_key` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `number_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_number_leases_session_id_unique` ON `active_number_leases` (`session_id`);--> statement-breakpoint
CREATE INDEX `active_number_leases_user_expires_idx` ON `active_number_leases` (`clerk_user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `app_rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer NOT NULL,
	CONSTRAINT "app_rate_limits_request_count_check" CHECK("app_rate_limits"."request_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `mailbox_ownership` (
	`email_key` text PRIMARY KEY NOT NULL,
	`provider_email` text NOT NULL,
	`mailbox_id` text NOT NULL,
	`clerk_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(round(unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_ownership_mailbox_id_unique` ON `mailbox_ownership` (`mailbox_id`);--> statement-breakpoint
CREATE INDEX `mailbox_ownership_user_idx` ON `mailbox_ownership` (`clerk_user_id`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`clerk_user_id` text NOT NULL,
	`email` text NOT NULL,
	`email_key` text NOT NULL,
	`domain` text,
	`created_at` integer DEFAULT (cast(round(unixepoch('subsec') * 1000) as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mailboxes_user_created_idx` ON `mailboxes` (`clerk_user_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `number_sessions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', (random() & 3) + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`clerk_user_id` text NOT NULL,
	`number` text NOT NULL,
	`number_key` text NOT NULL,
	`service` text NOT NULL,
	`country` text,
	`flag` text,
	`network` text,
	`assigned_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`released_at` integer,
	`end_reason` text,
	`created_at` integer DEFAULT (cast(round(unixepoch('subsec') * 1000) as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `number_sessions_user_created_idx` ON `number_sessions` (`clerk_user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `number_sessions_number_key_idx` ON `number_sessions` (`number_key`);