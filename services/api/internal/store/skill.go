package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/model"
)

type SkillStore struct {
	db *pgxpool.Pool
}

func NewSkillStore(db *pgxpool.Pool) *SkillStore {
	return &SkillStore{db: db}
}

func (s *SkillStore) GetAll(ctx context.Context) ([]model.Skill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru, COALESCE(prerequisites, '{}')
		FROM skills
		ORDER BY category, subcategory, cefr_level
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSkillRows(rows)
}

func (s *SkillStore) GetByCategory(ctx context.Context, category string) ([]model.Skill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru, COALESCE(prerequisites, '{}')
		FROM skills
		WHERE category = $1
		ORDER BY subcategory, cefr_level
	`, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSkillRows(rows)
}

func (s *SkillStore) GetByCEFR(ctx context.Context, level string) ([]model.Skill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru, COALESCE(prerequisites, '{}')
		FROM skills
		WHERE cefr_level = $1
		ORDER BY category, subcategory
	`, level)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSkillRows(rows)
}

func (s *SkillStore) GetLearnerSkills(ctx context.Context, learnerID uuid.UUID) ([]model.LearnerSkillState, error) {
	rows, err := s.db.Query(ctx, `
		SELECT learner_id, skill_id, confidence, stability, difficulty,
		       last_reviewed, next_review_due, total_attempts, correct_streak,
		       error_count, error_types, status, reps, lapses
		FROM learner_skills
		WHERE learner_id = $1
		ORDER BY skill_id
	`, learnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanLearnerSkillRows(rows)
}

func (s *SkillStore) GetLearnerSkill(ctx context.Context, learnerID uuid.UUID, skillID string) (*model.LearnerSkillState, error) {
	ls := &model.LearnerSkillState{}
	err := s.db.QueryRow(ctx, `
		SELECT learner_id, skill_id, confidence, stability, difficulty,
		       last_reviewed, next_review_due, total_attempts, correct_streak,
		       error_count, error_types, status, reps, lapses
		FROM learner_skills
		WHERE learner_id = $1 AND skill_id = $2
	`, learnerID, skillID).Scan(
		&ls.LearnerID, &ls.SkillID, &ls.Confidence, &ls.Stability, &ls.Difficulty,
		&ls.LastReviewed, &ls.NextReviewDue, &ls.TotalAttempts, &ls.CorrectStreak,
		&ls.ErrorCount, &ls.ErrorTypes, &ls.Status, &ls.Reps, &ls.Lapses,
	)
	if err != nil {
		return nil, err
	}
	return ls, nil
}

func (s *SkillStore) UpsertLearnerSkill(ctx context.Context, learnerID uuid.UUID, state *model.LearnerSkillState) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO learner_skills (
			learner_id, skill_id, confidence, stability, difficulty,
			last_reviewed, next_review_due, total_attempts, correct_streak,
			error_count, error_types, status, reps, lapses
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		ON CONFLICT (learner_id, skill_id) DO UPDATE SET
			confidence      = EXCLUDED.confidence,
			stability       = EXCLUDED.stability,
			difficulty      = EXCLUDED.difficulty,
			last_reviewed   = EXCLUDED.last_reviewed,
			next_review_due = EXCLUDED.next_review_due,
			total_attempts  = EXCLUDED.total_attempts,
			correct_streak  = EXCLUDED.correct_streak,
			error_count     = EXCLUDED.error_count,
			error_types     = EXCLUDED.error_types,
			status          = EXCLUDED.status,
			reps            = EXCLUDED.reps,
			lapses          = EXCLUDED.lapses
	`, learnerID, state.SkillID, state.Confidence, state.Stability, state.Difficulty,
		state.LastReviewed, state.NextReviewDue, state.TotalAttempts, state.CorrectStreak,
		state.ErrorCount, state.ErrorTypes, state.Status, state.Reps, state.Lapses)
	return err
}

func (s *SkillStore) GetDueForReview(ctx context.Context, learnerID uuid.UUID, limit int) ([]model.LearnerSkillState, error) {
	rows, err := s.db.Query(ctx, `
		SELECT learner_id, skill_id, confidence, stability, difficulty,
		       last_reviewed, next_review_due, total_attempts, correct_streak,
		       error_count, error_types, status, reps, lapses
		FROM learner_skills
		WHERE learner_id = $1
		  AND next_review_due <= NOW()
		ORDER BY next_review_due ASC
		LIMIT $2
	`, learnerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanLearnerSkillRows(rows)
}

func (s *SkillStore) GetWeakest(ctx context.Context, learnerID uuid.UUID, limit int) ([]model.LearnerSkillState, error) {
	rows, err := s.db.Query(ctx, `
		SELECT learner_id, skill_id, confidence, stability, difficulty,
		       last_reviewed, next_review_due, total_attempts, correct_streak,
		       error_count, error_types, status, reps, lapses
		FROM learner_skills
		WHERE learner_id = $1
		  AND status != 'new'
		ORDER BY confidence ASC
		LIMIT $2
	`, learnerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanLearnerSkillRows(rows)
}

// cefrOrder maps CEFR levels to ordinal values for range comparisons.
var cefrOrder = map[string]int{
	"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6,
}

func (s *SkillStore) InitializeSkills(ctx context.Context, learnerID uuid.UUID, cefrLevel string) error {
	// Collect all CEFR levels at or below the target.
	threshold, ok := cefrOrder[cefrLevel]
	if !ok {
		threshold = 1
	}
	var levels []string
	for lvl, ord := range cefrOrder {
		if ord <= threshold {
			levels = append(levels, lvl)
		}
	}

	now := time.Now()
	_, err := s.db.Exec(ctx, `
		INSERT INTO learner_skills (
			learner_id, skill_id, confidence, stability, difficulty,
			last_reviewed, next_review_due, total_attempts, correct_streak,
			error_count, error_types, status, reps, lapses
		)
		SELECT $1, s.skill_id, 0.0, 0.0, 0.5,
		       NULL, $2, 0, 0,
		       0, ARRAY[]::text[], 'new', 0, 0
		FROM skills s
		WHERE s.cefr_level = ANY($3)
		ON CONFLICT (learner_id, skill_id) DO NOTHING
	`, learnerID, now, levels)
	return err
}

// scanSkillRows is a helper that scans multiple skills rows.
// GetSkillPrerequisites fetches the prerequisites for a given skill_id.
func (s *SkillStore) GetSkillPrerequisites(ctx context.Context, skillID string) ([]string, error) {
	var prereqs []string
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(prerequisites, '{}') FROM skills WHERE skill_id = $1
	`, skillID).Scan(&prereqs)
	if err != nil {
		return nil, err
	}
	return prereqs, nil
}

