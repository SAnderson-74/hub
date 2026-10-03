CREATE TABLE `money_transaction_splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `money_transaction_splits_transaction_idx` ON `money_transaction_splits` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `money_transaction_splits_category_idx` ON `money_transaction_splits` (`category_id`);