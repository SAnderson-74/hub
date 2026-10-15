CREATE TABLE `money_budget_settings` (
	`category_id` integer PRIMARY KEY NOT NULL,
	`rollover` integer DEFAULT false NOT NULL,
	`rollover_from` text,
	`goal_cents` integer,
	`goal_date` text,
	`goal_every_months` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `money_reimbursements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`who` text DEFAULT '' NOT NULL,
	`repayment_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `money_reimbursements_transaction_idx` ON `money_reimbursements` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `money_reimbursements_repayment_idx` ON `money_reimbursements` (`repayment_id`);