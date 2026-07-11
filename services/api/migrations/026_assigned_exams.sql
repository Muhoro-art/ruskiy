-- Dean/teacher-assigned exams. A scheduled assessment given to a cohort: a CEFR
-- LEVEL (which doubles as the difficulty, A1..C2), a title, a due date and a pass
-- mark, plus one result per student. The exam CONTENT is the existing client-side
-- level exam (curriculum data.generated.ts) — this only records the assignment and
-- the outcomes, so a dean can score teachers on their students' exam results.

CREATE TABLE IF NOT EXISTS assigned_exams (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_id      UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    level          VARCHAR(4) NOT NULL,               -- CEFR level (A1..C2) = difficulty
    title          TEXT NOT NULL,
    pass_threshold REAL NOT NULL DEFAULT 0.66,
    due_at         TIMESTAMPTZ,
    created_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assigned_exams_cohort ON assigned_exams(cohort_id);

-- One result per student per exam (single attempt: the first recorded result wins).
CREATE TABLE IF NOT EXISTS assigned_exam_results (
    assigned_exam_id UUID NOT NULL REFERENCES assigned_exams(id) ON DELETE CASCADE,
    learner_id       UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    correct          INT NOT NULL,
    total            INT NOT NULL,
    passed           BOOLEAN NOT NULL,
    completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assigned_exam_id, learner_id)
);
