package handler

import (
	"sync"
	"time"
)

// LTIStateStore binds the OIDC `state` we generate at login-initiation to the
// `nonce` we send to the platform, and lets the launch consume it exactly once.
// Redis-backed in production (shared across replicas, survives restarts); the
// in-memory fallback below keeps single-instance dev working.
type LTIStateStore interface {
	SaveState(state, nonce string) error
	// ConsumeState atomically returns and removes the nonce bound to state.
	// ok is false if state is unknown or already consumed (a replay).
	ConsumeState(state string) (nonce string, ok bool)
}

// MemoryStateStore is a process-local LTIStateStore for dev/single-instance use.
// It is single-use per state and evicts expired entries opportunistically.
type MemoryStateStore struct {
	mu  sync.Mutex
	m   map[string]memState
	ttl time.Duration
}

type memState struct {
	nonce string
	exp   time.Time
}

func NewMemoryStateStore(ttl time.Duration) *MemoryStateStore {
	return &MemoryStateStore{m: make(map[string]memState), ttl: ttl}
}

func (s *MemoryStateStore) SaveState(state, nonce string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	// Opportunistic cleanup so abandoned logins don't accumulate.
	for k, v := range s.m {
		if now.After(v.exp) {
			delete(s.m, k)
		}
	}
	s.m[state] = memState{nonce: nonce, exp: now.Add(s.ttl)}
	return nil
}

func (s *MemoryStateStore) ConsumeState(state string) (string, bool) {
	if state == "" {
		return "", false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.m[state]
	if ok {
		delete(s.m, state) // single-use: consuming removes it
	}
	if !ok || time.Now().After(v.exp) {
		return "", false
	}
	return v.nonce, true
}
