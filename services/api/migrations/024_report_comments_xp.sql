-- 024: teacher commentary on period reports + XP wiring for assignments.
-- report_comments: a teacher's note on ONE student for ONE reporting period
-- (day/week/month — whatever range the report was viewed over). Append-only:
-- multiple notes per period are allowed and shown chronologically.
CREATE TABLE IF NOT EXISTS report_comments (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id    UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    learner_id   UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    teacher_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    comment      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_comments_lookup
    ON report_comments(cohort_id, period_start, period_end);
