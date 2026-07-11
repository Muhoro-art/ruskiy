-- 022: first-attempt results on assignment completions.
-- Teacher assignments are ONE attempt: the first completed run is recorded with
-- per-step outcomes (correct / incorrect / timeout) and a score, and that row
-- never changes afterwards (completion insert is ON CONFLICT DO NOTHING).
ALTER TABLE assignment_completions
  ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score_correct INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_total INT NOT NULL DEFAULT 0;
