CREATE TABLE `money_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`contains` text NOT NULL,
	`direction` text DEFAULT 'any' NOT NULL,
	`category_id` integer NOT NULL,
	`rename_to` text DEFAULT '' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `money_books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `money_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `money_rules_book_idx` ON `money_rules` (`book_id`);--> statement-breakpoint
ALTER TABLE `money_transactions` ADD `transfer_peer_id` integer;--> statement-breakpoint
CREATE INDEX `money_transactions_transfer_idx` ON `money_transactions` (`transfer_peer_id`);