CREATE TABLE `habit_checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_checkins_habit_date_unique` ON `habit_checkins` (`habit_id`,`date`);--> statement-breakpoint
CREATE INDEX `habit_checkins_date_idx` ON `habit_checkins` (`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'check' NOT NULL,
	`schedule` text DEFAULT '{"kind":"daily"}' NOT NULL,
	`start_date` text NOT NULL,
	`remind_at` text,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
