CREATE TABLE `fixed_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text NOT NULL,
	`linked_account_id` text NOT NULL,
	`principal_minor` integer NOT NULL,
	`currency_code` text NOT NULL,
	`interest_rate_bps` integer NOT NULL,
	`opened_date` text NOT NULL,
	`maturity_date` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`linked_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "fixed_deposits_principal_minor_integer_check" CHECK(typeof("fixed_deposits"."principal_minor") = 'integer'),
	CONSTRAINT "fixed_deposits_status_check" CHECK("fixed_deposits"."status" in ('Open', 'Matured'))
);
