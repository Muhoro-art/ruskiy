package redisstore

import (
	"time"

	"github.com/redis/go-redis/v9"
)

// Lockout is a Redis-backed account-lockout manager. Because the counters live
// in Redis, brute-force protection is consistent across replicas (an attacker
// can't reset the count by hitting a different instance) and survives restarts.
type Lockout struct {
	rdb         *redis.Client
	maxAttempts int
	window      time.Duration // how long failed attempts accumulate
	lockDur     time.Duration // how long an account stays locked
	fallback    *memLimiter   // in-process backstop used only when Redis errors
}

func NewLockout(rdb *redis.Client, maxAttempts int, window, lockDur time.Duration) *Lockout {
	return &Lockout{rdb: rdb, maxAttempts: maxAttempts, window: window, lockDur: lockDur, fallback: newMemLimiter()}
}

// CheckLockout returns 429 if the account is currently locked, else 0. On a Redis
// error it FAILS CLOSED via the in-process fallback counter rather than returning
// "not locked" (which previously disabled lockout entirely during a Redis blip).
func (l *Lockout) CheckLockout(userID string) int {
	ctx, cancel := opCtx()
	defer cancel()
	n, err := l.rdb.Exists(ctx, "lock:until:"+userID).Result()
	if err != nil {
		if l.fallback.count("fail:"+userID) >= l.maxAttempts {
			return 429
		}
		return 0
	}
	if n > 0 {
		return 429
	}
	return 0
}

// RecordFailedAttempt increments the failure counter and returns 429 if the
// account is now locked, otherwise 401. On a Redis error it counts the attempt in
// the in-process fallback so brute force is still bounded (fail closed, not open).
func (l *Lockout) RecordFailedAttempt(userID string) int {
	ctx, cancel := opCtx()
	defer cancel()
	if n, err := l.rdb.Exists(ctx, "lock:until:"+userID).Result(); err == nil && n > 0 {
		return 429
	}
	cnt, err := l.rdb.Incr(ctx, "lock:fail:"+userID).Result()
	if err != nil {
		// Redis down: bound abuse per-instance instead of allowing unlimited guesses.
		if l.fallback.incr("fail:"+userID, l.window) >= l.maxAttempts {
			return 429
		}
		return 401
	}
	if cnt == 1 {
		l.rdb.Expire(ctx, "lock:fail:"+userID, l.window)
	}
	if int(cnt) >= l.maxAttempts {
		l.rdb.Set(ctx, "lock:until:"+userID, "1", l.lockDur)
		return 429
	}
	return 401
}

// ResetAttempts clears the failure counter and any lock (on successful login).
func (l *Lockout) ResetAttempts(userID string) {
	ctx, cancel := opCtx()
	defer cancel()
	l.rdb.Del(ctx, "lock:fail:"+userID, "lock:until:"+userID)
}
