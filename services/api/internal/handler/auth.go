package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/email"
	"github.com/russkiy/api/internal/legal"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/model"
	"github.com/russkiy/api/internal/store"
)

// emailRegex is a basic email format validation pattern (C3 audit fix).
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// validateDOB parses an ISO "YYYY-MM-DD" birth date collected at registration and returns
// the normalized date string plus the age in whole years. It rejects empty, malformed,
// future, or implausible (>120y) dates. Age is the authoritative under-18 (minor) signal.
func validateDOB(s string) (iso string, age int, err error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", 0, errors.New("date of birth is required")
	}
	dob, perr := time.Parse("2006-01-02", s)
	if perr != nil {
		return "", 0, errors.New("invalid date of birth")
	}
	now := time.Now()
	if dob.After(now) {
		return "", 0, errors.New("date of birth cannot be in the future")
	}
	age = now.Year() - dob.Year()
	if now.YearDay() < dob.YearDay() {
		age-- // birthday hasn't occurred yet this year
	}
	if age > 120 {
		return "", 0, errors.New("invalid date of birth")
	}
	return dob.Format("2006-01-02"), age, nil
}

type AuthHandler struct {
	users       *store.UserStore
	keyPair     *auth.KeyPair
	tokenStore  auth.TokenStore
	lockout     auth.Lockout
	verify      *store.EmailVerifyStore
	mailer      email.Sender
	appURL      string // web origin for building verification links, e.g. https://app.domain.ru
	requireVerify bool // when true, unverified accounts can't log in (block-until-verified)
	legal       *store.LegalConsentStore
}

func NewAuthHandler(users *store.UserStore, kp *auth.KeyPair, ts auth.TokenStore, lm auth.Lockout, verify *store.EmailVerifyStore, mailer email.Sender, appURL string, requireVerify bool, legal *store.LegalConsentStore) *AuthHandler {
	return &AuthHandler{users: users, keyPair: kp, tokenStore: ts, lockout: lm, verify: verify, mailer: mailer, appURL: strings.TrimRight(appURL, "/"), requireVerify: requireVerify, legal: legal}
}

