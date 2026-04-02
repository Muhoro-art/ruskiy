package auth

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================
// TC-AUTH-001: Password Hashing Produces Unique Salted Hash
// ============================================================

func TestPasswordHashingProducesUniqueSaltedHash(t *testing.T) {
	password := "SecureP@ss123"

	// Call HashPassword twice
	hash1, err := HashPassword(password)
	require.NoError(t, err)
	hash2, err := HashPassword(password)
	require.NoError(t, err)

	// Assert: hash1 != hash2 (different salts)
	assert.NotEqual(t, hash1, hash2, "two hashes of the same password must differ (unique salts)")

	// Assert: VerifyPassword(password, hash1) == true
	assert.True(t, VerifyPassword(password, hash1), "correct password must verify against hash1")

	// Assert: VerifyPassword("wrong", hash1) == false
	assert.False(t, VerifyPassword("wrong", hash1), "wrong password must not verify")
}

// ============================================================
// TC-AUTH-002: JWT Token Generation Contains Required Claims
// ============================================================

func TestJWTTokenGenerationContainsRequiredClaims(t *testing.T) {
	kp, err := GenerateKeyPair()
	require.NoError(t, err)

	userID := "uuid-123"
	role := "learner"
	accountType := "premium"

	tokenStr, err := GenerateAccessToken(kp, userID, role, accountType)
	require.NoError(t, err)

	// Parse back the token to inspect claims
	claims := &TokenClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return kp.PublicKey, nil
	})
	require.NoError(t, err)
	require.True(t, token.Valid)

	// Assert: token.Claims["sub"] == "uuid-123"
	assert.Equal(t, "uuid-123", claims.Subject)

	// Assert: token.Claims["role"] == "learner"
	assert.Equal(t, "learner", claims.Role)

	// Assert: token.Claims["account_type"] == "premium"
	assert.Equal(t, "premium", claims.AccountType)

	// Assert: token.Claims["exp"] - token.Claims["iat"] == 900 (15 min TTL)
	exp := claims.ExpiresAt.Time.Unix()
	iat := claims.IssuedAt.Time.Unix()
	assert.Equal(t, int64(900), exp-iat, "access token TTL must be 900 seconds (15 minutes)")

	// Assert: token is signed with RS256
	assert.Equal(t, "RS256", token.Method.Alg(), "token must be signed with RS256")
}

// ============================================================
// TC-AUTH-003: Refresh Token Rotation Invalidates Previous Token
// ============================================================

func TestRefreshTokenRotationInvalidatesPreviousToken(t *testing.T) {
	kp, err := GenerateKeyPair()
	require.NoError(t, err)

	store := NewMemoryTokenStore()

	// Generate initial refresh token (v1)
	refreshV1, err := GenerateRefreshToken(kp, "user-abc")
	require.NoError(t, err)
	_ = store.StoreRefreshToken(refreshV1, "user-abc")

	// Rotate: returns new refresh_token_v2 + new access_token
	result, err := RotateRefreshToken(kp, store, refreshV1, "learner", "free")
	require.NoError(t, err)
	require.NotNil(t, result)

	assert.NotEmpty(t, result.AccessToken, "rotation must return a new access token")
	assert.NotEmpty(t, result.RefreshToken, "rotation must return a new refresh token")
	assert.NotEqual(t, refreshV1, result.RefreshToken, "new refresh token must differ from old")

	// Assert: refresh_token_v1 is marked revoked
	assert.True(t, store.IsRevoked(refreshV1), "old refresh token must be revoked")

	// Assert: subsequent use of refresh_token_v1 returns error + triggers alert
	_, err = RotateRefreshToken(kp, store, refreshV1, "learner", "free")
	assert.Error(t, err)
	assert.True(t, errors.Is(err, ErrTokenRevoked), "reusing revoked token must return ErrTokenRevoked")

	// Verify alert was triggered
	assert.True(t, store.WasReusedAfterRevoke(refreshV1), "reuse of revoked token must trigger alert")
}

// ============================================================
// TC-AUTH-004: Account Lockout After Failed Attempts
// ============================================================

func TestAccountLockoutAfterFailedAttempts(t *testing.T) {
	lm := NewLockoutManager()
	userID := "user-lockout-test"

	// First 4 attempts return 401 Unauthorized
	for i := 1; i <= 4; i++ {
		status := lm.RecordFailedAttempt(userID)
		assert.Equal(t, 401, status, "attempt %d should return 401", i)
	}

	// 5th attempt returns 429 Too Many Requests
	status := lm.RecordFailedAttempt(userID)
	assert.Equal(t, 429, status, "5th attempt should return 429")

	// Assert: account.locked_until is set to ~now + 15 minutes
	entry := lm.GetLockoutEntry(userID)
	require.NotNil(t, entry)
	require.NotNil(t, entry.LockedUntil)

	expectedLock := time.Now().Add(LockoutDuration)
	diff := entry.LockedUntil.Sub(expectedLock)
	assert.True(t, diff < 2*time.Second && diff > -2*time.Second,
		"locked_until should be ~now + 15 minutes")

	// Assert: correct password during lockout still returns 429
	lockStatus := lm.CheckLockout(userID)
	assert.Equal(t, 429, lockStatus, "correct password during lockout must still return 429")
}

