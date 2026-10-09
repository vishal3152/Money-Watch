ALTER TABLE `stock_transactions` ADD `external_ref` text;--> statement-breakpoint
ALTER TABLE `stock_transactions` ADD `possible_duplicate_of_transaction_id` text REFERENCES stock_transactions(id);