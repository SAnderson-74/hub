CREATE TABLE `money_debt_plans` (
	`book_id` integer PRIMARY KEY NOT NULL,
	`strategy` text DEFAULT 'avalanche' NOT NULL,
	`extra_cents` integer DEFAULT 0 NOT NULL,
	`order` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `money_books`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `money_debt_terms` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`apr_basis_points` integer DEFAULT 0 NOT NULL,
	`minimum_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
