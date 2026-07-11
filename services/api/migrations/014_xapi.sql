-- Migration 014: a minimal Learning Record Store (LRS) for xAPI statements.
CREATE TABLE IF NOT EXISTS xapi_statements (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor     JSONB NOT NULL,
    verb      JSONB NOT NULL,
    object    JSONB NOT NULL,
    raw       JSONB NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xapi_stored ON xapi_statements(stored_at DESC);
