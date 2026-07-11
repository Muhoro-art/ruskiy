-- Migration 011: server-side curriculum progress.
-- Stores each user's curriculum progress blob (lessons mastered, exam results,
-- per-topic weakness model) so it syncs across devices instead of living only in
-- the browser's localStorage.

CREATE TABLE IF NOT EXISTS curriculum_progress (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
