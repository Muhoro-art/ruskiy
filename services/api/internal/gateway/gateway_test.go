package gateway

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testKeyPair is generated once per test run.
var testKeyPair *auth.KeyPair

func init() {
	kp, err := auth.GenerateKeyPair()
	if err != nil {
		panic("failed to generate test key pair: " + err.Error())
	}
	testKeyPair = kp
}

// mockProfileHandler returns profile data and echoes the X-User-ID header.
func mockProfileHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":          userID,
		"displayName": "Test User",
		"service":     "profile-service",
	})
}

// mockSessionV1Handler simulates session-service-v1.
func mockSessionV1Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"service": "session-service-v1",
	})
}

// mockSessionV2Handler simulates session-service-v2.
func mockSessionV2Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"service": "session-service-v2",
	})
}

func newTestRouter(rl *middleware.RateLimiter) http.Handler {
	cfg := Config{
		PublicKey:      testKeyPair.PublicKey,
		AllowedOrigins: []string{"https://russkiy.app", "http://localhost:3000"},
		RateLimiter:    rl,
	}
	return NewRouter(cfg, mockProfileHandler, mockSessionV1Handler, mockSessionV2Handler)
}

// ============================================================
// TC-GW-001: Unauthenticated Request to Protected Endpoint
// ============================================================

func TestUnauthenticatedRequestToProtectedEndpoint(t *testing.T) {
	router := newTestRouter(nil)

	req := httptest.NewRequest("GET", "/v1/profiles/me", nil)
	rec := httptest.NewRecorder()

	start := time.Now()
	router.ServeHTTP(rec, req)
	elapsed := time.Since(start)

	// Assert: 401 Unauthorized
	assert.Equal(t, http.StatusUnauthorized, rec.Code)

	// Assert: Response body contains { error: "missing_auth_token" }
	var body map[string]string
	err := json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)
	assert.Equal(t, "missing_auth_token", body["error"])

	// Assert: Response time < 50ms (fast rejection)
	assert.Less(t, elapsed, 50*time.Millisecond, "unauthenticated rejection should be < 50ms, was %v", elapsed)
}

// ============================================================
// TC-GW-002: Valid Token Routes to Correct Service
// ============================================================

func TestValidTokenRoutesToCorrectService(t *testing.T) {
	router := newTestRouter(nil)

	// Generate a valid RS256 access token for user uuid-123
	tokenStr, err := GenerateTestToken(testKeyPair, "uuid-123", "free", 15*time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/v1/profiles/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	// Assert: 200 OK with profile data
	assert.Equal(t, http.StatusOK, rec.Code)

	var body map[string]interface{}
	err = json.Unmarshal(rec.Body.Bytes(), &body)
	require.NoError(t, err)

	// Assert: Request reaches Profile Service
	assert.Equal(t, "profile-service", body["service"])

	// Assert: X-User-ID header injected by gateway == "uuid-123"
	assert.Equal(t, "uuid-123", body["id"], "X-User-ID must be injected with the correct user ID")
}

// ============================================================
// TC-GW-003: Rate Limiting Enforces Per-User Limits
// ============================================================

func TestRateLimitingEnforcesPerUserLimits(t *testing.T) {
	rl := middleware.NewRateLimiter(middleware.RateLimitConfig{
		FreeLimitPerMin:    100,
		PremiumLimitPerMin: 1000,
		WindowDuration:     60 * time.Second,
	})
	router := newTestRouter(rl)

	// Generate free-tier token
	freeToken, err := GenerateTestToken(testKeyPair, "free-user-001", "free", 15*time.Minute)
	require.NoError(t, err)

	// Send 100 requests — all should return 200
	for i := 1; i <= 100; i++ {
		req := httptest.NewRequest("GET", "/v1/profiles/me", nil)
		req.Header.Set("Authorization", "Bearer "+freeToken)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code, "request %d should return 200", i)
	}

	// 101st request should return 429
	req := httptest.NewRequest("GET", "/v1/profiles/me", nil)
	req.Header.Set("Authorization", "Bearer "+freeToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusTooManyRequests, rec.Code, "101st request should return 429")

	// Assert: Retry-After header is present
	assert.NotEmpty(t, rec.Header().Get("Retry-After"), "429 response must include Retry-After header")

	// Premium tier user at 101 requests should still get 200
	premiumToken, err := GenerateTestToken(testKeyPair, "premium-user-001", "premium", 15*time.Minute)
	require.NoError(t, err)

	for i := 1; i <= 101; i++ {
		req := httptest.NewRequest("GET", "/v1/profiles/me", nil)
		req.Header.Set("Authorization", "Bearer "+premiumToken)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code, "premium request %d should return 200", i)
	}
}

