package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrVerifyTokenInvalid is returned when a verification token is unknown or expired.
var ErrVerifyTokenInvalid = errors.New("verification link is invalid or expired")

// EmailVerifyStore issues + consumes single-use email-verification tokens. Only the
// SHA-256 of a token is stored, so the DB never holds a working link.
type EmailVerifyStore struct {
	db *pgxpool.Pool
}

func NewEmailVerifyStore(db *pgxpool.Pool) *EmailVerifyStore { return &EmailVerifyStore{db: db} }

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// CreateToken issues a verification token for userID+email and returns the RAW token
// (embed it in the emailed link). ttl bounds validity.
func (s *EmailVerifyStore) CreateToken(ctx context.Context, userID uuid.UUID, email string, ttl time.Duration) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(b)
	_, err := s.db.Exec(ctx,
		`INSERT INTO email_verification_tokens (token_hash, user_id, email, expires_at)
		 VALUES ($1, $2, $3, $4)`,
		hashToken(raw), userID, email, time.Now().Add(ttl))
	if err != nil {
		return "", err
	}
	return raw, nil
}

// Verify consumes a raw token: on a valid, unexpired match it marks the user's email
// verified and deletes all of that user's pending tokens (single use). Returns the userID.
func (s *EmailVerifyStore) Verify(ctx context.Context, rawToken string) (uuid.UUID, error) {
	if rawToken == "" {
		return uuid.Nil, ErrVerifyTokenInvalid
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT user_id FROM email_verification_tokens WHERE token_hash=$1 AND expires_at > now()`,
		hashToken(rawToken)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrVerifyTokenInvalid
	}
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified=TRUE, email_verified_at=now() WHERE id=$1`, userID); err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM email_verification_tokens WHERE user_id=$1`, userID); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return userID, nil
}

// PurgeExpired removes expired tokens (retention). Returns rows removed.
func (s *EmailVerifyStore) PurgeExpired(ctx context.Context) (int64, error) {
	tag, err := s.db.Exec(ctx, `DELETE FROM email_verification_tokens WHERE expires_at < now()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
