-- 021 — Assignment completion tracking + per-question timers.
--
-- (1) assignment_completions: a learner finishing an assignment's materials
--     marks it done — the student sees "Done", and the teacher's classroom view
--     shows who completed what and when.
-- (2) assignments.time_per_question_sec: teacher-set countdown per question
--     (0 = no timer). Enforced by the shared ContentPlayer on delivery.

CREATE TABLE IF NOT EXISTS assignment_completions (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    learner_id    UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assignment_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_completions_learner ON assignment_completions(learner_id, completed_at DESC);

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS time_per_question_sec INT NOT NULL DEFAULT 0;
