package config

import (
	"testing"
	"time"
)

// TestTokenTTLsAreConfigurable guards the fix for the previously-dead TTL env vars:
// JWT_ACCESS_TTL_MINUTES / JWT_REFRESH_TTL_DAYS must actually flow into the config
// (they used to be loaded and never read, so operators couldn't tune session length).
func TestTokenTTLsAreConfigurable(t *testing.T) {
	t.Setenv("ENVIRONMENT", "development") // stay out of the prod fail-fast guards
	t.Setenv("JWT_ACCESS_TTL_MINUTES", "10")
	t.Setenv("JWT_REFRESH_TTL_DAYS", "7")

	cfg := Load()
	if cfg.JWTAccessTTL != 10*time.Minute {
		t.Fatalf("JWTAccessTTL = %s, want 10m", cfg.JWTAccessTTL)
	}
	if cfg.JWTRefreshTTL != 7*24*time.Hour {
		t.Fatalf("JWTRefreshTTL = %s, want 168h", cfg.JWTRefreshTTL)
	}
}

// TestTokenTTLsClampNonPositive proves a typo like JWT_ACCESS_TTL_MINUTES=0 can't
// issue instantly-expired tokens and lock everyone out — it clamps to the default.
func TestTokenTTLsClampNonPositive(t *testing.T) {
	t.Setenv("ENVIRONMENT", "development")
	t.Setenv("JWT_ACCESS_TTL_MINUTES", "0")
	t.Setenv("JWT_REFRESH_TTL_DAYS", "-5")

	cfg := Load()
	if cfg.JWTAccessTTL != 15*time.Minute {
		t.Fatalf("JWTAccessTTL = %s, want clamp to 15m", cfg.JWTAccessTTL)
	}
	if cfg.JWTRefreshTTL != 30*24*time.Hour {
		t.Fatalf("JWTRefreshTTL = %s, want clamp to 720h", cfg.JWTRefreshTTL)
	}
}