// clientIPFromRequest reads the real client IP (TrustedRealIP has already rewritten
// r.RemoteAddr to it) for the consent audit trail.
func clientIPFromRequest(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// verifyTokenTTL bounds how long an emailed verification link stays valid.
const verifyTokenTTL = 24 * time.Hour

// sendVerification issues a token and emails the verification link (best-effort; a mail
// failure is logged but doesn't fail the signup — the user can request a resend).
func (h *AuthHandler) sendVerification(ctx context.Context, u *model.User) {
	if h.verify == nil || h.mailer == nil {
		return
	}
	raw, err := h.verify.CreateToken(ctx, u.ID, u.Email, verifyTokenTTL)
	if err != nil {
		log.Printf("verification: failed to create token for %s: %v", u.ID, err)
		return
	}
	link := h.appURL + "/verify-email?token=" + url.QueryEscape(raw)
	body := "Welcome to Russkiy!\r\n\r\nPlease confirm your email address to activate your account:\r\n\r\n" +
		link + "\r\n\r\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email."
	if err := h.mailer.Send(u.Email, "Confirm your Russkiy email", body); err != nil {
		log.Printf("verification: failed to send email to %s: %v", u.Email, err)
	}
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

	// Normalize the email (lower-case + trim) so uniqueness + lookups are consistent
	// regardless of how it was typed.
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	// Email format validation (C3 audit fix)
	if !emailRegex.MatchString(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email format"})
		return
	}

	// A display name is required and must be globally unique (case-insensitive). Bound
	// the length so it can't be used to bloat rows.
	name := strings.TrimSpace(req.Name)
	if n := len([]rune(name)); n < 2 || n > 40 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "please choose a display name (2–40 characters)"})
		return
	}

	// Date of birth is required — the authoritative age signal. If it shows the learner is
	// under 18 the client presents (and the account holder gives) a guardian consent; the
	// stored date lets an auditor verify minor status against the recorded consent.
	dobISO, age, dobErr := validateDOB(req.DateOfBirth)
	if dobErr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": dobErr.Error(), "field": "dateOfBirth"})
		return
	}
	isMinor := age < 18

	// Two SEPARATE, mandatory acceptances (152-FZ as amended 1 Sept 2025 — consent to
	// personal-data processing must be a standalone act, not bundled with the Terms).
	if !req.AcceptedTerms {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "you must accept the Terms of Service to create an account", "field": "terms"})
		return
	}
	if !req.AcceptedDataProcessing {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "you must give consent to the processing of your personal data to create an account", "field": "dataProcessing"})
		return
	}

	if msg := validatePassword(req.Password); msg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
		return
	}

	// Friendly pre-checks (the DB unique indexes are the authoritative, race-safe guard
	// enforced in UserStore.Create below).
	if existing, _ := h.users.GetByEmail(r.Context(), req.Email); existing != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "email already registered", "field": "email"})
		return
	}
	if taken, _ := h.users.NameTaken(r.Context(), name); taken {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "that display name is already taken", "field": "name"})
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

	// Self-registration may claim the "teacher" role (independent instructor) — but
	// nothing higher. Whitelist strictly: dean/admin are provisioned out-of-band, so
	// a signup request can never mint one. Empty/unknown → default learner (via Create).
	role := ""
	if strings.EqualFold(strings.TrimSpace(req.Role), "teacher") {
		role = "teacher"
	}

	user := &model.User{
		ID:           uuid.New(),
		Email:        req.Email,
		PasswordHash: hashStr,
		CreatedAt:    time.Now(),
		AccountType:  model.AccountFree,
		Locale:       locale,
		Role:         role,
		DisplayName:  name,
		DateOfBirth:  &dobISO,
		// When verification is required, new accounts start UNVERIFIED and can't log in
		// until they confirm the emailed link. When it's disabled, they're born verified.
		EmailVerified: !h.requireVerify,
	}

	if err := h.users.Create(r.Context(), user); err != nil {
		// Race-safe uniqueness: a concurrent signup that slipped past the pre-check is
		// caught here by the DB unique index and reported on the exact field.
		switch {
		case errors.Is(err, store.ErrEmailTaken):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "email already registered", "field": "email"})
		case errors.Is(err, store.ErrNameTaken):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "that display name is already taken", "field": "name"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create user"})
		}
		return
	}

	// Record the auditable clickwrap consent (server-side versions + IP + user agent).
	// Best-effort: a logging failure must not block the signup the user just completed,
	// but it IS logged loudly so a gap in the audit trail is noticed.
	if h.legal != nil {
		v := legal.Current()
		ua := r.UserAgent()
		if len(ua) > 512 {
			ua = ua[:512]
		}
		if err := h.legal.Record(r.Context(), user.ID, v.Terms, v.Privacy, v.Cookie, v.Consent, clientIPFromRequest(r), ua); err != nil {
			log.Printf("legal consent: failed to record for %s: %v", user.ID, err)
		} else if isMinor {
			// Breadcrumb for the audit trail: for an under-18 registrant the data-processing
			// consent is given by the account holder as the child's parent/legal guardian.
			log.Printf("legal consent: recorded as GUARDIAN consent for under-18 account %s (dob=%s)", user.ID, dobISO)
		}
	}

	// Block-until-verified: do NOT issue a session. Email the verification link and tell
	// the client to show "check your email" — the account is unusable until confirmed.
	// This is the real bot deterrent (a bot with no reachable inbox can never proceed).
	if h.requireVerify {
		h.sendVerification(r.Context(), user)
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"verificationRequired": true,
			"email":                user.Email,
		})
		return
	}

	// Verification disabled — behave as before and sign them straight in.
	tokens, err := h.generateTokens(user.ID.String(), string(user.AccountType), user.Role)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate tokens"})
		return
	}

	setAuthCookies(w, r, tokens)
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"user":   user,
		"tokens": tokens,
	})
}

