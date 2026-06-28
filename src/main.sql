CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NULL,
  pass_hash TEXT NULL,
  google_id TEXT UNIQUE NULL,
  username TEXT,
  created_at TEXT NOT NULL,
  meta TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);