CREATE TABLE `processed_email_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox` text NOT NULL,
	`message_uid` text NOT NULL,
	`status` text NOT NULL,
	`processed_at` text NOT NULL,
	`import_batch_id` text,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "processed_email_alerts_status_check" CHECK("processed_email_alerts"."status" in ('matched', 'unresolved', 'invalid'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `processed_email_alerts_mailbox_uid_unique` ON `processed_email_alerts` (`mailbox`,`message_uid`);