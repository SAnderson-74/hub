CREATE TABLE `resale_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'acquired' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`condition` text DEFAULT '' NOT NULL,
	`purchased_on` text,
	`purchase_cents` integer,
	`purchase_platform_id` integer,
	`purchase_from` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`purchase_platform_id`) REFERENCES `resale_platforms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resale_items_status_idx` ON `resale_items` (`status`);--> statement-breakpoint
CREATE INDEX `resale_items_platform_idx` ON `resale_items` (`purchase_platform_id`);--> statement-breakpoint
CREATE TABLE `resale_platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
