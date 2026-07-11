-- Migration 015: product-analytics events (custom, in-house monitoring).
-- Append-only behavioral events powering the admin monitoring panel: page views,
-- clicks (viewport-normalized coords for heatmaps), route dwell time, task
-- start/complete/abandon (engagement + drop-off), and session boundaries.
--
-- PRIVACY: minors are EXCLUDED. The client never emits for the kid/toddler segment,
-- and the ingest handler drops those events server-side as a backstop, so this table
-- holds adult-learner behavior only. No free text, keystrokes, or PII is stored —
-- only coordinates, short element labels, routes, and timings.

CREATE TABLE IF NOT EXISTS analytics_events (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    segment     TEXT,
    event_type  TEXT NOT NULL,   -- page_view | click | dwell | task_start | task_complete | task_abandon | session_start | session_end
    route       TEXT,
    element     TEXT,            -- short label of the clicked element (no free text / PII)
    x           REAL,            -- normalized 0..1 click x (viewport-relative)
    y           REAL,            -- normalized 0..1 click y (viewport-relative)
    vw          INT,             -- viewport width  (px)
    vh          INT,             -- viewport height (px)
    duration_ms INT,             -- dwell / task / session duration
    meta        JSONB,           -- extra context: { task, lessonId, from, ... }
    client_ts   TIMESTAMPTZ,     -- event time on the client
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()  -- server receipt time
);

CREATE INDEX IF NOT EXISTS idx_analytics_type_time ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_route     ON analytics_events (route);
CREATE INDEX IF NOT EXISTS idx_analytics_session   ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created   ON analytics_events (created_at DESC);
