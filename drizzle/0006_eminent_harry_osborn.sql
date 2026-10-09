PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`description` text NOT NULL,
	`trust_status` text NOT NULL,
	`transfer_id` text,
	`category` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transactions_amount_minor_integer_check" CHECK(typeof("__new_transactions"."amount_minor") = 'integer'),
	CONSTRAINT "transactions_trust_status_check" CHECK("__new_transactions"."trust_status" in ('Confirmed', 'Imported')),
	CONSTRAINT "transactions_category_check" CHECK("__new_transactions"."category" is null or "__new_transactions"."category" in (
        'Grocery', 'Dining', 'Education', 'Transport', 'Utilities', 'Rent', 'Health', 'Entertainment', 'Other',
        'Salary', 'Interest', 'Gift', 'Other Income'
      ))
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "account_id", "amount_minor", "occurred_at", "description", "trust_status", "transfer_id", "category") SELECT "id", "account_id", "amount_minor", "occurred_at", "description", "trust_status", "transfer_id", NULL FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_account_date_idx` ON `transactions` (`account_id`,`occurred_at`);