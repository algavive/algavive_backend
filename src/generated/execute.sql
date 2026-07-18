-- Add column "publish_at" to table: "projects"
ALTER TABLE `projects` ADD COLUMN `publish_at` timestamp NULL;

-- мой execute
UPDATE `projects` 
SET `created_at` = `publish_at` 
WHERE `publish_at` IS NOT NULL;

-- Create "notifications" table
CREATE TABLE `notifications` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `type` text NOT NULL,
  `content` text NULL,
  `user_id` integer NULL,
  `created_at` timestamp NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "reward_giver" table
CREATE TABLE `reward_giver` (
  `id` integer NULL PRIMARY KEY AUTOINCREMENT,
  `user_id` integer NULL,
  `project_id` integer NULL,
  `created_at` timestamp NULL DEFAULT (CURRENT_TIMESTAMP),
  CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT `1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
