package redisstore

import (
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/russkiy/api/internal/middleware"
)

// RateLimiter is a Redis-backed per-user fixed-window rate limiter. Because the
// counters live in Redis, the limit is enforced consistently across all replicas
// (not multiplied by replica count as the in-memory version was).
type RateLimiter struct {
	rdb          *redis.Client
	freeLimit    int
	premiumLimit int
	window       time.Duration
	fallback     *memLimiter // in-process backstop used only when Redis errors
}

func NewRateLimiter(rdb *redis.Client, freeLimit, premiumLimit int, window time.Duration) *RateLimiter {
	return &RateLimiter{rdb: rdb, freeLimit: freeLimit, premiumLimit: premiumLimit, window: window, fallback: newMemLimiter()}
}

func (rl *RateLimiter) RateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := middleware.GetUserID(r.Context())
			if userID == "" {
				next.ServeHTTP(w, r) // unauthenticated requests aren't per-user limited here
				return
			}

			limit := rl.freeLimit
			if tier, _ := r.Context().Value(middleware.AccountTierKey).(string); tier == "premium" || tier == "institutional" {
				limit = rl.premiumLimit
			}

			ctx, cancel := opCtx()
			defer cancel()
			key := "rl:" + userID
			cnt, err := rl.rdb.Incr(ctx, key).Result()
			if err != nil {
				// Redis down: fall back to a per-instance in-process limiter so
				// requests are still bounded instead of failing fully open.
				if rl.fallback.incr(userID, rl.window) > limit {
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("Retry-After", fmt.Sprintf("%d", int(rl.window.Seconds())))
					w.WriteHeader(http.StatusTooManyRequests)
					w.Write([]byte(`{"error":"rate_limit_exceeded"}`))
					return
				}
				next.ServeHTTP(w, r)
				return
			}
			if cnt == 1 {
				rl.rdb.Expire(ctx, key, rl.window)
			}
			if int(cnt) > limit {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", fmt.Sprintf("%d", int(rl.window.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				w.Write([]byte(`{"error":"rate_limit_exceeded"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
