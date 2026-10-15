CREATE TABLE `weekly_reviews` (
	`week` text PRIMARY KEY NOT NULL,
	`done` text DEFAULT '[]' NOT NULL,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
