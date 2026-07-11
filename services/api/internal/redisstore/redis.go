// Package redisstore provides Redis-backed implementations of auth state
// (refresh-token revocation, account lockout, and rate limiting) so that this
// security state is shared across replicas and survives restarts — replacing
// the process-local in-memory versions that failed open at scale.
package redisstore

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// New connects to Redis and verifies the connection with a ping.
func New(url string) (*redis.Client, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	c := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := c.Ping(ctx).Err(); err != nil {
		_ = c.Close()
		return nil, err
	}
	return c, nil
}

// opCtx is a short timeout for individual Redis operations.
func opCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Second)
}
