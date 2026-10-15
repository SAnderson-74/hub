CREATE TABLE `tithing_income` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`applies` integer DEFAULT true NOT NULL,
	`base_cents` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tithing_income_transaction_unique` ON `tithing_income` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `tithing_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_transaction_id` integer NOT NULL,
	`income_transaction_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tithing_links_pair_unique` ON `tithing_links` (`payment_transaction_id`,`income_transaction_id`);--> statement-breakpoint
CREATE INDEX `tithing_links_income_idx` ON `tithing_links` (`income_transaction_id`);--> statement-breakpoint
CREATE TABLE `tithing_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`fund` text DEFAULT 'tithing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tithing_payments_transaction_unique` ON `tithing_payments` (`transaction_id`);