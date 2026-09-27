CREATE TABLE `resale_costs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`amount_cents` integer NOT NULL,
	`spent_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `resale_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resale_costs_item_idx` ON `resale_costs` (`item_id`);