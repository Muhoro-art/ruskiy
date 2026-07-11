-- Teacher/dean activity log. Records the actions staff take (created an assignment,
-- an exam, a cohort, a course/content, sent an invite, enrolled a student…) so a
-- dean can see, per teacher, who is proactive vs passive. Fire-and-forget: writes
-- here never block the underlying action.

CREATE TABLE IF NOT EXISTS activity_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,          -- who did it
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,            -- tenant (null = independent)
    action         VARCHAR(40) NOT NULL,  -- assignment_created | exam_assigned | cohort_created | content_created | staff_invited | student_enrolled | ...
    detail         TEXT,                  -- short human label (title / name)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_institution ON activity_log(institution_id, created_at DESC);
