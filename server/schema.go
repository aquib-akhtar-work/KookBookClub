package main

import (
	"database/sql"
)

func initSchema(db *sql.DB) error {
	schema := `
CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL DEFAULT '',
	username TEXT NOT NULL DEFAULT '',
	display_name TEXT NOT NULL DEFAULT '',
	password_hash TEXT NOT NULL DEFAULT '',
	email_verified_at TEXT NOT NULL DEFAULT '',
	handle TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clubs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	created_by_user_id INTEGER NOT NULL REFERENCES users(id),
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_members (
	club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role TEXT NOT NULL DEFAULT 'member',
	joined_at TEXT NOT NULL,
	PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS club_bans (
	club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	banned_by_user_id INTEGER NOT NULL REFERENCES users(id),
	banned_at TEXT NOT NULL,
	PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
	code TEXT NOT NULL UNIQUE,
	created_by_user_id INTEGER NOT NULL REFERENCES users(id),
	expires_at TEXT NOT NULL,
	max_uses INTEGER NOT NULL DEFAULT 25,
	used_count INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	address TEXT NOT NULL,
	scheduled_at TEXT NOT NULL,
	cookbook TEXT NOT NULL,
	cookbook_key TEXT NOT NULL DEFAULT '',
	cookbook_author TEXT NOT NULL DEFAULT '',
	cookbook_cover_url TEXT NOT NULL DEFAULT '',
	cookbook_first_publish_year INTEGER NOT NULL DEFAULT 0,
	created_by_user_id INTEGER NOT NULL REFERENCES users(id),
	ended_at TEXT NOT NULL DEFAULT '',
	ended_by_user_id INTEGER NOT NULL DEFAULT 0,
	host_user_id INTEGER NOT NULL REFERENCES users(id),
	notes TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id),
	title TEXT NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	source_url TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_posts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id),
	media_type TEXT NOT NULL,
	file_path TEXT NOT NULL DEFAULT '',
	media_url TEXT NOT NULL DEFAULT '',
	caption TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	creator_user_id INTEGER NOT NULL REFERENCES users(id),
	question TEXT NOT NULL,
	closes_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_options (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
	option_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
	option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	UNIQUE (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS meeting_feedback (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	rating INTEGER NOT NULL,
	comment TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	UNIQUE (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	consumed_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	consumed_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_change_codes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code_hash TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	consumed_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cookbook_search_cache (
	cache_key TEXT PRIMARY KEY,
	search_query TEXT NOT NULL,
	response_json TEXT NOT NULL,
	fetched_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_user ON club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_club_bans_user ON club_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_club_bans_club ON club_bans(club_id);
CREATE INDEX IF NOT EXISTS idx_meetings_club ON meetings(club_id);
CREATE INDEX IF NOT EXISTS idx_recipes_meeting ON recipes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_media_meeting ON media_posts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_polls_meeting ON polls(meeting_id);
CREATE INDEX IF NOT EXISTS idx_feedback_meeting ON meeting_feedback(meeting_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expiry ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_user ON password_change_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_hash ON password_change_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_expiry ON password_change_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_cookbook_cache_expires ON cookbook_search_cache(expires_at);
`
	_, err := db.Exec(schema)
	return err
}

func migrateSchema(db *sql.DB) error {
	if err := ensureColumn(db, "users", "email", "email TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "users", "username", "username TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "users", "password_hash", "password_hash TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "users", "email_verified_at", "email_verified_at TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "users", "handle", "handle TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "cookbook_key", "cookbook_key TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "cookbook_author", "cookbook_author TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "cookbook_cover_url", "cookbook_cover_url TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "cookbook_first_publish_year", "cookbook_first_publish_year INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "created_by_user_id", "created_by_user_id INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "ended_at", "ended_at TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "meetings", "ended_by_user_id", "ended_by_user_id INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS cookbook_search_cache (
	cache_key TEXT PRIMARY KEY,
	search_query TEXT NOT NULL,
	response_json TEXT NOT NULL,
	fetched_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);`); err != nil {
		return err
	}
	if err := ensureColumn(db, "cookbook_search_cache", "search_query", "search_query TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}

	// Backfill username/handle for legacy records created before account auth.
	if _, err := db.Exec(`UPDATE users SET username = lower(handle) WHERE username = '' AND handle <> ''`); err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE users SET handle = username WHERE handle = '' AND username <> ''`); err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE meetings SET created_by_user_id = host_user_id WHERE created_by_user_id = 0`); err != nil {
		return err
	}

	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS auth_sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS club_bans (
	club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	banned_by_user_id INTEGER NOT NULL REFERENCES users(id),
	banned_at TEXT NOT NULL,
	PRIMARY KEY (club_id, user_id)
);
CREATE TABLE IF NOT EXISTS email_verification_tokens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	consumed_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	consumed_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_change_codes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	code_hash TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	consumed_at TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cookbook_search_cache (
	cache_key TEXT PRIMARY KEY,
	search_query TEXT NOT NULL,
	response_json TEXT NOT NULL,
	fetched_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE) WHERE email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username COLLATE NOCASE) WHERE username <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle_unique ON users(handle COLLATE NOCASE) WHERE handle <> '';
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_club_bans_user ON club_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_club_bans_club ON club_bans(club_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expiry ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_user ON password_change_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_hash ON password_change_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_password_change_codes_expiry ON password_change_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_cookbook_cache_expires ON cookbook_search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_meetings_creator ON meetings(created_by_user_id);
`)
	return err
}
