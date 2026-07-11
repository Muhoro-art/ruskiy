package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CurriculumStore persists each user's curriculum progress blob.
type CurriculumStore struct {
	db *pgxpool.Pool
}

func NewCurriculumStore(db *pgxpool.Pool) *CurriculumStore {
	return &CurriculumStore{db: db}
}

// Get returns the user's stored progress JSON, or "{}" if they have none yet.
// Real database errors are returned (not silently swallowed as empty).
func (s *CurriculumStore) Get(ctx context.Context, userID uuid.UUID) (json.RawMessage, error) {
	var data []byte
	err := s.db.QueryRow(ctx, `SELECT data FROM curriculum_progress WHERE user_id = $1`, userID).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return json.RawMessage("{}"), nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(data), nil
}

// Upsert atomically writes the user's progress blob, with a server-side FLOOR that
// refuses the one catastrophic case: an incoming blob with NO lessons overwriting a
// stored blob that HAS lessons (a fresh/empty device, a mobile/direct client, or a
// racing empty push wiping months of real progress). Any non-empty blob still writes
// — this guard never rejects legitimate progress, it only blocks empty-clobber.
//
// Returns whether the stored blob actually CHANGED. The client pushes on every
// Path-page mount (including no-op re-pushes of the unchanged blob), and jsonb
// equality is key-order-insensitive, so `changed` is a precise "the learner did
// something" signal — callers use it to avoid stamping activity/streaks for
// merely opening the page.
func (s *CurriculumStore) Upsert(ctx context.Context, userID uuid.UUID, data json.RawMessage) (bool, error) {
	// Update UNLESS (a) the incoming blob has no lesson entries while the stored one
	// does (the empty-clobber; jsonb_typeof keeps non-object payloads fail-safe), or
	// (b) the incoming blob is IDENTICAL to the stored one (no-op page-mount push).
	tag, err := s.db.Exec(ctx, `
		INSERT INTO curriculum_progress (user_id, data, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
		WHERE ((jsonb_typeof(EXCLUDED.data->'lessons') = 'object' AND EXCLUDED.data->'lessons' <> '{}'::jsonb)
		   OR NOT (jsonb_typeof(curriculum_progress.data->'lessons') = 'object' AND curriculum_progress.data->'lessons' <> '{}'::jsonb))
		  AND curriculum_progress.data IS DISTINCT FROM EXCLUDED.data
	`, userID, []byte(data))
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
