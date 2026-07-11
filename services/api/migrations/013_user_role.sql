-- Migration 013: give users a real role so the role claim in JWTs reflects the
-- user record instead of being hardcoded to 'learner'. Teachers are users with
-- role = 'teacher', which makes the role-gated teacher endpoints reachable.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'learner';
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
