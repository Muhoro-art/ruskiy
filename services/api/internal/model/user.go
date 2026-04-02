package model

import (
	"time"

	"github.com/google/uuid"
)

type AccountType string

const (
	AccountFree          AccountType = "free"
	AccountPremium       AccountType = "premium"
	AccountInstitutional AccountType = "institutional"
	AccountFamily        AccountType = "family"
)

type User struct {
	ID             uuid.UUID   `json:"id"`
	Email          string      `json:"email"`
	PasswordHash   string      `json:"-"`
	CreatedAt      time.Time   `json:"createdAt"`
	LastLogin      *time.Time  `json:"lastLogin"`
	AccountType    AccountType `json:"accountType"`
	SubscriptionID *uuid.UUID  `json:"subscriptionId"`
	Locale         string      `json:"locale"`
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Locale   string `json:"locale,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}
