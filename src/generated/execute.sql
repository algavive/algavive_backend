-- Add column "salt" to table: "users"
ALTER TABLE `users` ADD COLUMN `salt` text NULL;

CREATE TABLE `trends` (
  `project_id` integer NULL,
  `is_day` integer NULL DEFAULT 0,
  `is_week` integer NULL DEFAULT 0,
  `is_month` integer NULL DEFAULT 0,
  `updated_day` text NULL,
  `updated_week` text NULL,
  `updated_month` text NULL,
  PRIMARY KEY (`project_id`),
  CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE
);
