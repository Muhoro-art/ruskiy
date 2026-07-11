-- 023: count curriculum-Path question work toward practice assignments.
-- The Path stores progress as an undated blob, so per-question timing is lost;
-- this log captures HOW MANY new questions a learner has answered at each
-- sync (delta of the blob's seenQuestionIds totals), timestamped at sync time.
-- Practice-skills assignments then complete when adaptive exercises + Path
-- questions since the assignment's creation reach min_exercises.
ALTER TABLE learner_streaks ADD COLUMN IF NOT EXISTS curriculum_seen_total INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS curriculum_practice_log (
    id             BIGSERIAL PRIMARY KEY,
    learner_id     UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    answered_count INT NOT NULL CHECK (answered_count > 0),
    logged_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cur_practice_learner ON curriculum_practice_log(learner_id, logged_at);
