CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`source_account_id` text,
	`source_fixed_deposit_id` text,
	`source_amount_minor` integer NOT NULL,
	`source_currency_code` text NOT NULL,
	`destination_account_id` text,
	`destination_fixed_deposit_id` text,
	`destination_amount_minor` integer NOT NULL,
	`destination_currency_code` text NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`source_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_fixed_deposit_id`) REFERENCES `fixed_deposits`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_fixed_deposit_id`) REFERENCES `fixed_deposits`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transfers_source_amount_minor_integer_check" CHECK(typeof("transfers"."source_amount_minor") = 'integer'),
	CONSTRAINT "transfers_destination_amount_minor_integer_check" CHECK(typeof("transfers"."destination_amount_minor") = 'integer')
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `transfer_id` text REFERENCES transfers(id);