// ============================================================
// TC-GW-004: Kong Routes Versioned Endpoints Correctly
// ============================================================

func TestVersionedEndpointRouting(t *testing.T) {
	router := newTestRouter(nil)

	tokenStr, err := GenerateTestToken(testKeyPair, "uuid-route-test", "free", 15*time.Minute)
	require.NoError(t, err)

	// v1 routes to session-service-v1
	t.Run("v1_routes_to_v1_service", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/v1/sessions/generate", nil)
		req.Header.Set("Authorization", "Bearer "+tokenStr)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var body map[string]string
		err := json.Unmarshal(rec.Body.Bytes(), &body)
		require.NoError(t, err)
		assert.Equal(t, "session-service-v1", body["service"])
	})

	// v2 routes to session-service-v2
	t.Run("v2_routes_to_v2_service", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/v2/sessions/generate", nil)
		req.Header.Set("Authorization", "Bearer "+tokenStr)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)

		var body map[string]string
		err := json.Unmarshal(rec.Body.Bytes(), &body)
		require.NoError(t, err)
		assert.Equal(t, "session-service-v2", body["service"])
	})

	// v99 returns 404 with API version listing
	t.Run("v99_returns_404_with_version_listing", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v99/anything", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusNotFound, rec.Code)

		var body map[string]interface{}
		err := json.Unmarshal(rec.Body.Bytes(), &body)
		require.NoError(t, err)
		assert.Equal(t, "unknown_api_version", body["error"])
		assert.Equal(t, "v99", body["requested_version"])

		versions, ok := body["available_versions"].([]interface{})
		require.True(t, ok, "available_versions must be an array")
		assert.Contains(t, versions, "v1")
		assert.Contains(t, versions, "v2")
	})
}

// ============================================================
// TC-GW-005: CORS Preflight Handling
// ============================================================

func TestCORSPreflightHandling(t *testing.T) {
	router := newTestRouter(nil)

	// Allowed origin: https://russkiy.app
	t.Run("allowed_origin_russkiy_app", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/v1/auth/token", nil)
		req.Header.Set("Origin", "https://russkiy.app")
		req.Header.Set("Access-Control-Request-Method", "POST")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		// Assert: Access-Control-Allow-Origin includes https://russkiy.app
		acao := rec.Header().Get("Access-Control-Allow-Origin")
		assert.Equal(t, "https://russkiy.app", acao,
			"CORS must allow https://russkiy.app")

		// Assert: Access-Control-Allow-Methods includes POST
		acam := rec.Header().Get("Access-Control-Allow-Methods")
		assert.Contains(t, acam, "POST",
			"CORS must allow POST method")
	})

	// Disallowed origin: https://evil.com
	t.Run("disallowed_origin_evil_com", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/v1/auth/token", nil)
		req.Header.Set("Origin", "https://evil.com")
		req.Header.Set("Access-Control-Request-Method", "POST")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)

		// Assert: Access-Control-Allow-Origin does NOT include evil.com
		acao := rec.Header().Get("Access-Control-Allow-Origin")
		assert.NotContains(t, acao, "evil.com",
			"CORS must NOT allow https://evil.com")
	})
}
