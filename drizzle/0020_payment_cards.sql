CREATE TABLE `money_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`last4` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `money_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `money_cards_account_idx` ON `money_cards` (`account_id`);--> statement-breakpoint
ALTER TABLE `money_transactions` ADD `card_id` integer REFERENCES money_cards(id);--> statement-breakpoint
CREATE INDEX `money_transactions_card_idx` ON `money_transactions` (`card_id`);