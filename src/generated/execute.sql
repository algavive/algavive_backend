-- Disable the enforcement of foreign-keys constraints
PRAGMA foreign_keys = off;
-- Create "new_users_api_limits" table
CREATE TABLE `new_users_api_limits` (
  `user_id` integer NOT NULL,
  `api_limit_change_username` integer NOT NULL DEFAULT 3,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Copy rows from old table "users_api_limits" to new temporary table "new_users_api_limits"
INSERT INTO `new_users_api_limits` (`user_id`, `api_limit_change_username`) SELECT `user_id`, `api_limit_change_username` FROM `users_api_limits`;
-- Drop "users_api_limits" table after copying rows
DROP TABLE `users_api_limits`;
-- Rename temporary table "new_users_api_limits" to "users_api_limits"
ALTER TABLE `new_users_api_limits` RENAME TO `users_api_limits`;
-- Drop "notifications" table
DROP TABLE `notifications`;
-- Drop "admin_permissions" table
DROP TABLE `admin_permissions`;
-- Enable back the enforcement of foreign-keys constraints
PRAGMA foreign_keys = on;
