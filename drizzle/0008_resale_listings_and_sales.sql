CREATE TABLE `resale_listing_prices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`changed_on` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `resale_listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resale_listing_prices_listing_idx` ON `resale_listing_prices` (`listing_id`);--> statement-breakpoint
CREATE TABLE `resale_listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`platform_id` integer,
	`url` text DEFAULT '' NOT NULL,
	`listed_on` text NOT NULL,
	`ended_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `resale_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`platform_id`) REFERENCES `resale_platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resale_listings_item_idx` ON `resale_listings` (`item_id`);--> statement-breakpoint
CREATE INDEX `resale_listings_platform_idx` ON `resale_listings` (`platform_id`);--> statement-breakpoint
ALTER TABLE `resale_items` ADD `sold_on` text;--> statement-breakpoint
ALTER TABLE `resale_items` ADD `sale_cents` integer;--> statement-breakpoint
ALTER TABLE `resale_items` ADD `sale_platform_id` integer REFERENCES resale_platforms(id);--> statement-breakpoint
ALTER TABLE `resale_items` ADD `buyer_notes` text DEFAULT '' NOT NULL;