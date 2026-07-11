package handler

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/model"
	"github.com/russkiy/api/internal/store"
)

// LTI 1.3 claim URIs (IMS Global spec).
const (
	claimMessageType = "https://purl.imsglobal.org/spec/lti/claim/message_type"
	claimVersion     = "https://purl.imsglobal.org/spec/lti/claim/version"
	claimDeployment  = "https://purl.imsglobal.org/spec/lti/claim/deployment_id"
)

type LTIConfig struct {
	Issuer         string
	ClientID       string
	DeploymentID   string
	AuthURL        string
	JWKSURL        string
	PlatformKeyPEM string
}

// LTIHandler implements an LTI 1.3 Resource Link launch: the OIDC third-party
// login initiation and the launch endpoint that verifies the platform's signed
// id_token and single-sign-on provisions the user.
type LTIHandler struct {
	cfg        LTIConfig
	users      *store.UserStore
	keyPair    *auth.KeyPair
	tokenStore auth.TokenStore
	state      LTIStateStore
}

func NewLTIHandler(cfg LTIConfig, users *store.UserStore, kp *auth.KeyPair, ts auth.TokenStore, state LTIStateStore) *LTIHandler {
	return &LTIHandler{cfg: cfg, users: users, keyPair: kp, tokenStore: ts, state: state}
}

func (h *LTIHandler) configured() bool { return h.cfg.Issuer != "" && h.cfg.ClientID != "" }

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func launchURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + r.Host + "/v1/lti/launch"
}

// Login is the OIDC third-party login initiation: it redirects the browser to
// the platform's authorization endpoint to obtain the launch id_token.
func (h *LTIHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "LTI is not configured (set LTI_ISSUER, LTI_CLIENT_ID, LTI_AUTH_URL)"})
		return
	}
	_ = r.ParseForm()
	if iss := r.FormValue("iss"); iss != "" && iss != h.cfg.Issuer {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown issuer"})
		return
	}
	state := randHex(16)
	nonce := randHex(16)
	// Bind state→nonce so the launch can prove the id_token came from a login we
	// initiated, and consume it exactly once (replay protection).
	if h.state != nil {
		_ = h.state.SaveState(state, nonce)
	}
	q := url.Values{}
	q.Set("scope", "openid")
	q.Set("response_type", "id_token")
	q.Set("response_mode", "form_post")
	q.Set("prompt", "none")
	q.Set("client_id", h.cfg.ClientID)
	q.Set("redirect_uri", launchURL(r))
	q.Set("login_hint", r.FormValue("login_hint"))
	q.Set("lti_message_hint", r.FormValue("lti_message_hint"))
	q.Set("state", state)
	q.Set("nonce", nonce)
	http.Redirect(w, r, h.cfg.AuthURL+"?"+q.Encode(), http.StatusFound)
}

// Launch validates the platform's id_token and SSOs the user.
func (h *LTIHandler) Launch(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "LTI is not configured"})
		return
	}
	_ = r.ParseForm()
	idToken := r.FormValue("id_token")
	if idToken == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing id_token"})
		return
	}

	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(idToken, claims, h.keyFunc, jwt.WithValidMethods([]string{"RS256"})); err != nil {
		// Log the specific library error server-side, but return a generic message —
		// echoing jwt/JWKS internals to an unauthenticated caller fingerprints the
		// verification path/key setup.
		log.Printf("LTI launch id_token validation failed: %v", err)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid id_token"})
		return
	}

	if iss, _ := claims["iss"].(string); iss != h.cfg.Issuer {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "issuer mismatch"})
		return
	}
	if !audienceMatches(claims["aud"], h.cfg.ClientID) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "audience mismatch"})
		return
	}
	if mt, _ := claims[claimMessageType].(string); mt != "LtiResourceLinkRequest" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unexpected message_type"})
		return
	}
	if v, _ := claims[claimVersion].(string); v != "1.3.0" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported LTI version"})
		return
	}
	if h.cfg.DeploymentID != "" {
		if d, _ := claims[claimDeployment].(string); d != h.cfg.DeploymentID {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "deployment_id mismatch"})
			return
		}
	}

	// Replay protection: the launch must carry a `state` we issued at login, and
	// the id_token's `nonce` must match the one we bound to that state. Consuming
	// the state is atomic and single-use, so re-POSTing the same id_token (or
	// reusing a state) is rejected. Skipped only if no state store is wired.
	if h.state != nil {
		state := r.FormValue("state")
		expectedNonce, ok := h.state.ConsumeState(state)
		tokenNonce, _ := claims["nonce"].(string)
		if !ok || tokenNonce == "" || tokenNonce != expectedNonce {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid or replayed state/nonce"})
			return
		}
	}

	// SSO: find or create the user.
	email, _ := claims["email"].(string)
	sub, _ := claims["sub"].(string)
	if email == "" {
		email = "lti-" + sub + "@lti.local"
	}
	user, _ := h.users.GetByEmail(r.Context(), email)
	if user == nil {
		hash, _ := auth.HashPassword(randHex(24))
		user = &model.User{ID: uuid.New(), Email: email, PasswordHash: hash, CreatedAt: time.Now(), AccountType: model.AccountFree, Locale: "en-US", Role: "learner"}
		if err := h.users.Create(r.Context(), user); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to provision user"})
			return
		}
	}

	access, err := auth.GenerateAccessToken(h.keyPair, user.ID.String(), user.Role, string(user.AccountType))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to issue token"})
		return
	}
	refresh, refreshJTI, _ := auth.GenerateRefreshToken(h.keyPair, user.ID.String())
	_ = h.tokenStore.StoreRefreshToken(refreshJTI, user.ID.String())

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"sso":  true,
		"user": map[string]string{"id": user.ID.String(), "email": user.Email, "role": user.Role},
		"tokens": model.AuthTokens{
			AccessToken:  access,
			RefreshToken: refresh,
			ExpiresIn:    int(auth.AccessTokenTTL.Seconds()),
		},
	})
}

func (h *LTIHandler) keyFunc(t *jwt.Token) (interface{}, error) {
	if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
		return nil, errors.New("unexpected signing method")
	}
	if h.cfg.PlatformKeyPEM != "" {
		return jwt.ParseRSAPublicKeyFromPEM([]byte(h.cfg.PlatformKeyPEM))
	}
	if h.cfg.JWKSURL != "" {
		kid, _ := t.Header["kid"].(string)
		return h.jwksKey(kid)
	}
	return nil, errors.New("no LTI verification key configured")
}

func (h *LTIHandler) jwksKey(kid string) (*rsa.PublicKey, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(h.cfg.JWKSURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var jwks struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, err
	}
	for _, k := range jwks.Keys {
		if k.Kty == "RSA" && (k.Kid == kid || kid == "") {
			return rsaFromJWK(k.N, k.E)
		}
	}
	return nil, errors.New("no matching JWKS key")
}

func rsaFromJWK(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nStr)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eStr)
	if err != nil {
		return nil, err
	}
	e := 0
	for _, b := range eBytes {
		e = e<<8 | int(b)
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: e}, nil
}

func audienceMatches(aud interface{}, clientID string) bool {
	switch v := aud.(type) {
	case string:
		return v == clientID
	case []interface{}:
		for _, a := range v {
			if s, ok := a.(string); ok && s == clientID {
				return true
			}
		}
	}
	return false
}
