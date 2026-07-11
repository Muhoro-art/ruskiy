-- Durable store for email-verification links. A link lives in the user's inbox for
-- hours, so this is in Postgres (survives a Redis restart) rather than Redis. Only the
-- SHA-256 of the token is stored, so a DB leak doesn't hand out working verify links.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,          -- the address being confirmed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evt_user ON email_verification_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_evt_expires ON email_verification_tokens (expires_at);
