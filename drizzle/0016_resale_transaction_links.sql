CREATE TABLE `resale_item_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`transaction_id` integer NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `resale_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `money_transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resale_item_transactions_item_transaction_unique` ON `resale_item_transactions` (`item_id`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `resale_item_transactions_transaction_idx` ON `resale_item_transactions` (`transaction_id`);