-- Migration 012:
--  (a) Reconcile learner_streaks with the application (fixes the 001/004 schema
--      drift the audit flagged — code queries last_active/total_sessions/
--      current_level, but 001 created last_activity/level and 004 was skipped by
--      IF NOT EXISTS). Without this, every streak/XP/leveling query fails.
--  (b) Real teacher tables: cohorts, cohort_members, assignments.

-- (a) learner_streaks column reconciliation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='learner_streaks' AND column_name='last_activity') THEN
    ALTER TABLE learner_streaks RENAME COLUMN last_activity TO last_active;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='learner_streaks' AND column_name='level') THEN
    ALTER TABLE learner_streaks RENAME COLUMN level TO current_level;
  END IF;
END $$;

ALTER TABLE learner_streaks ADD COLUMN IF NOT EXISTS last_active DATE;
ALTER TABLE learner_streaks ADD COLUMN IF NOT EXISTS total_sessions INT NOT NULL DEFAULT 0;
ALTER TABLE learner_streaks ADD COLUMN IF NOT EXISTS total_xp INT NOT NULL DEFAULT 0;
ALTER TABLE learner_streaks ADD COLUMN IF NOT EXISTS current_level INT NOT NULL DEFAULT 1;

-- (b) Teacher tables
CREATE TABLE IF NOT EXISTS cohorts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cohorts_teacher ON cohorts(teacher_id);

CREATE TABLE IF NOT EXISTS cohort_members (
    cohort_id  UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    learner_id UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cohort_id, learner_id)
);

CREATE TABLE IF NOT EXISTS assignments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_id     UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    teacher_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    target_skills TEXT[] NOT NULL DEFAULT '{}',
    min_exercises INT NOT NULL DEFAULT 10,
    deadline      TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignments_cohort ON assignments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);
