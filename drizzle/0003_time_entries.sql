CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`minutes` integer,
	`note` text DEFAULT '' NOT NULL,
	`subject_type` text,
	`subject_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_entries_started_idx` ON `time_entries` (`started_at`);--> statement-breakpoint
CREATE INDEX `time_entries_subject_idx` ON `time_entries` (`subject_type`,`subject_id`);