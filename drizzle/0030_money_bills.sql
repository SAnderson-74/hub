CREATE TABLE `money_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'bill' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`next_date` text NOT NULL,
	`account_id` integer,
	`category_id` integer,
	`match_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `money_books`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `money_bills_book_idx` ON `money_bills` (`book_id`);