// CheckAvailability reports whether an email and/or display name are free, so the signup
// form can warn the user INLINE (on blur) before they fill out the rest of the form.
// Only the fields provided (and well-formed) are checked. IP-throttled. This exposes the
// same email-existence info as the register 409 — an accepted tradeoff for this consumer
// app — just surfaced earlier for a better signup experience.
func (h *AuthHandler) CheckAvailability(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	resp := map[string]bool{}
	if e := strings.ToLower(strings.TrimSpace(req.Email)); e != "" && emailRegex.MatchString(e) {
		u, _ := h.users.GetByEmail(r.Context(), e)
		resp["emailAvailable"] = u == nil
	}
	if n := strings.TrimSpace(req.Name); len([]rune(n)) >= 2 {
		taken, _ := h.users.NameTaken(r.Context(), n)
		resp["nameAvailable"] = !taken
	}
	writeJSON(w, http.StatusOK, resp)
}

// VerifyEmail confirms an emailed verification link (POST /auth/verify-email {token}).
// On success the account may log in. A consumed/expired/unknown token returns 400.
func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Token) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}
	if h.verify == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "verification is not enabled"})
		return
	}
	if _, err := h.verify.Verify(r.Context(), strings.TrimSpace(req.Token)); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "this verification link is invalid or has expired"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"verified": true})
}

// ResendVerification re-sends a verification link (POST /auth/resend-verification {email}).
// Always 200 so it never reveals whether an email exists; the mail is only sent when the
// account exists and is still unverified.
func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	addr := strings.ToLower(strings.TrimSpace(req.Email))
	if u, err := h.users.GetByEmail(r.Context(), addr); err == nil && u != nil && !u.EmailVerified {
		h.sendVerification(r.Context(), u)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// LegalVersions (GET /v1/legal/versions, public) returns the current document versions
// so the signup form can link to and record the right ones.
func (h *AuthHandler) LegalVersions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, legal.Current())
}

// MyLegalConsents (GET /v1/me/legal-consents, auth) returns the caller's own consent
// audit trail — their copy of what they agreed to, when, and from where.
func (h *AuthHandler) MyLegalConsents(w http.ResponseWriter, r *http.Request) {
	uid := middleware.GetUserID(r.Context())
	id, err := uuid.Parse(uid)
	if uid == "" || err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if h.legal == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	list, err := h.legal.ListForUser(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load consents"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	user, err := h.users.GetByEmail(r.Context(), req.Email)
	if err != nil || user == nil {
		// Run a throwaway bcrypt compare so an unknown email costs the same as a known
		// one — prevents email enumeration by response latency. (The public /auth/token
		// route is also IP-throttled in main.go for the volume side of the attack.)
		auth.DummyVerify(req.Password)
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

	// Block-until-verified: a correct password is NOT enough — the email must be
	// confirmed first. Re-issue a fresh verification link (best-effort) so a user who
	// lost the first one can just try to sign in again. Checked only after the password
	// verifies, so this never reveals verification status to a wrong-password attempt.
	if h.requireVerify && !user.EmailVerified {
		h.sendVerification(r.Context(), user)
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "email_not_verified", "email": user.Email})
		return
	}

	// Portal binding — the sign-in page a request comes from is bound to exactly
	// one role. A valid credential presented at the wrong portal (e.g. admin
	// credentials at the learner sign-in) is REFUSED here instead of issuing a
	// token. This is the actual boundary; the client merely hides the wrong
	// pages. Runs only after the password is verified, so a caller reaching the
	// "wrong_portal" branch already holds the correct password — naming the
	// account's portal therefore leaks nothing an attacker doesn't already have.
	reqPortal := strings.ToLower(strings.TrimSpace(req.Portal))
	if reqPortal == "" {
		reqPortal = "learner" // fail-safe default (mobile / legacy clients are learner-facing)
	}
	if !knownPortal(reqPortal) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown_portal"})
		return
	}
	wantPortal := portalForRole(user.Role)
	if reqPortal != wantPortal {
		log.Printf("auth: login refused — %s account attempted the %q portal", wantPortal, reqPortal)
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error":  "wrong_portal",
			"portal": wantPortal,
		})
		return
	}
	log.Printf("auth: login ok via %q portal", wantPortal)

	now := time.Now()
	user.LastLogin = &now
	_ = h.users.UpdateLastLogin(r.Context(), user.ID)

	tokens, err := h.generateTokens(user.ID.String(), string(user.AccountType), user.Role)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate tokens"})
		return
	}

	setAuthCookies(w, r, tokens)
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
	_ = json.NewDecoder(r.Body).Decode(&req)
	// Prefer the httpOnly refresh cookie (web, same-origin); fall back to the JSON
	// body (mobile/Bearer clients).
	if req.RefreshToken == "" {
		if c, err := r.Cookie(refreshCookie); err == nil {
			req.RefreshToken = c.Value
		}
	}
	if req.RefreshToken == "" {
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
	role := "learner"
	if parseErr == nil {
		user, lookupErr := h.users.GetByID(r.Context(), userID)
		if lookupErr == nil && user != nil {
			accountType = string(user.AccountType)
			if user.Role != "" {
				role = user.Role
			}
		}
	}

	result, err := auth.RotateRefreshToken(h.keyPair, h.tokenStore, req.RefreshToken, role, accountType)
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

	tokens := &model.AuthTokens{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		ExpiresIn:    int(auth.AccessTokenTTL.Seconds()),
	}
	setAuthCookies(w, r, tokens)
	writeJSON(w, http.StatusOK, tokens)
}

