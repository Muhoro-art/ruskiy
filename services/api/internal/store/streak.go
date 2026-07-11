package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LearnerStats holds the streak and progress data for a learner.
type LearnerStats struct {
	LearnerID     uuid.UUID `json:"learnerId"`
	CurrentStreak int       `json:"currentStreak"`
	LongestStreak int       `json:"longestStreak"`
	LastActive    *string   `json:"lastActive"` // date string YYYY-MM-DD
	TotalSessions int       `json:"totalSessions"`
	TotalXP       int       `json:"totalXp"`
	CurrentLevel  int       `json:"currentLevel"`
}

type StreakStore struct {
	db *pgxpool.Pool
}

func NewStreakStore(db *pgxpool.Pool) *StreakStore {
	return &StreakStore{db: db}
}

// Get returns the learner's streak/stats. Returns zeroed stats if not found.
func (s *StreakStore) Get(ctx context.Context, learnerID uuid.UUID) (*LearnerStats, error) {
	stats := &LearnerStats{LearnerID: learnerID}
	var lastActive *time.Time
	err := s.db.QueryRow(ctx, `
		SELECT current_streak, longest_streak, last_active, total_sessions, total_xp, current_level
		FROM learner_streaks WHERE learner_id = $1
	`, learnerID).Scan(
		&stats.CurrentStreak, &stats.LongestStreak, &lastActive,
		&stats.TotalSessions, &stats.TotalXP, &stats.CurrentLevel,
	)
	if err != nil {
		// Only "no row" means a genuinely new learner → zeroed stats. A real error
		// (pool exhaustion, timeout, reset) MUST propagate, not be swallowed as
		// TotalXP=0 — otherwise Complete() would regress a high-level learner to
		// level 1 (LevelFromXP(0)) on a transient blip.
		if errors.Is(err, pgx.ErrNoRows) {
			return &LearnerStats{LearnerID: learnerID, CurrentLevel: 1}, nil
		}
		return nil, err
	}
	if lastActive != nil {
		d := lastActive.Format("2006-01-02")
		stats.LastActive = &d
	}
	return stats, nil
}

// RecordActivity updates streak after a completed session.
func (s *StreakStore) RecordActivity(ctx context.Context, learnerID uuid.UUID, xpEarned int) error {
	today := time.Now().Format("2006-01-02")

	_, err := s.db.Exec(ctx, `
		INSERT INTO learner_streaks (learner_id, current_streak, longest_streak, last_active, total_sessions, total_xp, current_level)
		VALUES ($1, 1, 1, $2::date, 1, $3, 1)
		ON CONFLICT (learner_id) DO UPDATE SET
			current_streak = CASE
				WHEN learner_streaks.last_active = ($2::date - INTERVAL '1 day')::date THEN learner_streaks.current_streak + 1
				WHEN learner_streaks.last_active = $2::date THEN learner_streaks.current_streak
				ELSE 1
			END,
			longest_streak = GREATEST(
				learner_streaks.longest_streak,
				CASE
					WHEN learner_streaks.last_active = ($2::date - INTERVAL '1 day')::date THEN learner_streaks.current_streak + 1
					ELSE 1
				END
			),
			last_active = $2::date,
			total_sessions = learner_streaks.total_sessions + 1,
			total_xp = learner_streaks.total_xp + $3
	`, learnerID, today, xpEarned)
	return err
}

