-- 018 — Bridge curriculum Path progress into the teacher-visible rollups.
--
-- Curriculum "Path" lessons were only ever written to the curriculum_progress
-- JSONB blob (keyed by user_id), while every teacher dashboard reads
-- learner_skills + learner_streaks (keyed by learner_id). So a student who did
-- Path lessons showed up with 0% mastery and "last active never" on the teacher
-- side even though they'd done real work.
--
-- Rather than fabricate learner_skills rows (skill_id is FK-constrained to the
-- adaptive skill taxonomy), we carry an aggregate curriculum signal on
-- learner_streaks — the per-learner row the teacher queries already join — and
-- blend it into the mastery/active numbers with GREATEST().

ALTER TABLE learner_streaks
    ADD COLUMN IF NOT EXISTS curriculum_mastery DECIMAL(4,3) DEFAULT 0.000, -- 0..1: mastered lessons / lessons in the blob
    ADD COLUMN IF NOT EXISTS curriculum_lessons INT DEFAULT 0;             -- lessons engaged (>0 ⇒ "has work")

-- One-time backfill: surface students who did Path lessons BEFORE this bridge
-- existed. Computes mastered/total from each user's stored blob and stamps their
-- streak row. Students with an empty blob (no lessons) are skipped, so they
-- correctly stay at 0 / never-active.
WITH agg AS (
    SELECT cp.user_id,
           count(*)                                                AS total,
           count(*) FILTER (WHERE (l.value->>'mastered')::boolean) AS mastered
    FROM curriculum_progress cp
    CROSS JOIN LATERAL jsonb_each(COALESCE(cp.data::jsonb->'lessons', '{}'::jsonb)) AS l(key, value)
    GROUP BY cp.user_id
    HAVING count(*) > 0
),
resolved AS (
    SELECT (SELECT id FROM learner_profiles WHERE user_id = a.user_id ORDER BY created_at LIMIT 1) AS learner_id,
           LEAST(1.0, GREATEST(0.0, round(a.mastered::numeric / a.total, 3)))::numeric(4,3) AS mastery,
           a.total AS lessons
    FROM agg a
)
INSERT INTO learner_streaks (learner_id, current_streak, longest_streak, last_active,
                             total_sessions, total_xp, current_level, curriculum_mastery, curriculum_lessons)
SELECT learner_id, 1, 1, CURRENT_DATE, 0, 0, 1, mastery, lessons
FROM resolved
WHERE learner_id IS NOT NULL
ON CONFLICT (learner_id) DO UPDATE SET
    curriculum_mastery = EXCLUDED.curriculum_mastery,
    curriculum_lessons = EXCLUDED.curriculum_lessons,
    last_active        = GREATEST(COALESCE(learner_streaks.last_active, DATE '1970-01-01'), EXCLUDED.last_active);
