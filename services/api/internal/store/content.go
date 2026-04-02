package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/model"
)

type ContentStore struct {
	db *pgxpool.Pool
}

func NewContentStore(db *pgxpool.Pool) *ContentStore {
	return &ContentStore{db: db}
}

func (s *ContentStore) GetByID(ctx context.Context, id uuid.UUID) (*model.ContentAtom, error) {
	c := &model.ContentAtom{}
	err := s.db.QueryRow(ctx, `
		SELECT id, content_type, exercise_type, target_skills, cefr_level,
		       segment_tags, domain_tags, difficulty, estimated_time,
		       content_data, media_refs, created_at, quality_score, usage_count
		FROM content_atoms WHERE id = $1
	`, id).Scan(
		&c.ID, &c.ContentType, &c.ExerciseType, &c.TargetSkills, &c.CEFRLevel,
		&c.SegmentTags, &c.DomainTags, &c.Difficulty, &c.EstimatedTime,
		&c.ContentData, &c.MediaRefs, &c.CreatedAt, &c.QualityScore, &c.UsageCount,
	)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *ContentStore) GetBySkills(ctx context.Context, skillIDs []string, cefrLevel string, segment string, limit int) ([]model.ContentAtom, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, content_type, exercise_type, target_skills, cefr_level,
		       segment_tags, domain_tags, difficulty, estimated_time,
		       content_data, media_refs, created_at, quality_score, usage_count
		FROM content_atoms
		WHERE target_skills && $1
		  AND cefr_level = $2
		  AND $3 = ANY(segment_tags)
		ORDER BY quality_score DESC, usage_count ASC
		LIMIT $4
	`, skillIDs, cefrLevel, segment, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanContentRows(rows)
}

// GetBySkillsAny fetches content matching skills and CEFR level without segment filtering.
// If cefrLevel is empty, returns content at any level.
func (s *ContentStore) GetBySkillsAny(ctx context.Context, skillIDs []string, cefrLevel string, limit int) ([]model.ContentAtom, error) {
	var query string
	var args []interface{}

	if cefrLevel == "" {
		query = `
			SELECT id, content_type, exercise_type, target_skills, cefr_level,
			       segment_tags, domain_tags, difficulty, estimated_time,
			       content_data, media_refs, created_at, quality_score, usage_count
			FROM content_atoms
			WHERE target_skills && $1
			ORDER BY quality_score DESC, usage_count ASC
			LIMIT $2`
		args = []interface{}{skillIDs, limit}
	} else {
		query = `
			SELECT id, content_type, exercise_type, target_skills, cefr_level,
			       segment_tags, domain_tags, difficulty, estimated_time,
			       content_data, media_refs, created_at, quality_score, usage_count
			FROM content_atoms
			WHERE target_skills && $1
			  AND cefr_level = $2
			ORDER BY quality_score DESC, usage_count ASC
			LIMIT $3`
		args = []interface{}{skillIDs, cefrLevel, limit}
	}

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanContentRows(rows)
}

func (s *ContentStore) GetByExerciseType(ctx context.Context, exerciseType string, cefrLevel string, limit int) ([]model.ContentAtom, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, content_type, exercise_type, target_skills, cefr_level,
		       segment_tags, domain_tags, difficulty, estimated_time,
		       content_data, media_refs, created_at, quality_score, usage_count
		FROM content_atoms
		WHERE exercise_type = $1
		  AND cefr_level = $2
		ORDER BY quality_score DESC, usage_count ASC
		LIMIT $3
	`, exerciseType, cefrLevel, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanContentRows(rows)
}

func (s *ContentStore) Search(ctx context.Context, query string, limit int) ([]model.ContentAtom, error) {
	// Use ILIKE for basic text search on the JSONB content_data column.
	pattern := fmt.Sprintf("%%%s%%", strings.ReplaceAll(query, "%", "\\%"))
	rows, err := s.db.Query(ctx, `
		SELECT id, content_type, exercise_type, target_skills, cefr_level,
		       segment_tags, domain_tags, difficulty, estimated_time,
		       content_data, media_refs, created_at, quality_score, usage_count
		FROM content_atoms
		WHERE content_data::text ILIKE $1
		ORDER BY quality_score DESC
		LIMIT $2
	`, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanContentRows(rows)
}

func (s *ContentStore) IncrementUsage(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.Exec(ctx, `
		UPDATE content_atoms SET usage_count = usage_count + 1 WHERE id = $1
	`, id)
	return err
}

func (s *ContentStore) GetRecentlyUsed(ctx context.Context, learnerID uuid.UUID, days int) ([]uuid.UUID, error) {
	cutoff := time.Now().AddDate(0, 0, -days)
	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT er.content_id
		FROM exercise_results er
		JOIN sessions ses ON ses.id = er.session_id
		WHERE ses.learner_id = $1
		  AND er.timestamp >= $2
		ORDER BY er.content_id
	`, learnerID, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// scanContentRows is a helper that scans multiple content_atoms rows.
func scanContentRows(rows interface {
	Next() bool
	Scan(dest ...any) error
}) ([]model.ContentAtom, error) {
	var results []model.ContentAtom
	for rows.Next() {
		var c model.ContentAtom
		err := rows.Scan(
			&c.ID, &c.ContentType, &c.ExerciseType, &c.TargetSkills, &c.CEFRLevel,
			&c.SegmentTags, &c.DomainTags, &c.Difficulty, &c.EstimatedTime,
			&c.ContentData, &c.MediaRefs, &c.CreatedAt, &c.QualityScore, &c.UsageCount,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, c)
	}
	return results, nil
}
