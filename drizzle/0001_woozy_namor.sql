ALTER TABLE `road_condition_report` ADD `route_run_id` integer REFERENCES route_run(id);--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `issue_type` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `traffic_level` text DEFAULT 'moderate' NOT NULL;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `start_label` text;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `end_label` text;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `start_latitude` real;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `start_longitude` real;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `end_latitude` real;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `end_longitude` real;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `estimated_delay_minutes` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `road_condition_report` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `road_condition_report` SET `updated_at` = `created_at` WHERE `updated_at` = 0;--> statement-breakpoint
CREATE INDEX `road_condition_route_idx` ON `road_condition_report` (`route_run_id`);--> statement-breakpoint
CREATE INDEX `road_condition_issue_type_idx` ON `road_condition_report` (`issue_type`);--> statement-breakpoint
ALTER TABLE `route_run` ADD `origin_latitude` real;--> statement-breakpoint
ALTER TABLE `route_run` ADD `origin_longitude` real;--> statement-breakpoint
ALTER TABLE `route_run` ADD `destination_latitude` real;--> statement-breakpoint
ALTER TABLE `route_run` ADD `destination_longitude` real;--> statement-breakpoint
ALTER TABLE `route_run` ADD `estimated_duration_minutes` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `route_run` ADD `route_geometry_json` text;--> statement-breakpoint
ALTER TABLE `route_run` ADD `optimizer_metadata_json` text;--> statement-breakpoint
ALTER TABLE `waste_forecast` ADD `model_source` text DEFAULT 'heuristic' NOT NULL;--> statement-breakpoint
ALTER TABLE `waste_forecast` ADD `model_version` text DEFAULT 'heuristic-v2' NOT NULL;
