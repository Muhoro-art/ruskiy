package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestTrustedRealIP is the anti-spoofing guard for the per-IP auth throttle: a client
// must not be able to change the IP the limiter keys on by sending X-Forwarded-For.
func TestTrustedRealIP(t *testing.T) {
	cases := []struct {
		name     string
		trusted  []string
		peer     string // r.RemoteAddr (host:port)
		xff      string // X-Forwarded-For header
		wantHost string // expected derived client host
	}{
		{
			name:     "no trusted proxies ignores XFF (spoof-proof)",
			trusted:  nil,
			peer:     "203.0.113.9:5555",
			xff:      "1.2.3.4",
			wantHost: "203.0.113.9",
		},
		{
			name:     "untrusted peer ignores XFF even when set",
			trusted:  []string{"10.0.0.0/8"},
			peer:     "203.0.113.9:5555", // not in 10.0.0.0/8
			xff:      "1.2.3.4",
			wantHost: "203.0.113.9",
		},
		{
			name:     "trusted peer honors rightmost non-proxy XFF hop",
			trusted:  []string{"10.0.0.0/8"},
			peer:     "10.1.2.3:443",
			xff:      "1.2.3.4",
			wantHost: "1.2.3.4",
		},
		{
			name:     "trusted peer skips a spoofed leftmost + chained trusted hop",
			trusted:  []string{"10.0.0.0/8"},
			peer:     "10.1.2.3:443",
			xff:      "9.9.9.9, 5.6.7.8, 10.0.0.7", // real client is 5.6.7.8; 10.0.0.7 is our own proxy
			wantHost: "5.6.7.8",
		},
		{
			name:     "trusted peer with no XFF falls back to peer",
			trusted:  []string{"10.0.0.0/8"},
			peer:     "10.1.2.3:443",
			xff:      "",
			wantHost: "10.1.2.3",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got string
			h := TrustedRealIP(ParseCIDRs(tc.trusted))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got = clientIP(r)
			}))
			req := httptest.NewRequest(http.MethodPost, "/v1/auth/token", nil)
			req.RemoteAddr = tc.peer
			if tc.xff != "" {
				req.Header.Set("X-Forwarded-For", tc.xff)
			}
			h.ServeHTTP(httptest.NewRecorder(), req)
			if got != tc.wantHost {
				t.Fatalf("derived client IP = %q, want %q", got, tc.wantHost)
			}
		})
	}
}

// TestIPRateLimiterCannotBeBypassedBySpoofedXFF wires the real middleware chain
// (TrustedRealIP with no trusted proxies, then the limiter) and confirms a client
// rotating X-Forwarded-For is still counted against ONE bucket (its TCP peer).
func TestIPRateLimiterCannotBeBypassedBySpoofedXFF(t *testing.T) {
	rl := NewIPRateLimiter(3, time.Minute)
	chain := TrustedRealIP(nil)(rl.Limit(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	var last int
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/auth/token", nil)
		req.RemoteAddr = "203.0.113.50:6000"
		req.Header.Set("X-Forwarded-For", "10.0.0."+string(rune('1'+i))) // different spoof each time
		rec := httptest.NewRecorder()
		chain.ServeHTTP(rec, req)
		last = rec.Code
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("after 5 requests with rotating spoofed XFF, last status = %d, want 429 (spoof bypassed the limiter)", last)
	}
}
