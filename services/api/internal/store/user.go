package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/model"
)

type UserStore struct {
	db *pgxpool.Pool
}

func NewUserStore(db *pgxpool.Pool) *UserStore {
	return &UserStore{db: db}
}

func (s *UserStore) Create(ctx context.Context, user *model.User) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, created_at, account_type, locale)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, user.ID, user.Email, user.PasswordHash, user.CreatedAt, user.AccountType, user.Locale)
	return err
}

func (s *UserStore) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	user := &model.User{}
	err := s.db.QueryRow(ctx, `
		SELECT id, email, password_hash, created_at, last_login, account_type,
		       subscription_id, locale
		FROM users WHERE email = $1
	`, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt,
		&user.LastLogin, &user.AccountType, &user.SubscriptionID, &user.Locale,
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
		       subscription_id, locale
		FROM users WHERE id = $1
	`, id).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt,
		&user.LastLogin, &user.AccountType, &user.SubscriptionID, &user.Locale,
	)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserStore) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users SET last_login = $1 WHERE id = $2
	`, time.Now(), id)
	return err
}
