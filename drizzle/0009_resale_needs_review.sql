ALTER TABLE `resale_items` ADD `needs_review` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `resale_items` ADD `review_note` text DEFAULT '' NOT NULL;