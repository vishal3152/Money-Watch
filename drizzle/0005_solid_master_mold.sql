PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_fixed_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`linked_account_id` text NOT NULL,
	`principal_minor` integer NOT NULL,
	`original_principal_minor` integer NOT NULL,
	`currency_code` text NOT NULL,
	`interest_rate_bps` integer NOT NULL,
	`opened_date` text NOT NULL,
	`maturity_date` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`linked_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "fixed_deposits_principal_minor_integer_check" CHECK(typeof("__new_fixed_deposits"."principal_minor") = 'integer'),
	CONSTRAINT "fixed_deposits_original_principal_minor_integer_check" CHECK(typeof("__new_fixed_deposits"."original_principal_minor") = 'integer'),
	CONSTRAINT "fixed_deposits_status_check" CHECK("__new_fixed_deposits"."status" in ('Open', 'Matured', 'PrematurelyClosed'))
);
--> statement-breakpoint
INSERT INTO `__new_fixed_deposits`("id", "institution_id", "linked_account_id", "principal_minor", "original_principal_minor", "currency_code", "interest_rate_bps", "opened_date", "maturity_date", "status") SELECT "id", "institution_id", "linked_account_id", "principal_minor", "principal_minor", "currency_code", "interest_rate_bps", "opened_date", "maturity_date", "status" FROM `fixed_deposits`;--> statement-breakpoint
DROP TABLE `fixed_deposits`;--> statement-breakpoint
ALTER TABLE `__new_fixed_deposits` RENAME TO `fixed_deposits`;--> statement-breakpoint
CREATE TABLE `__new_transfers` (
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
	`purpose` text DEFAULT 'general' NOT NULL,
	FOREIGN KEY (`source_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_fixed_deposit_id`) REFERENCES `fixed_deposits`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_fixed_deposit_id`) REFERENCES `fixed_deposits`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transfers_source_amount_minor_integer_check" CHECK(typeof("__new_transfers"."source_amount_minor") = 'integer'),
	CONSTRAINT "transfers_destination_amount_minor_integer_check" CHECK(typeof("__new_transfers"."destination_amount_minor") = 'integer'),
	CONSTRAINT "transfers_purpose_check" CHECK("__new_transfers"."purpose" in ('general', 'fixed-deposit-opening', 'fixed-deposit-top-up', 'fixed-deposit-withdrawal'))
);
--> statement-breakpoint
INSERT INTO `__new_transfers`("id", "source_account_id", "source_fixed_deposit_id", "source_amount_minor", "source_currency_code", "destination_account_id", "destination_fixed_deposit_id", "destination_amount_minor", "destination_currency_code", "occurred_at", "description", "purpose") SELECT "id", "source_account_id", "source_fixed_deposit_id", "source_amount_minor", "source_currency_code", "destination_account_id", "destination_fixed_deposit_id", "destination_amount_minor", "destination_currency_code", "occurred_at", "description", CASE WHEN "source_fixed_deposit_id" IS NOT NULL THEN 'fixed-deposit-withdrawal' WHEN "destination_fixed_deposit_id" IS NOT NULL THEN 'fixed-deposit-opening' ELSE 'general' END FROM `transfers`;--> statement-breakpoint
DROP TABLE `transfers`;--> statement-breakpoint
ALTER TABLE `__new_transfers` RENAME TO `transfers`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;