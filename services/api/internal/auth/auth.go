package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
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

// dummyBcryptHash is a valid bcrypt hash of a fixed string. It backs DummyVerify,
// which equalizes login timing on an unknown email (no user hash to compare) so an
// attacker can't distinguish registered from unregistered emails by response latency.
// A malformed hash short-circuits instantly, so this MUST be a real bcrypt hash.
var dummyBcryptHash, _ = bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcrypt.DefaultCost)

// DummyVerify performs a throwaway bcrypt comparison matching VerifyPassword's cost.
func DummyVerify(password string) {
	_ = bcrypt.CompareHashAndPassword(dummyBcryptHash, []byte(password))
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

// LoadOrCreateKeyPair loads the RSA signing key from a PEM file so tokens survive
// restarts AND are valid across every replica (all instances share one key). If
// path is empty it falls back to an ephemeral in-memory key (dev only). If path
// is set but the file is missing, it generates a key and persists it.
//
// This fixes the critical issue where each process minted a fresh key, logging
// every user out on deploy and breaking load-balanced auth.
func LoadOrCreateKeyPair(path string) (*KeyPair, error) {
	if path == "" {
		return GenerateKeyPair()
	}

	if data, err := os.ReadFile(path); err == nil {
		block, _ := pem.Decode(data)
		if block == nil {
			return nil, fmt.Errorf("no PEM block in %s", path)
		}
		priv, err := parseRSAPrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("parse key %s: %w", path, err)
		}
		return &KeyPair{PrivateKey: priv, PublicKey: &priv.PublicKey}, nil
	}

	// No existing key — generate and persist (0600).
	kp, err := GenerateKeyPair()
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: func() []byte { b, _ := x509.MarshalPKCS8PrivateKey(kp.PrivateKey); return b }(),
	})
	if err := os.WriteFile(path, pemBytes, 0o600); err != nil {
		return nil, fmt.Errorf("persist key %s: %w", path, err)
	}
	return kp, nil
}

func parseRSAPrivateKey(der []byte) (*rsa.PrivateKey, error) {
	if k, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		if rk, ok := k.(*rsa.PrivateKey); ok {
			return rk, nil
		}
		return nil, errors.New("PEM is not an RSA private key")
	}
	return x509.ParsePKCS1PrivateKey(der)
}

// ------------------- JWT Token Generation -------------------

// AccessTokenTTL / RefreshTokenTTL are the token lifetimes. They default to 15m / 30d
// but are overridden ONCE at startup from JWT_ACCESS_TTL_MINUTES / JWT_REFRESH_TTL_DAYS
// (see cmd/server/main.go, applied before any token is issued and before the Redis
// token-store TTL is derived from RefreshTokenTTL). They are package vars, not consts,
// only so that startup override is possible; nothing mutates them after serving begins,
// so the concurrent reads on the request path are race-free.
var (
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

// GenerateRefreshToken creates an RS256-signed refresh JWT with a unique jti claim
// and typ="refresh". It returns the signed token AND its jti so the whole refresh
// lifecycle (store / rotate / revoke) can key on a single stable identifier rather
// than the raw token string (which is what broke logout revocation).
func GenerateRefreshToken(kp *KeyPair, userID string) (tokenStr, jti string, err error) {
	now := time.Now()
	jti = uuid.New().String()
	claims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(RefreshTokenTTL)),
		},
		Type: "refresh",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tokenStr, err = token.SignedString(kp.PrivateKey)
	return tokenStr, jti, err
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
	// StoreRefreshToken saves a refresh token (keyed by its jti) with its metadata.
	StoreRefreshToken(tokenID, userID string) error
	// GetRefreshToken returns the userID a refresh-token jti was issued for, and
	// whether it is currently in the issued/allowlisted set. This turns the store
	// into a real allowlist: a signed-but-never-issued (or already-rotated) token
	// is rejected even though its signature verifies.
	GetRefreshToken(tokenID string) (userID string, ok bool)
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
	// Validate signature/expiry and read the typed claims (jti + typ).
	claims, err := ValidateToken(kp, oldTokenStr)
	if err != nil {
		return nil, err // ErrTokenExpired / ErrInvalidSignature propagate to the handler
	}
	// Only a refresh token may be rotated — an access token presented here is rejected.
	if claims.Type != "refresh" {
		return nil, ErrInvalidToken
	}
	jti := claims.ID
	if jti == "" {
		return nil, ErrInvalidToken
	}

	// Reuse of an already-revoked token is a security event.
	if store.IsRevoked(jti) {
		store.RecordRevokedReuse(jti)
		return nil, ErrTokenRevoked
	}

	// Allowlist gate: the jti must currently be in the issued set and belong to this
	// subject. A leaked-but-signed token that was never issued (or was already
	// rotated/logged-out) is rejected here even though its signature is valid.
	if storedUser, ok := store.GetRefreshToken(jti); !ok || storedUser != claims.Subject {
		return nil, ErrInvalidToken
	}

	// Revoke + de-list the old token so it cannot be rotated twice.
	if err := store.RevokeRefreshToken(jti); err != nil {
		return nil, err
	}

	userID := claims.Subject

	// Issue new tokens; store the NEW refresh token's jti in the allowlist.
	newAccess, err := GenerateAccessToken(kp, userID, role, accountType)
	if err != nil {
		return nil, err
	}
	newRefresh, newJTI, err := GenerateRefreshToken(kp, userID)
	if err != nil {
		return nil, err
	}
	_ = store.StoreRefreshToken(newJTI, userID)

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

// Lockout is the account-lockout interface used by the auth handler, so the
// implementation can be swapped (in-memory for dev/tests, Redis in production).
type Lockout interface {
	CheckLockout(userID string) int
	RecordFailedAttempt(userID string) int
	ResetAttempts(userID string)
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
	// NOTE: the OAuth path is not currently wired to a TokenStore, so this refresh
	// token is not added to the allowlist. If OAuth login is ever enabled, thread a
	// TokenStore in here and StoreRefreshToken(jti, userID) so rotation accepts it.
	refreshToken, _, err := GenerateRefreshToken(kp, userID)
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

func (s *MemoryTokenStore) GetRefreshToken(tokenID string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	userID, ok := s.tokens[tokenID]
	return userID, ok
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
