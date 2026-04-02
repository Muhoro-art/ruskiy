package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/model"
)

type SessionStore struct {
	db *pgxpool.Pool
}

func NewSessionStore(db *pgxpool.Pool) *SessionStore {
	return &SessionStore{db: db}
}

func (s *SessionStore) Create(ctx context.Context, session *model.Session) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO sessions (id, learner_id, status, current_index, total_xp,
		    started_at, accuracy_rate)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, session.ID, session.LearnerID, session.Status, session.CurrentIndex,
		session.TotalXP, session.StartedAt, session.AccuracyRate)
	return err
}

func (s *SessionStore) GetByID(ctx context.Context, id uuid.UUID) (*model.Session, error) {
	session := &model.Session{}
	err := s.db.QueryRow(ctx, `
		SELECT id, learner_id, status, current_index, total_xp,
		       started_at, completed_at, duration, accuracy_rate
		FROM sessions WHERE id = $1
	`, id).Scan(
		&session.ID, &session.LearnerID, &session.Status, &session.CurrentIndex,
		&session.TotalXP, &session.StartedAt, &session.CompletedAt,
		&session.Duration, &session.AccuracyRate,
	)
	if err != nil {
		return nil, err
	}
	return session, nil
}

func (s *SessionStore) SaveResult(ctx context.Context, result *model.ExerciseResult) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO exercise_results (id, session_id, content_id, learner_id,
		    response, correct_answer, is_correct, error_type, response_time_ms,
		    hint_level_used, pronunciation_score, xp_earned, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`, result.ID, result.SessionID, result.ContentID, result.LearnerID,
		result.Response, result.CorrectAnswer, result.IsCorrect, result.ErrorType,
		result.ResponseTimeMs, result.HintLevelUsed, result.PronunciationScore,
		result.XPEarned, result.Timestamp)
	return err
}
