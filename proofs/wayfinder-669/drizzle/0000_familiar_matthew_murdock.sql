CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`audit_id` text PRIMARY KEY NOT NULL,
	`inserted_at` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`old_value_json` text,
	`new_value_json` text,
	`reason` text,
	`outcome` text NOT NULL,
	`correlation_id` text,
	CONSTRAINT "audit_outcome" CHECK("audit_events"."outcome" in ('SUCCESS', 'DUPLICATE', 'CONFLICT', 'DENIED', 'FAILED'))
) STRICT;
--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_events_corr_idx` ON `audit_events` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`event_id` text PRIMARY KEY NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE `home_content` (
	`content_id` text NOT NULL,
	`version` integer NOT NULL,
	`template_type` text NOT NULL,
	`status` text NOT NULL,
	`publish_mode` text DEFAULT 'immediate' NOT NULL,
	`start_at` text,
	`end_at` text,
	`title` text,
	`summary` text,
	`body_markdown` text,
	`cta_label` text,
	`cta_url` text,
	`image_url` text,
	`image_alt` text,
	`featured_event_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL,
	`published_by` text,
	`published_at` text,
	`archived_by` text,
	`archived_at` text,
	PRIMARY KEY(`content_id`, `version`),
	FOREIGN KEY (`featured_event_id`) REFERENCES `events`(`event_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`published_by`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`archived_by`) REFERENCES `accounts`(`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "home_version_positive" CHECK("home_content"."version" >= 1),
	CONSTRAINT "home_template_type" CHECK("home_content"."template_type" in ('A', 'B')),
	CONSTRAINT "home_status" CHECK("home_content"."status" in ('Draft', 'Published', 'Archived')),
	CONSTRAINT "home_publish_mode" CHECK("home_content"."publish_mode" in ('immediate', 'scheduled'))
) STRICT;
--> statement-breakpoint
CREATE INDEX `home_content_status_idx` ON `home_content` (`status`,`publish_mode`,`start_at`,`end_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `home_content_version_idx` ON `home_content` (`version`);