// ============================================================
// TC-AUTH-005: OAuth Provider Token Exchange
// ============================================================

// mockOAuthProvider simulates Google OAuth
type mockOAuthProvider struct{}

func (m *mockOAuthProvider) ExchangeCode(code string) (*OAuthUserInfo, error) {
	if code == "valid_google_auth_code" {
		return &OAuthUserInfo{
			ProviderUserID: "google-12345",
			Email:          "user@gmail.com",
			DisplayName:    "Test User",
		}, nil
	}
	return nil, errors.New("invalid code")
}

// mockUserLookup simulates user DB operations
type mockUserLookup struct {
	existingUsers map[string]string // provider:providerID -> userID
	createdUsers  []OAuthUserInfo
}

func newMockUserLookup() *mockUserLookup {
	return &mockUserLookup{
		existingUsers: make(map[string]string),
	}
}

func (m *mockUserLookup) FindByOAuthProvider(provider, providerUserID string) (string, bool) {
	uid, ok := m.existingUsers[provider+":"+providerUserID]
	return uid, ok
}

func (m *mockUserLookup) CreateOAuthUser(info *OAuthUserInfo) (string, error) {
	m.createdUsers = append(m.createdUsers, *info)
	userID := "new-user-" + info.ProviderUserID
	m.existingUsers[info.Provider+":"+info.ProviderUserID] = userID
	return userID, nil
}

func TestOAuthProviderTokenExchange(t *testing.T) {
	kp, err := GenerateKeyPair()
	require.NoError(t, err)

	provider := &mockOAuthProvider{}
	users := newMockUserLookup()

	// Exchange a valid Google auth code
	result, err := ExchangeOAuthCode(kp, provider, users, "google", "valid_google_auth_code")
	require.NoError(t, err)
	require.NotNil(t, result)

	// Assert: returns access_token + refresh_token
	assert.NotEmpty(t, result.AccessToken, "must return access token")
	assert.NotEmpty(t, result.RefreshToken, "must return refresh token")

	// Assert: creates user account
	assert.True(t, result.IsNewUser, "should create new user for first OAuth login")
	assert.Len(t, users.createdUsers, 1, "should have created exactly one user")

	// Assert: user.oauth_provider == "google"
	assert.Equal(t, "google", result.OAuthProvider, "OAuth provider must be google")

	// Validate the access token has the right subject
	claims, err := ValidateToken(kp, result.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, "new-user-google-12345", claims.Subject)

	// Second login should link to existing user, not create new
	result2, err := ExchangeOAuthCode(kp, provider, users, "google", "valid_google_auth_code")
	require.NoError(t, err)
	assert.False(t, result2.IsNewUser, "second OAuth login should link to existing user")
	assert.Len(t, users.createdUsers, 1, "should not create duplicate user")
}

// ============================================================
// TC-AUTH-006: Token Validation Rejects Expired Tokens
// ============================================================

func TestTokenValidationRejectsExpiredTokens(t *testing.T) {
	kp, err := GenerateKeyPair()
	require.NoError(t, err)

	// Create a token that expired 60 seconds ago
	now := time.Now()
	claims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user-expired",
			IssuedAt:  jwt.NewNumericDate(now.Add(-120 * time.Second)),
			ExpiresAt: jwt.NewNumericDate(now.Add(-60 * time.Second)),
		},
		Role:        "learner",
		AccountType: "free",
		Type:        "access",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	expiredToken, err := token.SignedString(kp.PrivateKey)
	require.NoError(t, err)

	// Assert: returns error "token_expired"
	result, err := ValidateToken(kp, expiredToken)
	assert.Nil(t, result, "must NOT return user data for expired token")
	assert.Error(t, err)
	assert.True(t, errors.Is(err, ErrTokenExpired), "error must be token_expired, got: %v", err)
}

// ============================================================
// TC-AUTH-007: Token Validation Rejects Tampered Tokens
// ============================================================

func TestTokenValidationRejectsTamperedTokens(t *testing.T) {
	kp, err := GenerateKeyPair()
	require.NoError(t, err)

	// Generate a valid token with role "learner"
	validToken, err := GenerateAccessToken(kp, "user-tamper", "learner", "free")
	require.NoError(t, err)

	// Tamper with the payload: change role to "admin"
	parts := strings.Split(validToken, ".")
	require.Len(t, parts, 3, "JWT must have 3 parts")

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)

	var payload map[string]interface{}
	err = json.Unmarshal(payloadBytes, &payload)
	require.NoError(t, err)

	// Change role to admin
	payload["role"] = "admin"

	// Re-encode payload (without re-signing)
	modifiedPayload, err := json.Marshal(payload)
	require.NoError(t, err)
	parts[1] = base64.RawURLEncoding.EncodeToString(modifiedPayload)
	tamperedToken := strings.Join(parts, ".")

	// Assert: ValidateToken returns error "invalid_signature"
	result, err := ValidateToken(kp, tamperedToken)
	assert.Nil(t, result, "must NOT return claims for tampered token")
	assert.Error(t, err)
	assert.True(t, errors.Is(err, ErrInvalidSignature), "error must be invalid_signature, got: %v", err)
}
