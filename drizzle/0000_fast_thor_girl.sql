CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`started_at` integer,
	`ended_at` integer,
	`mode` text,
	`summary` text,
	`transcript` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memory` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`kind` text,
	`content` text,
	`created_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`full_name` text,
	`email` text,
	`phone` text,
	`age` integer,
	`physical_status` text,
	`mental_status` text,
	`preferences` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'user',
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);