package redisstore

import (
	"sync"
	"time"
)

// memLimiter is a tiny in-process fixed-window counter used ONLY as a fallback when
// Redis errors. It keeps brute-force / rate-limit protection bounded (per-instance)
// during a Redis outage instead of failing fully open. It is lossy across restarts
// and not shared across replicas — acceptable as a transient-outage backstop, not the
// steady state (steady state is the Redis-backed path).
type memLimiter struct {
	mu  sync.Mutex
	win map[string]*memWindow
}

type memWindow struct {
	count int
	reset time.Time
}

func newMemLimiter() *memLimiter { return &memLimiter{win: make(map[string]*memWindow)} }

// incr bumps the counter for key within a fresh/rolling window and returns the count.
func (m *memLimiter) incr(key string, window time.Duration) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	w := m.win[key]
	if w == nil || now.After(w.reset) {
		w = &memWindow{reset: now.Add(window)}
		m.win[key] = w
	}
	w.count++
	if len(m.win) > 10000 { // opportunistic sweep to bound memory
		for k, v := range m.win {
			if now.After(v.reset) {
				delete(m.win, k)
			}
		}
	}
	return w.count
}

// count returns the current counter for key without incrementing.
func (m *memLimiter) count(key string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	w := m.win[key]
	if w == nil || time.Now().After(w.reset) {
		return 0
	}
	return w.count
}
