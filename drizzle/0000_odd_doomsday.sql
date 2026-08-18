CREATE TABLE `flow_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flow_id` integer NOT NULL,
	`command` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`bot_username` text NOT NULL,
	`interval_seconds` integer DEFAULT 4 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`flow_id` integer NOT NULL,
	`command` text NOT NULL,
	`response_text` text DEFAULT '' NOT NULL,
	`response_kind` text DEFAULT 'text' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_secrets` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`api_id` text NOT NULL,
	`encrypted_api_hash` text NOT NULL,
	`encrypted_session` text DEFAULT '' NOT NULL,
	`phone_hint` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
