CREATE TABLE `match_records` (
	`match_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`rules_version` text NOT NULL,
	`build_version` text NOT NULL,
	`mode` text NOT NULL,
	`player_ids` text NOT NULL,
	`player_names` text NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`record_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `match_records_created_at_idx` ON `match_records` (`created_at`);--> statement-breakpoint
CREATE INDEX `match_records_rules_version_idx` ON `match_records` (`rules_version`);--> statement-breakpoint
CREATE INDEX `match_records_mode_idx` ON `match_records` (`mode`);