// GetAllSkillsWithPrereqs returns all skills with their prerequisites populated.
func (s *SkillStore) GetAllSkillsWithPrereqs(ctx context.Context) ([]model.Skill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT skill_id, category, subcategory, cefr_level, display_name_en, display_name_ru, COALESCE(prerequisites, '{}')
		FROM skills
		ORDER BY cefr_level, category, subcategory
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSkillRows(rows)
}

// GetUnlockedSkills returns skills whose prerequisites are ALL met (confidence >= threshold).
func (s *SkillStore) GetUnlockedSkills(ctx context.Context, learnerID uuid.UUID, confidenceThreshold float64) ([]model.Skill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT s.skill_id, s.category, s.subcategory, s.cefr_level, s.display_name_en, s.display_name_ru, COALESCE(s.prerequisites, '{}')
		FROM skills s
		WHERE (
			-- Skills with no prerequisites are always unlocked
			s.prerequisites IS NULL OR array_length(s.prerequisites, 1) IS NULL
			OR
			-- All prerequisites must have confidence >= threshold
			NOT EXISTS (
				SELECT 1 FROM unnest(s.prerequisites) AS prereq
				WHERE NOT EXISTS (
					SELECT 1 FROM learner_skills ls
					WHERE ls.learner_id = $1
					  AND ls.skill_id = prereq
					  AND ls.confidence >= $2
				)
			)
		)
		ORDER BY s.cefr_level, s.category, s.subcategory
	`, learnerID, confidenceThreshold)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSkillRows(rows)
}

func scanSkillRows(rows interface {
	Next() bool
	Scan(dest ...any) error
}) ([]model.Skill, error) {
	var results []model.Skill
	for rows.Next() {
		var sk model.Skill
		err := rows.Scan(
			&sk.SkillID, &sk.Category, &sk.Subcategory, &sk.CEFRLevel,
			&sk.DisplayNameEn, &sk.DisplayNameRu, &sk.Prerequisites,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, sk)
	}
	return results, nil
}

// scanLearnerSkillRows is a helper that scans multiple learner_skills rows.
func scanLearnerSkillRows(rows interface {
	Next() bool
	Scan(dest ...any) error
}) ([]model.LearnerSkillState, error) {
	var results []model.LearnerSkillState
	for rows.Next() {
		var ls model.LearnerSkillState
		err := rows.Scan(
			&ls.LearnerID, &ls.SkillID, &ls.Confidence, &ls.Stability, &ls.Difficulty,
			&ls.LastReviewed, &ls.NextReviewDue, &ls.TotalAttempts, &ls.CorrectStreak,
			&ls.ErrorCount, &ls.ErrorTypes, &ls.Status, &ls.Reps, &ls.Lapses,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, ls)
	}
	return results, nil
}
