package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	JWTKeyPath     string
	JWTAccessTTL   time.Duration
	JWTRefreshTTL  time.Duration
	AllowedOrigins []string
	Environment    string
	AdminAPIKey    string

	// TrustedProxies is the set of CIDRs (from TRUSTED_PROXIES) whose X-Forwarded-For
	// header we trust when deriving the real client IP for rate limiting. Empty ⇒ trust
	// NO forwarding headers (use the raw TCP peer — spoof-proof). Set this to your
	// reverse-proxy / load-balancer range so per-IP throttling sees real client IPs.
	TrustedProxies []string

	// SessionIdleTTL is the server-side idle cap on a session (from SESSION_IDLE_MINUTES,
	// default 60m; 0 disables it). It's applied as the refresh-token ALLOWLIST TTL, so a
	// session idle longer than this can no longer refresh and is forced to re-login —
	// the server-authoritative backstop behind the client idle-logout. Requires Redis
	// (the in-memory fallback store does not expire). Keep it comfortably longer than the
	// client NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES so normal reading gaps don't force a logout.
	SessionIdleTTL time.Duration

	// Connection pool sizing. With N horizontally-scaled API instances, keep
	// (N × DBMaxConns) under Postgres max_connections (or front it with PgBouncer).
	DBMaxConns int
	DBMinConns int

	// HumanCheckEnabled gates login + registration behind a self-hosted human
	// verification challenge (bot deterrence). Default on; set HUMAN_CHECK_ENABLED
	// =false to turn the whole gate into a no-op (e.g. for non-web API clients that
	// don't render the challenge).
	HumanCheckEnabled bool

	// EmailVerificationRequired blocks a new account from logging in until it confirms
	// the emailed verification link (bot deterrence). Default on. Requires an email
	// sender (SMTP_*); without one, links are written to the server log (dev).
	EmailVerificationRequired bool

	// AppBaseURL is the public web origin used to build verification links (e.g.
	// https://app.yourdomain.ru). Empty ⇒ falls back to the first ALLOWED_ORIGINS entry.
	AppBaseURL string

	// LTI 1.3 platform registration (optional). When LTIIssuer is empty, the LTI
	// endpoints report "not configured".
	LTIIssuer       string
	LTIClientID     string
	LTIDeploymentID string
	LTIAuthURL      string
	LTIJWKSURL      string
	LTIPlatformKey  string // PEM public key, an alternative to LTIJWKSURL for testing
}

