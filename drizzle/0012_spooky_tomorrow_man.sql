CREATE TABLE `stock_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`share_trading_account_id` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`share_trading_account_id`) REFERENCES `share_trading_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `trust_status` text DEFAULT 'Confirmed' NOT NULL CHECK("trust_status" in ('Confirmed', 'Imported'));
--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `import_batch_id` text REFERENCES stock_import_batches(id);
