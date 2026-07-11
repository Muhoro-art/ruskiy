-- Registration hardening: case-insensitive unique email, a required + globally-unique
-- account display name, and an email-verified flag (the verification flow is gated in
-- application code / a follow-up).

-- Case-insensitive unique email. The email column already carries a case-SENSITIVE
-- UNIQUE constraint; this functional index additionally prevents Foo@x.com and
-- foo@x.com from both existing. (If any pre-existing rows already collide
-- case-insensitively, dedupe them before applying — index creation will error otherwise.)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));

-- Account display name: collected at signup, globally unique (case-insensitive). The
-- partial index (WHERE NOT NULL) lets legacy rows that predate this column coexist.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(60);
CREATE UNIQUE INDEX IF NOT EXISTS users_display_name_lower_uidx
  ON users (lower(display_name)) WHERE display_name IS NOT NULL;

-- Email verification. Existing accounts are grandfathered as verified so this can't
-- lock anyone out; new signups start unverified and must confirm their email.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified = TRUE, email_verified_at = now() WHERE email_verified = FALSE;