// Logout revokes the caller's refresh token and clears the auth cookies.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.RefreshToken == "" {
		if c, err := r.Cookie(refreshCookie); err == nil {
			req.RefreshToken = c.Value
		}
	}
	if req.RefreshToken != "" {
		if claims, err := auth.ValidateToken(h.keyPair, req.RefreshToken); err == nil {
			_ = h.tokenStore.RevokeRefreshToken(claims.ID)
		}
	}
	clearAuthCookies(w, r)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DeleteAccount is the right-to-erasure endpoint (DELETE /v1/me): it deletes the
// authenticated caller's user row, which CASCADE-purges their profiles, sessions,
// skills, analytics events, and consent records, then clears the auth cookies.
func (h *AuthHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	uid, err := uuid.Parse(userID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if err := h.users.DeleteByID(r.Context(), uid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete account"})
		return
	}
	clearAuthCookies(w, r)
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

func (h *AuthHandler) generateTokens(userID, accountType, role string) (*model.AuthTokens, error) {
	if role == "" {
		role = "learner"
	}
	accessStr, err := auth.GenerateAccessToken(h.keyPair, userID, role, accountType)
	if err != nil {
		return nil, err
	}

	refreshStr, refreshJTI, err := auth.GenerateRefreshToken(h.keyPair, userID)
	if err != nil {
		return nil, err
	}

	// Allowlist the refresh token by its jti (the same key logout/rotate revoke by).
	_ = h.tokenStore.StoreRefreshToken(refreshJTI, userID)

	return &model.AuthTokens{
		AccessToken:  accessStr,
		RefreshToken: refreshStr,
		ExpiresIn:    int(auth.AccessTokenTTL.Seconds()),
	}, nil
}

// portalForRole returns the single sign-in portal an account with the given role
// is permitted to authenticate through. Learner is the default for the learner
// role and any unrecognised/empty role, so the mapping fails safe.
func portalForRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "teacher":
		return "teacher"
	case "dean":
		return "dean"
	case "admin":
		return "admin"
	default:
		return "learner"
	}
}

// knownPortal reports whether p is a recognised portal identifier.
func knownPortal(p string) bool {
	switch p {
	case "learner", "teacher", "dean", "admin":
		return true
	default:
		return false
	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
