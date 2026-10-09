CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`closing_balance_minor` integer,
	`as_of_date` text,
	`confirmed_at` text,
	`balance_snapshot_id` text,
	`reconciliation_id` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`balance_snapshot_id`) REFERENCES `balance_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reconciliation_id`) REFERENCES `reconciliations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "import_batches_closing_balance_minor_integer_check" CHECK("import_batches"."closing_balance_minor" is null or typeof("import_batches"."closing_balance_minor") = 'integer')
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `import_batch_id` text REFERENCES import_batches(id);