CREATE TABLE `business_gear` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'need' NOT NULL,
	`cost_cents` integer,
	`acquired_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`value_cents` integer,
	`next_step` text DEFAULT '' NOT NULL,
	`next_step_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_phases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'skill' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`earned_on` text,
	`expires_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phase_id` integer NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`estimate_cents` integer,
	`spent_cents` integer,
	`due_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`phase_id`) REFERENCES `business_phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `business_steps_phase_idx` ON `business_steps` (`phase_id`);