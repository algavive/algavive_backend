PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE,
  pass_hash TEXT,
  google_id TEXT UNIQUE,
  username TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  admin INTEGER DEFAULT 0, 
  avatarUrl TEXT,
  userIcon TEXT,
  userTitle TEXT
);
CREATE TABLE users_api_limits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  /*api лимиты, действия за день, минуту*/
  api_limit_change_username_per_day INTEGER NOT NULL DEFAULT 1, /*то есть 1 раз в день можно менять юзернейм*/
  api_limit_create_comments_per_minute INTEGER NOT NULL DEFAULT 3,
  api_limit_create_projects_per_minute INTEGER NOT NULL DEFAULT 1,

  api_limit_username_exempt INTEGER DEFAULT 0,
  api_limit_comments_exempt INTEGER DEFAULT 0,
  api_limit_projects_exempt INTEGER DEFAULT 0,

  PRIMARY KEY (user_id)
);
CREATE TABLE users_api_limits_use (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action INTEGER NOT NULL /*0 - username, 1 - create comments, 2 - create projects*/
);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  imageUrl TEXT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  is_trends INTEGER NULL, /*0 или NULL - false(остается без трендов, для is_entertaiment они не могут в is_trend, занимать что-то выше нуля), 1 - тренды*/
  is_entertaiment INTEGER NULL, /*публикация в центр развлечений и при публикации сам по умолчанию*/
  is_published INTEGER NOT NULL /*0 - не опубликован, 1 - опубликован(с параметрами is_trend и is_entertaiment)*/
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_reply INTEGER NOT NULL, /*0-false , выше 1 - true*/
  reply_id INTEGER /*Зависит от условия и reply_id, но если reply_id = false, то игнорирует его, если true, то цепляется за айди комментария*/
);
CREATE TABLE likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projects_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, projects_id)
);
CREATE TABLE views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projects_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, projects_id)
);
CREATE TABLE admin_log( /*Очищаться будет каждый день, будет только касаться всего, кроме perm_publish_entertaiment*/
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  content TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE admin_ban(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id_who_baned INTEGER NOT NULL,
  duration TIMESTAMP
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_limits_use_user_action_created ON users_api_limits_use(user_id, action, created_at);
CREATE INDEX idx_users_login ON users(login);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_projects_title ON projects(title);
CREATE INDEX idx_users_username ON users(username);
