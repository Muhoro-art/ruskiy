package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Errors returned by the auth service.
var (
	ErrTokenExpired       = errors.New("token_expired")
	ErrInvalidSignature   = errors.New("invalid_signature")
	ErrInvalidToken       = errors.New("invalid_token")
	ErrTokenRevoked       = errors.New("token_revoked")
	ErrAccountLocked      = errors.New("account_locked")
	ErrInvalidCredentials = errors.New("invalid_credentials")
	ErrOAuthExchangeFail  = errors.New("oauth_exchange_failed")
)

// ------------------- Password Hashing -------------------

// HashPassword hashes a plaintext password using bcrypt with a random salt.
// Each call produces a unique hash even for the same password.
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword checks if a plaintext password matches a bcrypt hash.
func VerifyPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ------------------- RSA Key Management -------------------

// KeyPair holds the RSA key pair used for RS256 signing.
type KeyPair struct {
	PrivateKey *rsa.PrivateKey
	PublicKey  *rsa.PublicKey
}

// GenerateKeyPair creates a new RSA-2048 key pair for token signing.
func GenerateKeyPair() (*KeyPair, error) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	return &KeyPair{PrivateKey: priv, PublicKey: &priv.PublicKey}, nil
}

// ------------------- JWT Token Generation -------------------

const (
	AccessTokenTTL  = 15 * time.Minute // 900 seconds
	RefreshTokenTTL = 30 * 24 * time.Hour
)

// TokenClaims are the claims embedded in an access token.
type TokenClaims struct {
	jwt.RegisteredClaims
	Role        string `json:"role"`
	AccountType string `json:"account_type"`
	Type        string `json:"typ"`
}

// GenerateAccessToken creates an RS256-signed JWT with sub, role, account_type, iat, exp claims.
func GenerateAccessToken(kp *KeyPair, userID, role, accountType string) (string, error) {
	now := time.Now()
	claims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTokenTTL)),
		},
		Role:        role,
		AccountType: accountType,
		Type:        "access",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(kp.PrivateKey)
}

// GenerateRefreshToken creates an RS256-signed refresh JWT with a unique jti claim.
func GenerateRefreshToken(kp *KeyPair, userID string) (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		ID:        uuid.New().String(),
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(RefreshTokenTTL)),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(kp.PrivateKey)
}

// ------------------- Token Validation -------------------

// ValidateToken parses and validates an RS256-signed token. Returns the claims
// or a specific error (ErrTokenExpired, ErrInvalidSignature, ErrInvalidToken).
func ValidateToken(kp *KeyPair, tokenStr string) (*TokenClaims, error) {
	claims := &TokenClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return kp.PublicKey, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrInvalidSignature
	}
	if !token.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

// ------------------- Refresh Token Rotation -------------------

// TokenStore manages refresh token revocation. In production this would be
// backed by Redis or PostgreSQL; here we provide an in-memory implementation
// suitable for unit testing.
type TokenStore interface {
	// StoreRefreshToken saves a refresh token with its metadata.
	StoreRefreshToken(tokenID, userID string) error
	// RevokeRefreshToken marks a refresh token as revoked.
	RevokeRefreshToken(tokenID string) error
	// IsRevoked checks if a refresh token has been revoked.
	IsRevoked(tokenID string) bool
	// RecordRevokedReuse is called when a revoked token is used again (security alert).
	RecordRevokedReuse(tokenID string)
	// WasReusedAfterRevoke returns true if a revoked token was reused.
	WasReusedAfterRevoke(tokenID string) bool
}

// RotationResult holds the output of a refresh token rotation.
type RotationResult struct {
	AccessToken  string
	RefreshToken string
}

// RotateRefreshToken validates the old refresh token, revokes it, and issues
// a new access + refresh token pair.
func RotateRefreshToken(kp *KeyPair, store TokenStore, oldTokenStr string, role, accountType string) (*RotationResult, error) {
	// Parse the old token
	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(oldTokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, ErrInvalidSignature
		}
		return kp.PublicKey, nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}

	tokenID := oldTokenStr // Use raw token as ID for simplicity

	// Check if this token was already revoked
	if store.IsRevoked(tokenID) {
		store.RecordRevokedReuse(tokenID)
		return nil, ErrTokenRevoked
	}

	// Revoke the old token
	if err := store.RevokeRefreshToken(tokenID); err != nil {
		return nil, err
	}

	userID := claims.Subject

	// Issue new tokens
	newAccess, err := GenerateAccessToken(kp, userID, role, accountType)
	if err != nil {
		return nil, err
	}
	newRefresh, err := GenerateRefreshToken(kp, userID)
	if err != nil {
		return nil, err
	}

	newRefreshID := newRefresh
	_ = store.StoreRefreshToken(newRefreshID, userID)

	return &RotationResult{
		AccessToken:  newAccess,
		RefreshToken: newRefresh,
	}, nil
}

// ------------------- Account Lockout -------------------

const (
	MaxFailedAttempts = 5
	LockoutDuration   = 15 * time.Minute
)

// LockoutEntry tracks failed login attempts for an account.
type LockoutEntry struct {
	FailedAttempts int
	LockedUntil    *time.Time
}

// LockoutManager tracks failed login attempts and enforces account lockout.
type LockoutManager struct {
	mu       sync.Mutex
	accounts map[string]*LockoutEntry
}

