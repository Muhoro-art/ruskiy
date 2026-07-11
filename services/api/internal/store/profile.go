package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

// PrimaryIDByUserID returns the learner_id of the user's PRIMARY (earliest)
// profile — the same row /v1/stats and the teacher rollups key on. Used to bridge
// curriculum sync (keyed by user_id) into learner-scoped tables.
func (s *ProfileStore) PrimaryIDByUserID(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.db.QueryRow(ctx,
		`SELECT id FROM learner_profiles WHERE user_id = $1 ORDER BY created_at LIMIT 1`, userID).Scan(&id)
	return id, err
}

// UpdateLevel updates a learner's current CEFR level after placement assessment.
func (s *ProfileStore) UpdateLevel(ctx context.Context, learnerID uuid.UUID, level string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_profiles SET current_level = $2 WHERE id = $1
	`, learnerID, level)
	return err
}

// AdvanceLevelByUserID projects the learner's curriculum-derived current level
// onto their PRIMARY profile (the earliest-created one — the same row /v1/stats
// reads) so the server-side level shown on Home, the leaderboard and teacher
// reports tracks real progress instead of staying frozen at signup.
//
// It is deliberately MONOTONIC: the `$2 > current_level` guard means the level
// can only advance, never regress. The curriculum blob is stored once per user
// but the level is derived from whichever device is syncing, so a stale or racing
// push (e.g. a second device that synced before its cross-device pull resolved,
// computing a lower level from empty local progress) must not drag the learner
// backward. cefr_level is an ordered enum (A1<A2<B1<B2<C1<C2), so `>` compares by
// rank. Callers must pass a validated A1–C2 value; the ::cefr_level cast keeps the
// comparison valid regardless of how the driver types the param.
func (s *ProfileStore) AdvanceLevelByUserID(ctx context.Context, userID uuid.UUID, level string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_profiles SET current_level = $2::cefr_level
		WHERE id = (SELECT id FROM learner_profiles WHERE user_id = $1 ORDER BY created_at LIMIT 1)
		  AND $2::cefr_level > current_level
	`, userID, level)
	return err
}

// SegmentByUserID returns the segment of the user's primary (earliest) profile,
// or "" if they have none. Used by analytics ingest to drop minors' events.
func (s *ProfileStore) SegmentByUserID(ctx context.Context, userID uuid.UUID) (string, error) {
	var seg string
	err := s.db.QueryRow(ctx,
		`SELECT segment::text FROM learner_profiles WHERE user_id = $1 ORDER BY created_at LIMIT 1`, userID).Scan(&seg)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return seg, nil
}

// UpdateOnboardingData stores the onboarding/placement data for a learner.
func (s *ProfileStore) UpdateOnboardingData(ctx context.Context, learnerID uuid.UUID, data []byte) error {
	_, err := s.db.Exec(ctx, `
		UPDATE learner_profiles SET onboarding_data = $2 WHERE id = $1
	`, learnerID, data)
	return err
}

// RecordConsent persists an auditable parental-consent record (COPPA) tied to the
// user, so consent survives client-side clearing and can be produced on audit or
// erased on account deletion (ON DELETE CASCADE).
func (s *ProfileStore) RecordConsent(ctx context.Context, userID, profileID uuid.UUID, segment, method, consenterEmail string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO consents (user_id, profile_id, segment, method, consenter_email)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, profileID, segment, method, consenterEmail)
	return err
}