// RecordCurriculumProgress bridges Path progress into the teacher-visible streak
// row. It stamps today's activity (so the learner counts as "active" and their
// streak advances) and stores EARNED curriculum mastery:
//
//	engaged = lessons+exams the learner actually attempted (attempts > 0)
//	mastery = avg bestScore across those engaged items (0..1)
//
// Placement ("tested out") entries have attempts=0 and are deliberately excluded —
// placement is a level, not earned mastery, so a placed-but-idle student reads as
// "Not started" rather than 100%.
//
// engaged == 0 stamps activity only (they synced — e.g. just placed — but haven't
// worked anything), leaving stored mastery untouched so a fresh device's empty
// push can't clobber cross-device earned progress.
//
// Unlike RecordActivity it is IDEMPOTENT for XP/sessions — it SETS the curriculum
// fields and does NOT increment total_sessions/total_xp, so it is safe to call on
// every progress push (which can fire many times a session).
func (s *StreakStore) RecordCurriculumProgress(ctx context.Context, learnerID uuid.UUID, mastery float64, engaged int) error {
	if mastery < 0 {
		mastery = 0
	} else if mastery > 1 {
		mastery = 1
	}
	today := time.Now().Format("2006-01-02")
	if engaged <= 0 {
		_, err := s.db.Exec(ctx, `
			INSERT INTO learner_streaks (learner_id, current_streak, longest_streak, last_active, total_sessions, total_xp, current_level, curriculum_mastery, curriculum_lessons)
			VALUES ($1, 1, 1, $2::date, 0, 0, 1, 0, 0)
			ON CONFLICT (learner_id) DO UPDATE SET
				current_streak = CASE
					WHEN learner_streaks.last_active = ($2::date - INTERVAL '1 day')::date THEN learner_streaks.current_streak + 1
					WHEN learner_streaks.last_active = $2::date THEN learner_streaks.current_streak
					ELSE 1
				END,
				longest_streak = GREATEST(
					learner_streaks.longest_streak,
					CASE WHEN learner_streaks.last_active = ($2::date - INTERVAL '1 day')::date THEN learner_streaks.current_streak + 1 ELSE 1 END
				),
				last_active = $2::date
		`, learnerID, today)
		return err
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO learner_streaks (learner_id, current_streak, longest_streak, last_active, total_sessions, total_xp, current_level, curriculum_mastery, curriculum_lessons)
		VALUES ($1, 1, 1, $2::date, 0, 0, 1, $3, $4)
		ON CONFLICT (learner_id) DO UPDATE SET
			current_streak = CASE
				WHEN learner_streaks.last_active = ($2::date - INTERVAL '1 day')::date THEN learner_streaks.current_streak + 1
				WHEN learner_streaks.last_active = $2::date THEN learner_streaks.current_streak
				ELSE 1
			END,
			longest_streak = GREATEST(
				learner_streaks.longest_streak,
				CASE WHEN learner_streaks.last_active = ($2::date - INTERVAL '1 day')::date THEN learner_streaks.current_streak + 1 ELSE 1 END
			),
			last_active        = $2::date,
			curriculum_mastery = $3,
			curriculum_lessons = $4
	`, learnerID, today, mastery, engaged)
	return err
}

// RecordCurriculumSeen tracks how many Path QUESTIONS the learner has answered
// (the blob's seenQuestionIds totals). The blob itself is undated, so the
// growth since the last sync is logged as a timestamped delta — that log is
// what lets practice-skills assignments count Path work done AFTER they were
// set. Monotonic: a stale/smaller push logs nothing and can't rewind the total.
// Call after RecordCurriculumProgress (which guarantees the streak row exists).
func (s *StreakStore) RecordCurriculumSeen(ctx context.Context, learnerID uuid.UUID, seenTotal int) error {
	if seenTotal <= 0 {
		return nil
	}
	// The self-join exposes the PRE-update value, so one statement both bumps
	// the running total and returns the delta to log — no race with a second
	// concurrent sync (the row update serializes them).
	var delta int
	err := s.db.QueryRow(ctx, `
		UPDATE learner_streaks ls SET curriculum_seen_total = $2
		FROM learner_streaks old
		WHERE old.learner_id = ls.learner_id AND ls.learner_id = $1 AND $2 > old.curriculum_seen_total
		RETURNING $2 - old.curriculum_seen_total
	`, learnerID, seenTotal).Scan(&delta)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // no growth (or no streak row yet) — nothing to log
		}
		return err
	}
	if delta <= 0 {
		return nil
	}
	if _, err = s.db.Exec(ctx,
		`INSERT INTO curriculum_practice_log (learner_id, answered_count) VALUES ($1, $2)`,
		learnerID, delta); err != nil {
		return err
	}
	// Path questions earn XP server-side (+2 each) — without this, a Path-only
	// learner shows 0 XP no matter how much they study.
	return s.AddXP(ctx, learnerID, 2*delta)
}

// AddXP adjusts the learner's lifetime XP. Negative deltas are allowed
// (wrong assignment answers cost XP) but the total never drops below zero.
// Upserts so a brand-new learner without a streak row doesn't lose the award.
func (s *StreakStore) AddXP(ctx context.Context, learnerID uuid.UUID, delta int) error {
	if delta == 0 {
		return nil
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO learner_streaks (learner_id, current_streak, longest_streak, last_active, total_sessions, total_xp, current_level, curriculum_mastery, curriculum_lessons)
		VALUES ($1, 0, 0, NULL, 0, GREATEST(0, $2), 1, 0, 0)
		ON CONFLICT (learner_id) DO UPDATE SET total_xp = GREATEST(0, learner_streaks.total_xp + $2)
	`, learnerID, delta)
	return err
}

// UpdateLevel sets the current level for a learner.
func (s *StreakStore) UpdateLevel(ctx context.Context, learnerID uuid.UUID, level int) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_streaks SET current_level = $2 WHERE learner_id = $1
	`, learnerID, level)
	return err
}
