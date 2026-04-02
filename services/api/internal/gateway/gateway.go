package gateway

import (
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/middleware"
)

// Config holds gateway configuration.
type Config struct {
	PublicKey      *rsa.PublicKey
	AllowedOrigins []string
	RateLimiter    *middleware.RateLimiter
}

// NewRouter builds a chi router with auth middleware, rate limiting, CORS,
// and versioned routing. Handler functions are injected so this can be tested
// without a real database.
func NewRouter(cfg Config, profileHandler http.HandlerFunc, sessionV1Handler http.HandlerFunc, sessionV2Handler http.HandlerFunc) *chi.Mux {
	r := chi.NewRouter()

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Request body size limit (S6 audit fix)
	r.Use(middleware.MaxBodySize(1 << 20)) // 1 MB

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// v1 routes
	r.Route("/v1", func(r chi.Router) {
		// Public
		r.Post("/auth/token", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(200)
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		})

		// Protected
		r.Group(func(r chi.Router) {
			r.Use(middleware.JWTAuth(cfg.PublicKey))
			if cfg.RateLimiter != nil {
				r.Use(cfg.RateLimiter.RateLimit())
			}

			r.Get("/profiles/me", profileHandler)
			r.Post("/sessions/generate", sessionV1Handler)
		})
	})

	// v2 routes (when deployed)
	if sessionV2Handler != nil {
		r.Route("/v2", func(r chi.Router) {
			r.Group(func(r chi.Router) {
				r.Use(middleware.JWTAuth(cfg.PublicKey))
				if cfg.RateLimiter != nil {
					r.Use(cfg.RateLimiter.RateLimit())
				}
				r.Post("/sessions/generate", sessionV2Handler)
			})
		})
	}

	// Catch-all for unknown API versions (/v99/anything, etc.)
	r.HandleFunc("/v{version}/*", func(w http.ResponseWriter, r *http.Request) {
		version := chi.URLParam(r, "version")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":              "unknown_api_version",
			"requested_version":  "v" + version,
			"available_versions": availableVersions(sessionV2Handler != nil),
		})
	})

	return r
}

func availableVersions(hasV2 bool) []string {
	versions := []string{"v1"}
	if hasV2 {
		versions = append(versions, "v2")
	}
	return versions
}

// GenerateTestToken creates a signed RS256 JWT for testing.
func GenerateTestToken(kp *auth.KeyPair, userID, accountType string, ttl time.Duration) (string, error) {
	return auth.GenerateAccessToken(kp, userID, "learner", accountType)
}
