-- 017: server-side consent records (COPPA) + reconcile cohort/assignment FK drift.

-- Auditable, deletable parental-consent record. Previously "consent" lived only in
-- the child's browser localStorage (not verifiable, not server-side, not deletable).
-- ON DELETE CASCADE so an account deletion (right-to-erasure) purges it too.
CREATE TABLE IF NOT EXISTS consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id      UUID,
    segment         VARCHAR(32),
    method          VARCHAR(64) NOT NULL,
    consenter_email VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id);

-- Finding #26: cohorts.teacher_id / assignments.teacher_id had inconsistent ON DELETE
-- semantics between migration 001 (no clause) and 012 (CASCADE) depending on which
-- created the table first. Converge every environment on ON DELETE CASCADE so deleting
-- a teacher deterministically removes their cohorts/assignments (matching 012's intent).
ALTER TABLE cohorts DROP CONSTRAINT IF EXISTS cohorts_teacher_id_fkey;
ALTER TABLE cohorts ADD CONSTRAINT cohorts_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_teacher_id_fkey;
ALTER TABLE assignments ADD CONSTRAINT assignments_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;

-- Net-new (audit critic): xapi_statements had no owner column, so GET /v1/xapi/statements
-- returned EVERY user's statements to any authenticated learner (cross-tenant PII leak).
-- Tag each statement with the authenticated poster so reads can be scoped to the caller.
ALTER TABLE xapi_statements ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_xapi_user ON xapi_statements(user_id, stored_at DESC);
