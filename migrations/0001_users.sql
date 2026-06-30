-- Migration number: 0001 	 2026-06-30T10:56:38.952Z

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE,
  pass_hash TEXT,
  google_id TEXT UNIQUE,
  username TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_login ON users(login);
CREATE INDEX idx_users_google_id ON users(google_id);