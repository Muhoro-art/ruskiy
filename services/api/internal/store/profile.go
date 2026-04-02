package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/model"
)

type ProfileStore struct {
	db *pgxpool.Pool
}

func NewProfileStore(db *pgxpool.Pool) *ProfileStore {
	return &ProfileStore{db: db}
}

func (s *ProfileStore) Create(ctx context.Context, p *model.LearnerProfile) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO learner_profiles (id, user_id, display_name, segment, native_language,
		    domain, current_level, target_level, target_date, weekly_hours, created_at, onboarding_data)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, p.ID, p.UserID, p.DisplayName, p.Segment, p.NativeLanguage,
		p.Domain, p.CurrentLevel, p.TargetLevel, p.TargetDate,
		p.WeeklyHours, p.CreatedAt, p.OnboardingData)
	return err
}

func (s *ProfileStore) GetByID(ctx context.Context, id uuid.UUID) (*model.LearnerProfile, error) {
	p := &model.LearnerProfile{}
	err := s.db.QueryRow(ctx, `
		SELECT id, user_id, display_name, segment, native_language, domain,
		       current_level, target_level, target_date, weekly_hours, created_at, onboarding_data
		FROM learner_profiles WHERE id = $1
	`, id).Scan(
		&p.ID, &p.UserID, &p.DisplayName, &p.Segment, &p.NativeLanguage,
		&p.Domain, &p.CurrentLevel, &p.TargetLevel, &p.TargetDate,
		&p.WeeklyHours, &p.CreatedAt, &p.OnboardingData,
	)
	if err != nil {
		return nil, err
	}
	return p, nil
}

func (s *ProfileStore) ListByUserID(ctx context.Context, userID uuid.UUID) ([]*model.LearnerProfile, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, user_id, display_name, segment, native_language, domain,
		       current_level, target_level, target_date, weekly_hours, created_at, onboarding_data
		FROM learner_profiles WHERE user_id = $1 ORDER BY created_at
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []*model.LearnerProfile
	for rows.Next() {
		p := &model.LearnerProfile{}
		err := rows.Scan(
			&p.ID, &p.UserID, &p.DisplayName, &p.Segment, &p.NativeLanguage,
			&p.Domain, &p.CurrentLevel, &p.TargetLevel, &p.TargetDate,
			&p.WeeklyHours, &p.CreatedAt, &p.OnboardingData,
		)
		if err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

// UpdateLevel updates a learner's current CEFR level after placement assessment.
func (s *ProfileStore) UpdateLevel(ctx context.Context, learnerID uuid.UUID, level string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_profiles SET current_level = $2 WHERE id = $1
	`, learnerID, level)
	return err
}

// UpdateOnboardingData stores the onboarding/placement data for a learner.
func (s *ProfileStore) UpdateOnboardingData(ctx context.Context, learnerID uuid.UUID, data []byte) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_profiles SET onboarding_data = $2 WHERE id = $1
	`, learnerID, data)
	return err
}
