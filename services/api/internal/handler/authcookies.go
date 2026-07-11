package handler

import (
	"net/http"
	"unicode"

	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/model"
)

// Auth is issued BOTH as JSON (back-compat: mobile, LTI, Bearer clients) and as
// httpOnly cookies. When the web app is served same-origin (via the Next.js
// proxy), the cookies carry auth so tokens never touch JavaScript — closing the
// localStorage/XSS exposure.
//
// Both cookies use Path="/" DELIBERATELY. The web client reaches the API through the
// Next.js proxy (browser path /api/v1/auth/...) while mobile/Bearer clients hit
// /v1/auth/... directly — there is no single narrow path that matches both, so
// scoping the refresh cookie to "/v1/auth" would silently break refresh through the
// proxy. The refresh token is long-lived; SameSite=Lax + HttpOnly + Secure (on HTTPS)
// bound its exposure, and revocation is jti-keyed so a leaked token can be killed.

const (
	accessCookie  = "access_token"
	refreshCookie = "refresh_token"
)

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

func setAuthCookies(w http.ResponseWriter, r *http.Request, t *model.AuthTokens) {
	secure := isHTTPS(r)
	http.SetCookie(w, &http.Cookie{
		Name: accessCookie, Value: t.AccessToken, Path: "/",
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
		MaxAge: int(auth.AccessTokenTTL.Seconds()),
	})
	http.SetCookie(w, &http.Cookie{
		Name: refreshCookie, Value: t.RefreshToken, Path: "/",
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
		MaxAge: int(auth.RefreshTokenTTL.Seconds()),
	})
}

func clearAuthCookies(w http.ResponseWriter, r *http.Request) {
	secure := isHTTPS(r)
	for _, c := range []struct{ name, path string }{{accessCookie, "/"}, {refreshCookie, "/"}} {
		http.SetCookie(w, &http.Cookie{Name: c.name, Value: "", Path: c.path, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	}
}

// validatePassword enforces a baseline policy: at least 10 chars with letters and
// digits. (Length is the dominant factor in password strength.)
func validatePassword(pw string) string {
	if len(pw) < 10 {
		return "password must be at least 10 characters"
	}
	var hasLetter, hasDigit bool
	for _, c := range pw {
		if unicode.IsLetter(c) {
			hasLetter = true
		}
		if unicode.IsDigit(c) {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return "password must include both letters and numbers"
	}
	return ""
}
