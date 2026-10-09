CREATE TABLE `email_sync_cursors` (
	`mailbox` text PRIMARY KEY NOT NULL,
	`uid_validity` text,
	`last_message_uid` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `processed_email_alerts` ADD `alert_draft_json` text;--> statement-breakpoint
ALTER TABLE `processed_email_alerts` ADD `invalid_fields_json` text;