package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/model"
)

// Registration uniqueness errors, distinguished so the handler can tell the user
// exactly which field collided.
var (
	ErrEmailTaken = errors.New("email already registered")
	ErrNameTaken  = errors.New("display name is already taken")
)

type UserStore struct {
	db *pgxpool.Pool
}

func NewUserStore(db *pgxpool.Pool) *UserStore {
	return &UserStore{db: db}
}

func (s *UserStore) Create(ctx context.Context, user *model.User) error {
	if user.Role == "" {
		user.Role = "learner"
	}
	// Store email lower-cased so it round-trips consistently with the case-insensitive
	// unique index and case-insensitive lookups.
	email := strings.ToLower(strings.TrimSpace(user.Email))
	user.Email = email
	_, err := s.db.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, created_at, account_type, locale, role, display_name, email_verified, date_of_birth)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date)
	`, user.ID, email, user.PasswordHash, user.CreatedAt, user.AccountType, user.Locale, user.Role, user.DisplayName, user.EmailVerified, user.DateOfBirth)
	// Translate a unique-violation into a typed error the handler can map to a 409 — this
	// is the RACE-SAFE guard (a pre-check alone can let two concurrent signups through).
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if strings.Contains(pgErr.ConstraintName, "display_name") {
			return ErrNameTaken
		}
		if strings.Contains(pgErr.ConstraintName, "email") {
			return ErrEmailTaken
		}
	}
	return err
}

// NameTaken reports whether a display name is already in use (case-insensitive). Used
// for a friendly pre-check; the DB unique index is the authoritative guard.
func (s *UserStore) NameTaken(ctx context.Context, name string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(display_name) = lower($1))`,
		strings.TrimSpace(name)).Scan(&exists)
	return exists, err
}

// DeleteByID deletes a user and, via ON DELETE CASCADE, all of their owned data
// (learner_profiles, sessions, learner_skills, analytics_events, consents, xapi
// rows keyed by user). This is the right-to-erasure primitive behind DELETE /v1/me.
func (s *UserStore) DeleteByID(ctx context.Context, userID uuid.UUID) error {
	_, err := s.db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

func (s *UserStore) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	user := &model.User{}
	// Case-insensitive: an account is found regardless of how the email was typed.
	err := s.db.QueryRow(ctx, `
		SELECT id, email, password_hash, created_at, last_login, account_type,
		       subscription_id, locale, role, COALESCE(display_name,''), email_verified
		FROM users WHERE lower(email) = lower($1)
	`, strings.TrimSpace(email)).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt,
		&user.LastLogin, &user.AccountType, &user.SubscriptionID, &user.Locale, &user.Role,
		&user.DisplayName, &user.EmailVerified,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserStore) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user := &model.User{}
	err := s.db.QueryRow(ctx, `
		SELECT id, email, password_hash, created_at, last_login, account_type,
		       subscription_id, locale, role, COALESCE(display_name,''), email_verified
		FROM users WHERE id = $1
	`, id).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt,
		&user.LastLogin, &user.AccountType, &user.SubscriptionID, &user.Locale, &user.Role,
		&user.DisplayName, &user.EmailVerified,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// SetRoleByEmail updates a user's role. Returns the number of rows affected.
func (s *UserStore) SetRoleByEmail(ctx context.Context, email, role string) (int64, error) {
	tag, err := s.db.Exec(ctx, `UPDATE users SET role = $2 WHERE email = $1`, email, role)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *UserStore) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users SET last_login = $1 WHERE id = $2
	`, time.Now(), id)
	return err
}
