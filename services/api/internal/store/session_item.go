package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/model"
)

// CreateSessionWithItems atomically creates a session and its items in a single
// database transaction. If any insert fails, the entire operation is rolled back.
// (A3 audit fix — session item insertion is now atomic)
func (s *SessionStore) CreateSessionWithItems(ctx context.Context, session *model.Session, items []model.SessionItem) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Insert session
	_, err = tx.Exec(ctx, `
		INSERT INTO sessions (id, learner_id, status, current_index, total_xp,
		    started_at, accuracy_rate)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, session.ID, session.LearnerID, session.Status, session.CurrentIndex,
		session.TotalXP, session.StartedAt, session.AccuracyRate)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}

	// Insert all items within the same transaction
	for i, item := range items {
		_, err = tx.Exec(ctx, `
			INSERT INTO session_items (id, session_id, position, content_id, skill_id, role, completed)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, item.ID, item.SessionID, item.Position, item.ContentID, item.SkillID, item.Role, item.Completed)
		if err != nil {
			return fmt.Errorf("insert session item %d: %w", i, err)
		}
	}

	return tx.Commit(ctx)
}

// CreateSessionItems inserts a batch of session items within a transaction.
// (A3 audit fix — atomic batch insert)
func (s *SessionStore) CreateSessionItems(ctx context.Context, items []model.SessionItem) error {
	if len(items) == 0 {
		return nil
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	for i, item := range items {
		_, err := tx.Exec(ctx, `
			INSERT INTO session_items (id, session_id, position, content_id, skill_id, role, completed)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, item.ID, item.SessionID, item.Position, item.ContentID, item.SkillID, item.Role, item.Completed)
		if err != nil {
			return fmt.Errorf("insert session item %d: %w", i, err)
		}
	}

	return tx.Commit(ctx)
}

// GetSessionItems returns ordered items for a session.
func (s *SessionStore) GetSessionItems(ctx context.Context, sessionID uuid.UUID) ([]model.SessionItem, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, session_id, position, content_id, skill_id, role, completed
		FROM session_items
		WHERE session_id = $1
		ORDER BY position ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.SessionItem
	for rows.Next() {
		var item model.SessionItem
		if err := rows.Scan(&item.ID, &item.SessionID, &item.Position, &item.ContentID, &item.SkillID, &item.Role, &item.Completed); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

// MarkItemCompleted marks a session item as completed.
func (s *SessionStore) MarkItemCompleted(ctx context.Context, itemID uuid.UUID) error {
	_, err := s.db.Exec(ctx, `
		UPDATE session_items SET completed = true WHERE id = $1
	`, itemID)
	return err
}

// UpdateSessionState updates session progress counters.
func (s *SessionStore) UpdateSessionState(ctx context.Context, sessionID uuid.UUID, currentIndex int, totalXP int, accuracyRate float64) error {
	_, err := s.db.Exec(ctx, `
		UPDATE sessions SET current_index = $2, total_xp = $3, accuracy_rate = $4
		WHERE id = $1
	`, sessionID, currentIndex, totalXP, accuracyRate)
	return err
}

// CompleteSession marks a session as completed.
func (s *SessionStore) CompleteSession(ctx context.Context, sessionID uuid.UUID, totalXP int, accuracyRate float64, durationSec int) error {
	_, err := s.db.Exec(ctx, `
		UPDATE sessions SET status = 'completed', completed_at = NOW(),
		       total_xp = $2, accuracy_rate = $3, duration = $4
		WHERE id = $1
	`, sessionID, totalXP, accuracyRate, durationSec)
	return err
}

// ListByLearner returns recent sessions for a learner.
func (s *SessionStore) ListByLearner(ctx context.Context, learnerID uuid.UUID, limit int) ([]model.Session, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, learner_id, status, current_index, total_xp,
		       started_at, completed_at, duration, accuracy_rate
		FROM sessions
		WHERE learner_id = $1
		ORDER BY started_at DESC
		LIMIT $2
	`, learnerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []model.Session
	for rows.Next() {
		var s model.Session
		if err := rows.Scan(&s.ID, &s.LearnerID, &s.Status, &s.CurrentIndex,
			&s.TotalXP, &s.StartedAt, &s.CompletedAt, &s.Duration, &s.AccuracyRate); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}
