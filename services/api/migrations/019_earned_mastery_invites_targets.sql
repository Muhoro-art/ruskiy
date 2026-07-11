-- 019 — Honest cohort statistics + secure cohort joining + assignment targeting.
--
-- (1) STATS SEMANTICS CHANGE. Migration 018 computed curriculum_mastery as
--     mastered/total lessons in the sync blob — but placement ("tested out")
--     marks lessons mastered with attempts=0, so a student who placed into B1
--     and never worked a lesson read as 100% mastery. New semantics:
--       curriculum_lessons = items (lessons+exams) with attempts > 0   ("engaged")
--       curriculum_mastery = avg(bestScore) over engaged items          ("earned")
--     Placement now shows only as the student's LEVEL, never as mastery. A
--     placed-but-idle student reads: level B1, 0 lessons worked, "Not started".
--
-- (2) Cohort join codes + learner-consented invites (replaces teacher force-add).
-- (3) Per-student assignment targeting (empty = whole cohort).

-- ---------------------------------------------------------------- (1) stats
-- Defensive parsing: PutProgress only enforces json.Valid, so a blob may store
-- lessons/exams as an array/scalar (jsonb_each would abort the whole file) or
-- non-numeric attempts/bestScore (raw ::numeric would abort). Guard every
-- deconstruction and cast so one malformed row can't block the release.
WITH items AS (
    SELECT cp.user_id, l.value
    FROM curriculum_progress cp
    CROSS JOIN LATERAL jsonb_each(cp.data::jsonb->'lessons') AS l(key, value)
    WHERE jsonb_typeof(cp.data::jsonb->'lessons') = 'object'
    UNION ALL
    SELECT cp.user_id, e.value
    FROM curriculum_progress cp
    CROSS JOIN LATERAL jsonb_each(cp.data::jsonb->'exams') AS e(key, value)
    WHERE jsonb_typeof(cp.data::jsonb->'exams') = 'object'
),
parsed AS (
    SELECT user_id,
           CASE WHEN jsonb_typeof(value) = 'object' AND value->>'attempts' ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (value->>'attempts')::numeric ELSE 0 END AS attempts,
           CASE WHEN jsonb_typeof(value) = 'object' AND value->>'bestScore' ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN (value->>'bestScore')::numeric ELSE 0 END AS best_score
    FROM items
),
agg AS (
    SELECT user_id,
           count(*)                              AS total_items,
           count(*) FILTER (WHERE attempts > 0)  AS engaged,
           avg(LEAST(1, GREATEST(0, best_score))) FILTER (WHERE attempts > 0) AS avgscore
    FROM parsed
    GROUP BY user_id
),
resolved AS (
    SELECT (SELECT id FROM learner_profiles WHERE user_id = a.user_id ORDER BY created_at LIMIT 1) AS learner_id,
           COALESCE(round(a.avgscore, 3), 0)::numeric(4,3) AS mastery,
           COALESCE(a.engaged, 0)                          AS engaged,
           a.total_items
    FROM agg a
)
-- INSERT branch: NULL last_active + zero streak — a learner 018 skipped may be
-- long dormant, and NULL correctly reads as "never active" in every rollup
-- (stamping CURRENT_DATE would count dead accounts as Active-7d for a week).
INSERT INTO learner_streaks (learner_id, current_streak, longest_streak, last_active,
                             total_sessions, total_xp, current_level, curriculum_mastery, curriculum_lessons)
SELECT learner_id, 0, 0, NULL, 0, 0, 1, mastery, engaged
FROM resolved
WHERE learner_id IS NOT NULL AND total_items > 0
ON CONFLICT (learner_id) DO UPDATE SET
    curriculum_mastery = EXCLUDED.curriculum_mastery,
    curriculum_lessons = EXCLUDED.curriculum_lessons;
    -- last_active intentionally untouched on UPDATE: syncing keeps it fresh.

-- ------------------------------------------------------- (2) cohort joining
-- Join code: generated on demand by the teacher, redeemed by the student
-- (entering the code IS the student's consent). Nullable until first generated.
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS join_code VARCHAR(16);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cohorts_join_code ON cohorts(join_code) WHERE join_code IS NOT NULL;

-- Invitation: teacher proposes, the STUDENT accepts or declines. Replaces the
-- old force-add (a teacher could enrol any searchable learner without consent).
CREATE TABLE IF NOT EXISTS cohort_invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_id    UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    learner_id   UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    invited_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | accepted | declined
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE (cohort_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_cohort_invites_learner_pending
    ON cohort_invites(learner_id) WHERE status = 'pending';

-- --------------------------------------------- (3) assignment targeting
-- Rows here narrow an assignment to specific cohort members; NO rows = the
-- whole cohort (back-compatible with every existing assignment).
CREATE TABLE IF NOT EXISTS assignment_targets (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    learner_id    UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (assignment_id, learner_id)
);