// NewLockoutManager creates a new lockout manager.
func NewLockoutManager() *LockoutManager {
	return &LockoutManager{accounts: make(map[string]*LockoutEntry)}
}

// AuthenticateResult describes the outcome of an authentication attempt.
type AuthenticateResult struct {
	StatusCode int // HTTP-style status code (200, 401, 429)
}

// RecordFailedAttempt records a failed login and returns the HTTP status code
// that should be sent to the client.
func (lm *LockoutManager) RecordFailedAttempt(userID string) int {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	entry, exists := lm.accounts[userID]
	if !exists {
		entry = &LockoutEntry{}
		lm.accounts[userID] = entry
	}

	// If currently locked out, return 429
	if entry.LockedUntil != nil && time.Now().Before(*entry.LockedUntil) {
		return 429
	}

	entry.FailedAttempts++

	if entry.FailedAttempts >= MaxFailedAttempts {
		lockUntil := time.Now().Add(LockoutDuration)
		entry.LockedUntil = &lockUntil
		return 429
	}

	return 401
}

// IsLocked returns true if the account is currently locked.
func (lm *LockoutManager) IsLocked(userID string) bool {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	entry, exists := lm.accounts[userID]
	if !exists {
		return false
	}
	if entry.LockedUntil == nil {
		return false
	}
	return time.Now().Before(*entry.LockedUntil)
}

// GetLockoutEntry returns the lockout info for a user (for assertions).
func (lm *LockoutManager) GetLockoutEntry(userID string) *LockoutEntry {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	return lm.accounts[userID]
}

// CheckLockout checks if a user is locked out. Returns 429 if locked, 0 otherwise.
func (lm *LockoutManager) CheckLockout(userID string) int {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	entry, exists := lm.accounts[userID]
	if !exists {
		return 0
	}
	if entry.LockedUntil != nil && time.Now().Before(*entry.LockedUntil) {
		return 429
	}
	return 0
}

// ResetAttempts clears the failed attempts after a successful login.
func (lm *LockoutManager) ResetAttempts(userID string) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	delete(lm.accounts, userID)
}

// ------------------- OAuth Provider Token Exchange -------------------

// OAuthUserInfo represents user information retrieved from an OAuth provider.
type OAuthUserInfo struct {
	ProviderUserID string
	Email          string
	DisplayName    string
	Provider       string
}

// OAuthProvider defines the interface for exchanging OAuth authorization codes.
type OAuthProvider interface {
	ExchangeCode(code string) (*OAuthUserInfo, error)
}

// OAuthResult holds the result of an OAuth token exchange.
type OAuthResult struct {
	AccessToken   string
	RefreshToken  string
	UserID        string
	OAuthProvider string
	IsNewUser     bool
}

// UserLookup is the interface for finding/creating users during OAuth flow.
type UserLookup interface {
	FindByOAuthProvider(provider, providerUserID string) (userID string, found bool)
	CreateOAuthUser(info *OAuthUserInfo) (userID string, err error)
}

// ExchangeOAuthCode exchanges an authorization code with the given provider,
// finds or creates the user, and returns tokens.
func ExchangeOAuthCode(kp *KeyPair, provider OAuthProvider, users UserLookup, providerName, code string) (*OAuthResult, error) {
	info, err := provider.ExchangeCode(code)
	if err != nil {
		return nil, ErrOAuthExchangeFail
	}
	info.Provider = providerName

	userID, found := users.FindByOAuthProvider(providerName, info.ProviderUserID)
	isNew := false
	if !found {
		userID, err = users.CreateOAuthUser(info)
		if err != nil {
			return nil, err
		}
		isNew = true
	}

	accessToken, err := GenerateAccessToken(kp, userID, "learner", "free")
	if err != nil {
		return nil, err
	}
	refreshToken, err := GenerateRefreshToken(kp, userID)
	if err != nil {
		return nil, err
	}

	return &OAuthResult{
		AccessToken:   accessToken,
		RefreshToken:  refreshToken,
		UserID:        userID,
		OAuthProvider: providerName,
		IsNewUser:     isNew,
	}, nil
}

// ------------------- In-Memory Token Store (for testing) -------------------

// MemoryTokenStore is an in-memory implementation of TokenStore for testing.
type MemoryTokenStore struct {
	mu            sync.Mutex
	tokens        map[string]string // tokenID -> userID
	revoked       map[string]bool
	revokedReused map[string]bool
}

// NewMemoryTokenStore creates a new in-memory token store.
func NewMemoryTokenStore() *MemoryTokenStore {
	return &MemoryTokenStore{
		tokens:        make(map[string]string),
		revoked:       make(map[string]bool),
		revokedReused: make(map[string]bool),
	}
}

func (s *MemoryTokenStore) StoreRefreshToken(tokenID, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tokens[tokenID] = userID
	return nil
}

func (s *MemoryTokenStore) RevokeRefreshToken(tokenID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revoked[tokenID] = true
	return nil
}

func (s *MemoryTokenStore) IsRevoked(tokenID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.revoked[tokenID]
}

func (s *MemoryTokenStore) RecordRevokedReuse(tokenID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revokedReused[tokenID] = true
}

func (s *MemoryTokenStore) WasReusedAfterRevoke(tokenID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.revokedReused[tokenID]
}
