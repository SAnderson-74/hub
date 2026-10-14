ALTER TABLE `tasks` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `someday` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `evening` integer DEFAULT false NOT NULL;