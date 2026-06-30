-- Disable the enforcement of foreign-keys constraints
PRAGMA foreign_keys = off;
-- Create "new_users" table
CREATE TABLE `new_users` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `login` text NULL,
  `pass_hash` text NULL,
  `google_id` text NULL,
  `username` text NULL,
  `created_at` timestamp NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` timestamp NULL DEFAULT (CURRENT_TIMESTAMP)
);
-- Copy rows from old table "users" to new temporary table "new_users"
INSERT INTO `new_users` (`id`, `login`, `pass_hash`, `google_id`, `username`, `created_at`) SELECT `id`, `login`, `pass_hash`, `google_id`, `username`, `created_at` FROM `users`;
-- Drop "users" table after copying rows
DROP TABLE `users`;
-- Rename temporary table "new_users" to "users"
ALTER TABLE `new_users` RENAME TO `users`;
-- Create index "users_login" to table: "users"
CREATE UNIQUE INDEX `users_login` ON `users` (`login`);
-- Create index "users_google_id" to table: "users"
CREATE UNIQUE INDEX `users_google_id` ON `users` (`google_id`);
-- Create index "idx_users_login" to table: "users"
CREATE INDEX `idx_users_login` ON `users` (`login`);
-- Create index "idx_users_google_id" to table: "users"
CREATE INDEX `idx_users_google_id` ON `users` (`google_id`);
-- Enable back the enforcement of foreign-keys constraints
PRAGMA foreign_keys = on;
