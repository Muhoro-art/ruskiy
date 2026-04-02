package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LearnerStats holds the streak and progress data for a learner.
type LearnerStats struct {
	LearnerID     uuid.UUID `json:"learnerId"`
	CurrentStreak int       `json:"currentStreak"`
	LongestStreak int       `json:"longestStreak"`
	LastActive    *string   `json:"lastActive"` // date string YYYY-MM-DD
	TotalSessions int      `json:"totalSessions"`
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
		// Return zero stats for new learners
		return &LearnerStats{LearnerID: learnerID, CurrentLevel: 1}, nil
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

// UpdateLevel sets the current level for a learner.
func (s *StreakStore) UpdateLevel(ctx context.Context, learnerID uuid.UUID, level int) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_streaks SET current_level = $2 WHERE learner_id = $1
	`, learnerID, level)
	return err
}
