CREATE TABLE `money_point_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`date` text NOT NULL,
	`points` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `money_point_balances_card_date_unique` ON `money_point_balances` (`card_id`,`date`);--> statement-breakpoint
CREATE TABLE `money_point_redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`date` text NOT NULL,
	`points` integer NOT NULL,
	`value_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `money_point_redemptions_card_idx` ON `money_point_redemptions` (`card_id`);--> statement-breakpoint
ALTER TABLE `money_card_rewards` ADD `annual_fee_cents` integer DEFAULT 0 NOT NULL;