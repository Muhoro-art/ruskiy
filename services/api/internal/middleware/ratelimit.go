package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// RateLimitConfig configures per-tier rate limits.
type RateLimitConfig struct {
	FreeLimitPerMin    int
	PremiumLimitPerMin int
	WindowDuration     time.Duration
}

// DefaultRateLimitConfig returns the default rate limit configuration.
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		FreeLimitPerMin:    100,
		PremiumLimitPerMin: 1000,
		WindowDuration:     60 * time.Second,
	}
}

type userWindow struct {
	count     int
	windowEnd time.Time
}

// RateLimiter is a per-user sliding window rate limiter.
type RateLimiter struct {
	mu      sync.Mutex
	windows map[string]*userWindow
	config  RateLimitConfig
}

// NewRateLimiter creates a new rate limiter and starts a background sweeper that
// evicts expired windows, so the map doesn't grow unbounded (one entry per distinct
// user for the process lifetime). This limiter is only the Redis-unavailable
// fallback, but a churning user base under a Redis outage would otherwise leak memory.
func NewRateLimiter(cfg RateLimitConfig) *RateLimiter {
	rl := &RateLimiter{
		windows: make(map[string]*userWindow),
		config:  cfg,
	}
	go rl.sweep()
	return rl
}

// sweep periodically deletes expired windows to bound memory.
func (rl *RateLimiter) sweep() {
	interval := rl.config.WindowDuration
	if interval <= 0 {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for k, w := range rl.windows {
			if now.After(w.windowEnd) {
				delete(rl.windows, k)
			}
		}
		rl.mu.Unlock()
	}
}

// TierKey is the context key for the user's account tier.
type tierKey string

const AccountTierKey tierKey = "accountTier"

// RateLimit returns a middleware that enforces per-user rate limits.
// It reads the user ID from UserIDKey context and the tier from AccountTierKey context.
func (rl *RateLimiter) RateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := GetUserID(r.Context())
			if userID == "" {
				// No user ID means the request wasn't authenticated; skip rate limiting
				next.ServeHTTP(w, r)
				return
			}

			// Determine tier limit
			tier, _ := r.Context().Value(AccountTierKey).(string)
			limit := rl.config.FreeLimitPerMin
			if tier == "premium" || tier == "institutional" {
				limit = rl.config.PremiumLimitPerMin
			}

			rl.mu.Lock()
			now := time.Now()
			win, exists := rl.windows[userID]
			if !exists || now.After(win.windowEnd) {
				win = &userWindow{
					count:     0,
					windowEnd: now.Add(rl.config.WindowDuration),
				}
				rl.windows[userID] = win
			}
			win.count++
			count := win.count
			remaining := win.windowEnd.Sub(now)
			rl.mu.Unlock()

			if count > limit {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(remaining.Seconds())+1))
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "rate_limit_exceeded",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
