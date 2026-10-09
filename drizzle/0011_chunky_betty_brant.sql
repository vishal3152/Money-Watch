CREATE TABLE `share_trading_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`account_number` text,
	`currency_code` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `stock_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`share_trading_account_id` text NOT NULL,
	`scrip_code` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`price_per_unit_minor` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`share_trading_account_id`) REFERENCES `share_trading_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stock_transactions_quantity_integer_check" CHECK(typeof("stock_transactions"."quantity") = 'integer'),
	CONSTRAINT "stock_transactions_price_per_unit_minor_integer_check" CHECK(typeof("stock_transactions"."price_per_unit_minor") = 'integer'),
	CONSTRAINT "stock_transactions_type_check" CHECK("stock_transactions"."type" in ('Buy', 'Sell'))
);
--> statement-breakpoint
CREATE INDEX `stock_transactions_share_trading_account_date_idx` ON `stock_transactions` (`share_trading_account_id`,`occurred_at`);