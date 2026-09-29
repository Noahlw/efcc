CREATE TABLE `sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`revoked_at` integer,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE no action
) STRICT;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `account_status` text DEFAULT 'Active' NOT NULL;
