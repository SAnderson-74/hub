CREATE TABLE `money_card_rewards` (
	`card_id` integer PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'cash_back' NOT NULL,
	`base_rate` integer DEFAULT 0 NOT NULL,
	`point_value` integer DEFAULT 100 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `money_reward_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`category_id` integer,
	`contains` text,
	`rate` integer NOT NULL,
	`starts_on` text,
	`ends_on` text,
	`cap_cents` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `money_reward_rates_card_idx` ON `money_reward_rates` (`card_id`);