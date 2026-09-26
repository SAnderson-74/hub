CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`target_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`closed_at` integer,
	`progress_mode` text DEFAULT 'milestones' NOT NULL,
	`manual_percent` integer DEFAULT 0 NOT NULL,
	`target_cents` integer,
	`current_cents` integer DEFAULT 0 NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`title` text NOT NULL,
	`target_date` text,
	`done_at` integer,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `milestones_goal_idx` ON `milestones` (`goal_id`);