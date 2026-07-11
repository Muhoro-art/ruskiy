package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// XAPIStore is a minimal Learning Record Store for xAPI statements.
type XAPIStore struct {
	db *pgxpool.Pool
}

func NewXAPIStore(db *pgxpool.Pool) *XAPIStore {
	return &XAPIStore{db: db}
}

// Insert stores a statement tagged with the authenticated poster (userID) so reads
// can be scoped to the owner — the client-supplied `actor` is never trusted for authz.
func (s *XAPIStore) Insert(ctx context.Context, userID uuid.UUID, actor, verb, object, raw json.RawMessage) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.db.QueryRow(ctx, `
		INSERT INTO xapi_statements (user_id, actor, verb, object, raw)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, userID, []byte(actor), []byte(verb), []byte(object), []byte(raw)).Scan(&id)
	return id, err
}

type XAPIRecord struct {
	ID        uuid.UUID       `json:"id"`
	Statement json.RawMessage `json:"statement"`
	StoredAt  time.Time       `json:"stored"`
}

// Recent returns ONLY the caller's own statements (tenant isolation) — never the
// whole LRS. Scoped by user_id, newest first.
func (s *XAPIStore) Recent(ctx context.Context, userID uuid.UUID, limit int) ([]XAPIRecord, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, raw, stored_at FROM xapi_statements WHERE user_id = $1 ORDER BY stored_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []XAPIRecord{}
	for rows.Next() {
		var rec XAPIRecord
		var raw []byte
		if err := rows.Scan(&rec.ID, &raw, &rec.StoredAt); err != nil {
			return nil, err
		}
		rec.Statement = json.RawMessage(raw)
		out = append(out, rec)
	}
	return out, rows.Err()
}
