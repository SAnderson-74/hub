CREATE TABLE `money_import_layouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`header_key` text NOT NULL,
	`columns` text NOT NULL,
	`options` text NOT NULL,
	`account_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `money_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `money_import_layouts_header_key_unique` ON `money_import_layouts` (`header_key`);--> statement-breakpoint
CREATE TABLE `money_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`source` text NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`undone_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `money_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `money_imports_account_idx` ON `money_imports` (`account_id`);--> statement-breakpoint
ALTER TABLE `money_transactions` ADD `import_id` integer;--> statement-breakpoint
ALTER TABLE `money_transactions` ADD `external_id` text;--> statement-breakpoint
CREATE INDEX `money_transactions_import_idx` ON `money_transactions` (`import_id`);--> statement-breakpoint
CREATE INDEX `money_transactions_external_idx` ON `money_transactions` (`account_id`,`external_id`);