package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"time"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/model"
	"github.com/russkiy/api/internal/store"
)

// emailRegex is a basic email format validation pattern (C3 audit fix).
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type AuthHandler struct {
	users      *store.UserStore
	keyPair    *auth.KeyPair
	tokenStore auth.TokenStore
	lockout    *auth.LockoutManager
}

func NewAuthHandler(users *store.UserStore, kp *auth.KeyPair, ts auth.TokenStore, lm *auth.LockoutManager) *AuthHandler {
	return &AuthHandler{users: users, keyPair: kp, tokenStore: ts, lockout: lm}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email and password are required"})
		return
	}

	// Email format validation (C3 audit fix)
	if !emailRegex.MatchString(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email format"})
		return
	}

	if len(req.Password) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 8 characters"})
		return
	}

	existing, _ := h.users.GetByEmail(r.Context(), req.Email)
	if existing != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "email already registered"})
		return
	}

	hashStr, err := auth.HashPassword(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	locale := req.Locale
	if locale == "" {
		locale = "en-US"
	}

	user := &model.User{
		ID:           uuid.New(),
		Email:        req.Email,
		PasswordHash: hashStr,
		CreatedAt:    time.Now(),
		AccountType:  model.AccountFree,
		Locale:       locale,
	}

	if err := h.users.Create(r.Context(), user); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		return
	}

	tokens, err := h.generateTokens(user.ID.String(), string(user.AccountType))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate tokens"})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"user":   user,
		"tokens": tokens,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user, err := h.users.GetByEmail(r.Context(), req.Email)
	if err != nil || user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	// Check account lockout before verifying password
	if status := h.lockout.CheckLockout(user.ID.String()); status == 429 {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "account_locked"})
		return
	}

	if !auth.VerifyPassword(req.Password, user.PasswordHash) {
		status := h.lockout.RecordFailedAttempt(user.ID.String())
		if status == 429 {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "account_locked"})
		} else {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		}
		return
	}

	// Successful login — reset lockout counter
	h.lockout.ResetAttempts(user.ID.String())

	now := time.Now()
	user.LastLogin = &now
	_ = h.users.UpdateLastLogin(r.Context(), user.ID)

	tokens, err := h.generateTokens(user.ID.String(), string(user.AccountType))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate tokens"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user":   user,
		"tokens": tokens,
	})
}

// Refresh exchanges a valid refresh token for a new access+refresh token pair.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "refreshToken is required"})
		return
	}

	// Pre-parse the refresh token to look up the user's current account type.
	claims, err := auth.ValidateToken(h.keyPair, req.RefreshToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_refresh_token"})
		return
	}

	userID, parseErr := uuid.Parse(claims.Subject)
	accountType := "free"
	if parseErr == nil {
		user, lookupErr := h.users.GetByID(r.Context(), userID)
		if lookupErr == nil && user != nil {
			accountType = string(user.AccountType)
		}
	}

	result, err := auth.RotateRefreshToken(h.keyPair, h.tokenStore, req.RefreshToken, "learner", accountType)
	if err != nil {
		switch err {
		case auth.ErrTokenRevoked:
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "token_revoked"})
		case auth.ErrTokenExpired:
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "token_expired"})
		default:
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_refresh_token"})
		}
		return
	}

	writeJSON(w, http.StatusOK, &model.AuthTokens{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresIn:    int(auth.AccessTokenTTL.Seconds()),
	})
}

func (h *AuthHandler) generateTokens(userID string, accountType string) (*model.AuthTokens, error) {
	accessStr, err := auth.GenerateAccessToken(h.keyPair, userID, "learner", accountType)
	if err != nil {
		return nil, err
	}

	refreshStr, err := auth.GenerateRefreshToken(h.keyPair, userID)
	if err != nil {
		return nil, err
	}

	// Store the refresh token for revocation tracking
	_ = h.tokenStore.StoreRefreshToken(refreshStr, userID)

	return &model.AuthTokens{
		AccessToken:  accessStr,
		RefreshToken: refreshStr,
		ExpiresIn:    int(auth.AccessTokenTTL.Seconds()),
	}, nil
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
