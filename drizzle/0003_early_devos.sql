CREATE TABLE `discrepancies` (
	`id` text PRIMARY KEY NOT NULL,
	`reconciliation_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`resolution` text,
	FOREIGN KEY (`reconciliation_id`) REFERENCES `reconciliations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "discrepancies_amount_minor_integer_check" CHECK(typeof("discrepancies"."amount_minor") = 'integer'),
	CONSTRAINT "discrepancies_resolution_check" CHECK("discrepancies"."resolution" in ('corrected-my-record', 'disputed-with-bank'))
);
--> statement-breakpoint
CREATE TABLE `reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`balance_snapshot_id` text NOT NULL,
	`computed_balance_minor` integer NOT NULL,
	`reconciled_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`balance_snapshot_id`) REFERENCES `balance_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reconciliations_computed_balance_minor_integer_check" CHECK(typeof("reconciliations"."computed_balance_minor") = 'integer')
);
