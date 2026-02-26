CREATE TABLE `citizen_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_user_id` text NOT NULL,
	`zone_id` integer,
	`category` text DEFAULT 'uncollected' NOT NULL,
	`description` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zone`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `citizen_report_status_idx` ON `citizen_report` (`status`);--> statement-breakpoint
CREATE INDEX `citizen_report_zone_idx` ON `citizen_report` (`zone_id`);--> statement-breakpoint
CREATE INDEX `citizen_report_reporter_idx` ON `citizen_report` (`reporter_user_id`);--> statement-breakpoint
CREATE TABLE `collection_point` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_id` integer NOT NULL,
	`label` text NOT NULL,
	`address` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zone`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_point_zone_idx` ON `collection_point` (`zone_id`);--> statement-breakpoint
CREATE TABLE `driver_event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_run_id` integer,
	`driver_user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`route_run_id`) REFERENCES `route_run`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `driver_event_route_idx` ON `driver_event_log` (`route_run_id`);--> statement-breakpoint
CREATE INDEX `driver_event_driver_idx` ON `driver_event_log` (`driver_user_id`);--> statement-breakpoint
CREATE TABLE `driver_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`vehicle_id` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `driver_profile_user_id_unique` ON `driver_profile` (`user_id`);--> statement-breakpoint
CREATE INDEX `driver_profile_vehicle_idx` ON `driver_profile` (`vehicle_id`);--> statement-breakpoint
CREATE TABLE `kpi_daily_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_date` text NOT NULL,
	`ward_id` integer,
	`planned_runs` integer DEFAULT 0 NOT NULL,
	`completed_runs` integer DEFAULT 0 NOT NULL,
	`open_reports` integer DEFAULT 0 NOT NULL,
	`resolved_reports` integer DEFAULT 0 NOT NULL,
	`average_response_hours` real DEFAULT 0 NOT NULL,
	`avg_run_duration_minutes` real DEFAULT 0 NOT NULL,
	`total_distance_km` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ward_id`) REFERENCES `ward`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kpi_daily_snapshot_snapshot_date_unique` ON `kpi_daily_snapshot` (`snapshot_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `kpi_daily_snapshot_ward_date_idx` ON `kpi_daily_snapshot` (`ward_id`,`snapshot_date`);--> statement-breakpoint
CREATE TABLE `report_photo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`object_key` text NOT NULL,
	`public_url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `citizen_report`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_photo_object_key_unique` ON `report_photo` (`object_key`);--> statement-breakpoint
CREATE INDEX `report_photo_report_idx` ON `report_photo` (`report_id`);--> statement-breakpoint
CREATE TABLE `road_condition_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_user_id` text NOT NULL,
	`zone_id` integer,
	`severity` text DEFAULT 'medium' NOT NULL,
	`description` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zone`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `road_condition_zone_idx` ON `road_condition_report` (`zone_id`);--> statement-breakpoint
CREATE TABLE `route_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_date` text NOT NULL,
	`ward_id` integer,
	`driver_user_id` text,
	`vehicle_id` integer,
	`status` text DEFAULT 'planned' NOT NULL,
	`planned_distance_km` real DEFAULT 0 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ward_id`) REFERENCES `ward`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `route_run_run_date_idx` ON `route_run` (`run_date`);--> statement-breakpoint
CREATE INDEX `route_run_status_idx` ON `route_run` (`status`);--> statement-breakpoint
CREATE INDEX `route_run_driver_idx` ON `route_run` (`driver_user_id`);--> statement-breakpoint
CREATE TABLE `route_stop` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route_run_id` integer NOT NULL,
	`zone_id` integer,
	`source_report_id` integer,
	`sequence` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`action` text DEFAULT 'collect' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`route_run_id`) REFERENCES `route_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `zone`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_report_id`) REFERENCES `citizen_report`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `route_stop_route_idx` ON `route_stop` (`route_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `route_stop_route_sequence_idx` ON `route_stop` (`route_run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `user_role` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'citizen' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_role_user_id_unique` ON `user_role` (`user_id`);--> statement-breakpoint
CREATE TABLE `vehicle` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plate_number` text NOT NULL,
	`capacity_kg` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_plate_number_unique` ON `vehicle` (`plate_number`);--> statement-breakpoint
CREATE TABLE `ward` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ward_code_unique` ON `ward` (`code`);--> statement-breakpoint
CREATE TABLE `waste_forecast` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_id` integer NOT NULL,
	`forecast_date` text NOT NULL,
	`predicted_volume_kg` real DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zone`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waste_forecast_zone_date_idx` ON `waste_forecast` (`zone_id`,`forecast_date`);--> statement-breakpoint
CREATE TABLE `zone` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ward_id` integer NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`center_lat` real,
	`center_lng` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ward_id`) REFERENCES `ward`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `zone_ward_idx` ON `zone` (`ward_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `zone_code_per_ward_idx` ON `zone` (`ward_id`,`code`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);