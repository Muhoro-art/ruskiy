-- 025: per-question answer log for curriculum-Path work.
-- Until now Path lessons only aggregated (bestScore/attempts/seen ids in the
-- progress blob) — teachers couldn't see WHAT a student answered. The client
-- now posts each answered Path question here, so practice-assignment answer
-- sheets can show Path Q&A exactly like adaptive-mode answers.
CREATE TABLE IF NOT EXISTS path_answers (
    id             BIGSERIAL PRIMARY KEY,
    learner_id     UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    question_id    TEXT NOT NULL,
    lesson_id      TEXT NOT NULL,
    prompt         TEXT NOT NULL DEFAULT '',
    response       TEXT NOT NULL DEFAULT '',
    correct_answer TEXT NOT NULL DEFAULT '',
    is_correct     BOOLEAN NOT NULL,
    answered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_path_answers_learner ON path_answers(learner_id, answered_at);
