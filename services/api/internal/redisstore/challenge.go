package redisstore

import (
	"time"

	"github.com/redis/go-redis/v9"
)

// ChallengeStore is a Redis-backed store for the human-verification gate: it holds
// the correct answer for each outstanding challenge and the single-use passes
// minted when one is solved. Both are consumed with an atomic GETDEL so a solved
// answer or a pass can be used exactly once (defeats replay), and both auto-expire
// so abandoned challenges don't accumulate. Shared across replicas, so a challenge
// issued by one instance can be verified — and its pass redeemed — by another.
type ChallengeStore struct {
	rdb     *redis.Client
	chalTTL time.Duration
	passTTL time.Duration
}

func NewChallengeStore(rdb *redis.Client, chalTTL, passTTL time.Duration) *ChallengeStore {
	return &ChallengeStore{rdb: rdb, chalTTL: chalTTL, passTTL: passTTL}
}

func (s *ChallengeStore) SaveChallenge(id, answer string) error {
	ctx, cancel := opCtx()
	defer cancel()
	return s.rdb.Set(ctx, "hc:c:"+id, answer, s.chalTTL).Err()
}

func (s *ChallengeStore) TakeChallenge(id string) (string, bool) {
	if id == "" {
		return "", false
	}
	ctx, cancel := opCtx()
	defer cancel()
	v, err := s.rdb.GetDel(ctx, "hc:c:"+id).Result()
	if err != nil || v == "" {
		return "", false
	}
	return v, true
}

func (s *ChallengeStore) SavePass(token string) error {
	ctx, cancel := opCtx()
	defer cancel()
	return s.rdb.Set(ctx, "hc:p:"+token, "1", s.passTTL).Err()
}

func (s *ChallengeStore) TakePass(token string) bool {
	if token == "" {
		return false
	}
	ctx, cancel := opCtx()
	defer cancel()
	v, err := s.rdb.GetDel(ctx, "hc:p:"+token).Result()
	return err == nil && v != ""
}