func Load() *Config {
	// Fail CLOSED: an UNSET ENVIRONMENT is treated as production so a forgotten env
	// var on a fresh host does NOT silently skip the hardening checks below. Local
	// development must set ENVIRONMENT=development (dev/test also count as dev).
	env := getEnv("ENVIRONMENT", "production")
	isDev := env == "development" || env == "dev" || env == "test"

	cfg := &Config{
		Port:              getEnv("PORT", "8080"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://russkiy:russkiy@localhost:5432/russkiy?sslmode=disable"),
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:         getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTKeyPath:        getEnv("JWT_PRIVATE_KEY_PATH", ""),
		AdminAPIKey:       getEnv("ADMIN_API_KEY", ""),
		LTIIssuer:         getEnv("LTI_ISSUER", ""),
		LTIClientID:       getEnv("LTI_CLIENT_ID", ""),
		LTIDeploymentID:   getEnv("LTI_DEPLOYMENT_ID", ""),
		LTIAuthURL:        getEnv("LTI_AUTH_URL", ""),
		LTIJWKSURL:        getEnv("LTI_JWKS_URL", ""),
		LTIPlatformKey:    getEnv("LTI_PLATFORM_PUBLIC_KEY", ""),
		JWTAccessTTL:      time.Duration(getEnvInt("JWT_ACCESS_TTL_MINUTES", 15)) * time.Minute,
		JWTRefreshTTL:     time.Duration(getEnvInt("JWT_REFRESH_TTL_DAYS", 30)) * 24 * time.Hour,
		Environment:       env,
		DBMaxConns:        getEnvInt("DB_MAX_CONNS", 20),
		DBMinConns:        getEnvInt("DB_MIN_CONNS", 2),
		HumanCheckEnabled: getEnvBool("HUMAN_CHECK_ENABLED", true),

		EmailVerificationRequired: getEnvBool("EMAIL_VERIFICATION_REQUIRED", true),
		AppBaseURL:                getEnv("APP_BASE_URL", ""),
	}

	// Clamp nonsensical (zero / negative) token TTLs back to the safe defaults so a
	// typo in JWT_ACCESS_TTL_MINUTES / JWT_REFRESH_TTL_DAYS can't issue instantly-
	// expired tokens and lock every user out.
	if cfg.JWTAccessTTL <= 0 {
		cfg.JWTAccessTTL = 15 * time.Minute
	}
	if cfg.JWTRefreshTTL <= 0 {
		cfg.JWTRefreshTTL = 30 * 24 * time.Hour
	}

	// Server-side idle cap on a session (0 = disabled). Default 60m — a backstop that is
	// deliberately longer than the client idle-logout so normal reading gaps don't force
	// a re-login, but short enough that a walked-away/bypassed session can't be resumed.
	if m := getEnvInt("SESSION_IDLE_MINUTES", 60); m > 0 {
		cfg.SessionIdleTTL = time.Duration(m) * time.Minute
	}

	// The admin key gates PUBLIC role-escalation + tenant-creation routes, so a short
	// key is dangerous in ANY environment — enforce length unconditionally (not gated
	// on env, which is exactly what an attacker relies on being forgotten).
	if cfg.AdminAPIKey != "" && len(cfg.AdminAPIKey) < 24 {
		log.Fatal("FATAL: ADMIN_API_KEY must be at least 24 characters (or empty to disable the admin routes).")
	}

	// Fail fast in production on insecure defaults rather than silently shipping them.
	if !isDev {
		if cfg.JWTSecret == "dev-secret-change-in-production" {
			log.Println("WARNING: default JWT_SECRET in a non-dev environment — set JWT_SECRET.")
		}
		if cfg.JWTKeyPath == "" {
			log.Fatal("FATAL: JWT_PRIVATE_KEY_PATH must be set in production (an ephemeral key breaks multi-replica auth and invalidates all tokens on restart).")
		}
		// Refuse the default localhost/default-credential DSN and any TLS-disabled DSN
		// in production instead of silently connecting insecurely.
		if os.Getenv("DATABASE_URL") == "" {
			log.Fatal("FATAL: DATABASE_URL must be set explicitly in production.")
		}
		if strings.Contains(cfg.DatabaseURL, "sslmode=disable") || strings.Contains(cfg.DatabaseURL, "sslmode=allow") {
			log.Fatal("FATAL: DATABASE_URL must not disable TLS in production (drop sslmode=disable/allow).")
		}
		// Never ship the localhost CORS default to the public — require the real origin(s).
		if os.Getenv("ALLOWED_ORIGINS") == "" {
			log.Fatal("FATAL: ALLOWED_ORIGINS must be set in production (your web origin, e.g. https://app.yourdomain.ru).")
		}
		// WARN (not fatal — a directly-exposed API legitimately has none): behind a
		// reverse proxy an empty TRUSTED_PROXIES makes every request look like it comes
		// from the proxy, so the per-IP auth throttle collapses to one shared bucket
		// (site-wide self-DoS) and can't isolate an attacker. Set it to your proxy CIDR.
		if os.Getenv("TRUSTED_PROXIES") == "" {
			log.Println("WARNING: TRUSTED_PROXIES is empty — if this API sits behind a reverse proxy/LB, the per-IP auth throttle will see the proxy IP for every request (one shared bucket = self-DoS). Set it to your proxy CIDR, or ignore if the API is directly internet-exposed.")
		}
	}

	// C6 audit fix — configurable CORS origins via env var
	originsEnv := os.Getenv("ALLOWED_ORIGINS")
	if originsEnv != "" {
		cfg.AllowedOrigins = strings.Split(originsEnv, ",")
	} else {
		cfg.AllowedOrigins = []string{"http://localhost:3000", "http://localhost:3939", "http://localhost:8081"}
	}

	// Trusted reverse-proxy CIDRs (comma-separated) for safe client-IP derivation.
	if tp := os.Getenv("TRUSTED_PROXIES"); tp != "" {
		for _, c := range strings.Split(tp, ",") {
			if c = strings.TrimSpace(c); c != "" {
				cfg.TrustedProxies = append(cfg.TrustedProxies, c)
			}
		}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}
