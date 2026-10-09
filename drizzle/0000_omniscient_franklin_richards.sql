CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`name` text NOT NULL,
	`currency_code` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`as_of_date` text NOT NULL,
	`balance_minor` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "balance_snapshots_balance_minor_integer_check" CHECK(typeof("balance_snapshots"."balance_minor") = 'integer')
);
--> statement-breakpoint
CREATE INDEX `balance_snapshots_account_date_idx` ON `balance_snapshots` (`account_id`,`as_of_date`);--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text NOT NULL,
	`trust_status` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transactions_amount_minor_integer_check" CHECK(typeof("transactions"."amount_minor") = 'integer'),
	CONSTRAINT "transactions_trust_status_check" CHECK("transactions"."trust_status" in ('Confirmed', 'Imported'))
);
--> statement-breakpoint
CREATE INDEX `transactions_account_date_idx` ON `transactions` (`account_id`,`occurred_at`);