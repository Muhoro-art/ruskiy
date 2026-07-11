package redisstore

import (
	"time"

	"github.com/redis/go-redis/v9"
)

// TokenStore is a Redis-backed implementation of auth.TokenStore. Refresh-token
// revocation is shared across replicas and auto-expires with the token TTL.
//
// Two TTLs, deliberately different:
//   - storeTTL  gates the allowlist entry that rotation requires. Setting it SHORTER
//     than the refresh JWT's lifetime turns it into a server-side IDLE cap: each
//     rotation refreshes the entry, so an active session survives, but a session left
//     idle longer than storeTTL loses its allowlist entry and can no longer refresh —
//     the server-authoritative backstop behind the client idle-logout.
//   - revokeTTL keeps the revoked/reused markers alive for the JWT's FULL lifetime, so
//     a revoked-but-not-yet-expired refresh JWT can never be un-revoked by TTL expiry.
type TokenStore struct {
	rdb       *redis.Client
	storeTTL  time.Duration
	revokeTTL time.Duration
}

// NewTokenStore builds the store. storeTTL is the allowlist/idle TTL; revokeTTL is the
// (longer) revocation-marker TTL — pass the full refresh-token lifetime for it.
func NewTokenStore(rdb *redis.Client, storeTTL, revokeTTL time.Duration) *TokenStore {
	if storeTTL <= 0 || storeTTL > revokeTTL {
		storeTTL = revokeTTL // never let the allowlist outlive the token
	}
	return &TokenStore{rdb: rdb, storeTTL: storeTTL, revokeTTL: revokeTTL}
}

func (s *TokenStore) StoreRefreshToken(tokenID, userID string) error {
	ctx, cancel := opCtx()
	defer cancel()
	return s.rdb.Set(ctx, "rt:store:"+tokenID, userID, s.storeTTL).Err()
}

// GetRefreshToken returns the userID a jti was issued for and whether it is still
// in the issued/allowlisted set (i.e. issued, not yet rotated away, not expired).
func (s *TokenStore) GetRefreshToken(tokenID string) (string, bool) {
	ctx, cancel := opCtx()
	defer cancel()
	userID, err := s.rdb.Get(ctx, "rt:store:"+tokenID).Result()
	if err != nil {
		return "", false
	}
	return userID, true
}

func (s *TokenStore) RevokeRefreshToken(tokenID string) error {
	ctx, cancel := opCtx()
	defer cancel()
	return s.rdb.Set(ctx, "rt:revoked:"+tokenID, "1", s.revokeTTL).Err()
}

func (s *TokenStore) IsRevoked(tokenID string) bool {
	ctx, cancel := opCtx()
	defer cancel()
	n, _ := s.rdb.Exists(ctx, "rt:revoked:"+tokenID).Result()
	return n > 0
}

func (s *TokenStore) RecordRevokedReuse(tokenID string) {
	ctx, cancel := opCtx()
	defer cancel()
	s.rdb.Set(ctx, "rt:reused:"+tokenID, "1", s.revokeTTL)
}

func (s *TokenStore) WasReusedAfterRevoke(tokenID string) bool {
	ctx, cancel := opCtx()
	defer cancel()
	n, _ := s.rdb.Exists(ctx, "rt:reused:"+tokenID).Result()
	return n > 0
}
