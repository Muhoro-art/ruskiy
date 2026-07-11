package redisstore

import (
	"time"

	"github.com/redis/go-redis/v9"
)

// LTIStateStore is a Redis-backed store for the OIDC state→nonce binding used by
// the LTI 1.3 launch flow. The state we generate at login is stored with the
// nonce we sent to the platform; the launch consumes it atomically (GETDEL) so a
// replayed launch (same state, or a captured id_token re-POSTed) finds nothing
// and is rejected. Entries auto-expire so abandoned logins don't accumulate.
type LTIStateStore struct {
	rdb *redis.Client
	ttl time.Duration
}

func NewLTIStateStore(rdb *redis.Client, ttl time.Duration) *LTIStateStore {
	return &LTIStateStore{rdb: rdb, ttl: ttl}
}

func (s *LTIStateStore) SaveState(state, nonce string) error {
	ctx, cancel := opCtx()
	defer cancel()
	return s.rdb.Set(ctx, "lti:state:"+state, nonce, s.ttl).Err()
}

// ConsumeState atomically reads and deletes the nonce bound to state. The atomic
// GETDEL guarantees a given state can be consumed exactly once, which is what
// makes the launch single-use and defeats replay.
func (s *LTIStateStore) ConsumeState(state string) (string, bool) {
	if state == "" {
		return "", false
	}
	ctx, cancel := opCtx()
	defer cancel()
	v, err := s.rdb.GetDel(ctx, "lti:state:"+state).Result()
	if err != nil || v == "" {
		return "", false
	}
	return v, true
}
