ALTER TABLE `resale_items` ADD `sku` text;--> statement-breakpoint
ALTER TABLE `resale_items` ADD `spot` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `resale_items_sku_unique` ON `resale_items` (`sku`);