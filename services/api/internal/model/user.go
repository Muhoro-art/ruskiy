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
	Role           string      `json:"role"`
	// DisplayName is the account's globally-unique (case-insensitive) name, set at signup.
	DisplayName string `json:"displayName"`
	// EmailVerified gates a verified-email requirement (bot deterrence).
	EmailVerified bool `json:"emailVerified"`
	// DateOfBirth (ISO "YYYY-MM-DD") is captured at registration and is the authoritative
	// age signal for the under-18 (minor) / guardian-consent determination. Nullable —
	// pre-existing accounts have none.
	DateOfBirth *string `json:"dateOfBirth,omitempty"`
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	// Name is the account's display name — required, and globally unique (case-insensitive).
	Name string `json:"name"`
	// DateOfBirth (ISO "YYYY-MM-DD") is required at registration — the authoritative age
	// signal. If it shows the learner is under 18, a guardian sets up and consents.
	DateOfBirth string `json:"dateOfBirth"`
	// 152-FZ (as amended 1 Sept 2025) requires consent to personal-data processing to be
	// a SEPARATE, standalone act — not bundled into the Terms. So we capture two distinct
	// acceptances; both must be true. The server records an auditable consent event.
	AcceptedTerms          bool   `json:"acceptedTerms"`          // agreement to the Terms of Service
	AcceptedDataProcessing bool   `json:"acceptedDataProcessing"` // standalone consent to processing of personal data
	Locale                 string `json:"locale,omitempty"`
	// Role lets a caller self-register as a teacher (independent instructor). Only
	// "teacher" is honoured here — a whitelist; "dean"/"admin" can NEVER be claimed
	// at signup (those are provisioned by an admin key or a dean invite). Anything
	// else falls back to the default "learner".
	Role string `json:"role,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	// Portal identifies which sign-in page the request came from ("learner",
	// "teacher", "dean", "admin"). Each portal is bound to exactly one account
	// role server-side, so a staff account cannot authenticate through the
	// learner portal (and vice-versa) even with valid credentials. Empty is
	// treated as the learner portal — the fail-safe default for older clients
	// and the mobile app, which are learner-facing.
	Portal string `json:"portal,omitempty"`
}

type AuthTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}
