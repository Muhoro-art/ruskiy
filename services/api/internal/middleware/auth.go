package middleware

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/russkiy/api/internal/auth"
)

type contextKey string

const UserIDKey contextKey = "userID"
const RoleKey contextKey = "role"

// JWTAuth validates bearer tokens using RSA (RS256) signing.
// On success it injects the user ID and role into the request context and sets
// the X-User-ID header for downstream services.
func JWTAuth(publicKey *rsa.PublicKey) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Accept the token from the Authorization: Bearer header (mobile/Bearer
			// clients) OR the httpOnly `access_token` cookie (web, same-origin) so the
			// browser never needs the token in JavaScript.
			tokenStr := ""
			if authHeader := r.Header.Get("Authorization"); authHeader != "" {
				parts := strings.SplitN(authHeader, " ", 2)
				if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					json.NewEncoder(w).Encode(map[string]string{"error": "invalid_authorization_format"})
					return
				}
				tokenStr = parts[1]
			} else if c, err := r.Cookie("access_token"); err == nil {
				tokenStr = c.Value
			}
			if tokenStr == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "missing_auth_token"})
				return
			}

			claims := &auth.TokenClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return publicKey, nil
			})
			if err != nil || !token.Valid {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid_or_expired_token"})
				return
			}

			// Only ACCESS tokens authorize API calls. Refresh tokens (typ="refresh")
			// are signed with the same key but must not be usable as bearer tokens.
			if claims.Type != "access" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid_token_type"})
				return
			}

			userID := claims.Subject
			if userID == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid_token_subject"})
				return
			}

			// Inject X-User-ID header for downstream services
			r.Header.Set("X-User-ID", userID)

			// Extract account tier and role from typed claims
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			if claims.AccountType != "" {
				ctx = context.WithValue(ctx, AccountTierKey, claims.AccountType)
			}
			if claims.Role != "" {
				ctx = context.WithValue(ctx, RoleKey, claims.Role)
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// MaxBodySize returns middleware that limits the size of request bodies.
// Prevents memory exhaustion from oversized payloads (S6 audit fix).
func MaxBodySize(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireRole returns middleware that restricts access to users with the specified role.
func RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userRole := GetRole(r.Context())
			if userRole != role {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "insufficient_permissions"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAnyRole restricts access to users holding ANY of the given roles.
func RequireAnyRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !allowed[GetRole(r.Context())] {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "insufficient_permissions"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// GetUserID extracts the user ID from the request context.
func GetUserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

// GetRole extracts the user role from the request context.
func GetRole(ctx context.Context) string {
	if v, ok := ctx.Value(RoleKey).(string); ok {
		return v
	}
	return ""
}
