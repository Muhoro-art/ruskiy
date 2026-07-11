-- 020 — Студия Phase A: teacher-authored content with a moderation pipeline.
-- (Design: docs/teacher-authoring-spec.md.)
--
-- teacher_content holds each authored item. content_data is Question-shaped
-- JSONB reusing the existing exercise engine; exercise_type 'composite' chains
-- an ordered list of typed steps (the "unlimited combinations" builder).
-- Status flow: draft → submitted → approved | rejected. Draft/rejected items are
-- still assignable to the author's OWN cohorts — the author is the authority for
-- their class; moderation gates only the GLOBAL pool.

CREATE TABLE IF NOT EXISTS teacher_content (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         VARCHAR(200) NOT NULL,
    exercise_type VARCHAR(32)  NOT NULL,
    content_data  JSONB        NOT NULL,
    cefr_level    cefr_level   NOT NULL DEFAULT 'A1',
    topic         VARCHAR(100) NOT NULL DEFAULT '',
    target_skills TEXT[]       NOT NULL DEFAULT '{}',
    status        VARCHAR(24)  NOT NULL DEFAULT 'draft', -- draft | submitted | approved | rejected
    submitted_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_content_author ON teacher_content(author_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_content_status ON teacher_content(status) WHERE status = 'submitted';

-- Moderation queue + audit trail (admin UI lands in Phase C; rows accrue now so
-- nothing submitted before then is lost).
CREATE TABLE IF NOT EXISTS content_reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id  UUID NOT NULL REFERENCES teacher_content(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES users(id),
    verdict     VARCHAR(16),          -- NULL = pending | approved | rejected
    feedback    TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_content_reviews_pending ON content_reviews(content_id) WHERE verdict IS NULL;

-- Attach authored items to assignments (delivery lands in Phase B).
CREATE TABLE IF NOT EXISTS assignment_content (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    content_id    UUID NOT NULL REFERENCES teacher_content(id) ON DELETE CASCADE,
    PRIMARY KEY (assignment_id, content_id)
);
