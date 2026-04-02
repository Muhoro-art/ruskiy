-- Migration 004: Add skill_id to session_items for tracking which skill each exercise targets

ALTER TABLE session_items
    ADD COLUMN skill_id TEXT REFERENCES skills(skill_id);

-- Add learner_streaks table for streak tracking
CREATE TABLE IF NOT EXISTS learner_streaks (
    learner_id      UUID NOT NULL REFERENCES learner_profiles(id) ON DELETE CASCADE,
    current_streak  INT NOT NULL DEFAULT 0,
    longest_streak  INT NOT NULL DEFAULT 0,
    last_active     DATE,
    total_sessions  INT NOT NULL DEFAULT 0,
    total_xp        INT NOT NULL DEFAULT 0,
    current_level   INT NOT NULL DEFAULT 1,
    PRIMARY KEY (learner_id)
);
