CREATE TABLE `money_receipts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`store` text NOT NULL,
	`date` text NOT NULL,
	`total_cents` integer NOT NULL,
	`type` text DEFAULT 'purchase' NOT NULL,
	`items` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_transaction` integer NOT NULL,
	`bank_matched` integer DEFAULT false NOT NULL,
	`before` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `money_receipts_transaction_idx` ON `money_receipts` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `money_receipts_date_idx` ON `money_receipts` (`date`);