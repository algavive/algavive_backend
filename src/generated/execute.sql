-- Disable the enforcement of foreign-keys constraints
PRAGMA foreign_keys = off;
-- Create "new_users_api_limits" table
CREATE TABLE `new_users_api_limits` (
  `user_id` integer NOT NULL,
  `api_limit_change_username_per_day` integer NOT NULL DEFAULT 1,
  `api_limit_create_comments_per_minute` integer NOT NULL DEFAULT 3,
  `api_limit_create_projects_per_minute` integer NOT NULL DEFAULT 1,
  `api_limit_username_exempt` integer NULL DEFAULT 0,
  `api_limit_comments_exempt` integer NULL DEFAULT 0,
  `api_limit_projects_exempt` integer NULL DEFAULT 0,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Copy rows from old table "users_api_limits" to new temporary table "new_users_api_limits"
INSERT INTO `new_users_api_limits` (`user_id`) SELECT `user_id` FROM `users_api_limits`;
-- Drop "users_api_limits" table after copying rows
DROP TABLE `users_api_limits`;
-- Rename temporary table "new_users_api_limits" to "users_api_limits"
ALTER TABLE `new_users_api_limits` RENAME TO `users_api_limits`;
-- Drop "notifications" table
DROP TABLE `notifications`;
-- Drop "admin_permissions" table
DROP TABLE `admin_permissions`;
-- Create "users_api_limits_use" table
CREATE TABLE `users_api_limits_use` (
  `user_id` integer NOT NULL,
  `created_at` timestamp NULL DEFAULT (CURRENT_TIMESTAMP),
  `action` integer NOT NULL,
  CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_limits_use_user_action_created" to table: "users_api_limits_use"
CREATE INDEX `idx_limits_use_user_action_created` ON `users_api_limits_use` (`user_id`, `action`, `created_at`);
-- Enable back the enforcement of foreign-keys constraints
PRAGMA foreign_keys = on;
