package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ParseCIDRs converts CIDR (or bare-IP) strings into networks, skipping unparseable
// entries. Used to build the trusted-proxy set for TrustedRealIP.
func ParseCIDRs(cidrs []string) []*net.IPNet {
	var out []*net.IPNet
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, n, err := net.ParseCIDR(c); err == nil {
			out = append(out, n)
			continue
		}
		if ip := net.ParseIP(c); ip != nil {
			bits := 32
			if ip.To4() == nil {
				bits = 128
			}
			out = append(out, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
		}
	}
	return out
}

func ipInAny(ip net.IP, nets []*net.IPNet) bool {
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// TrustedRealIP replaces chi's blanket RealIP: it sets r.RemoteAddr to the real
// client IP, trusting the X-Forwarded-For header ONLY when the direct TCP peer is a
// configured trusted proxy. With NO trusted proxies configured it ignores forwarding
// headers entirely and uses the raw TCP peer — which a client cannot spoof — so the
// per-IP throttle can't be defeated by rotating an X-Forwarded-For header. Set
// TRUSTED_PROXIES to your reverse-proxy/LB range in production so real client IPs are
// seen for throttling.
func TrustedRealIP(trusted []*net.IPNet) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if ip := deriveClientIP(r, trusted); ip != "" {
				r.RemoteAddr = net.JoinHostPort(ip, "0") // keep host:port shape for clientIP
			}
			next.ServeHTTP(w, r)
		})
	}
}

func deriveClientIP(r *http.Request, trusted []*net.IPNet) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer := net.ParseIP(host)
	// Only consult forwarding headers when the direct peer is a KNOWN trusted proxy.
	if peer == nil || len(trusted) == 0 || !ipInAny(peer, trusted) {
		return host
	}
	// Trusted peer: walk X-Forwarded-For right→left; the first hop that is NOT itself a
	// trusted proxy is the real client (a spoofed leftmost entry is thus ignored).
	parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		cand := net.ParseIP(strings.TrimSpace(parts[i]))
		if cand == nil || ipInAny(cand, trusted) {
			continue
		}
		return cand.String()
	}
	// Fallback for proxies that set only X-Real-IP (single hop, not a chain).
	if xr := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Real-IP"))); xr != nil && !ipInAny(xr, trusted) {
		return xr.String()
	}
	return host
}

// IPRateLimiter is a fixed-window limiter keyed by client IP, for throttling
// UNAUTHENTICATED endpoints (login/register) that the per-user limiter can't cover
// (it keys on the JWT user id, which anonymous requests don't have).
type IPRateLimiter struct {
	mu     sync.Mutex
	hits   map[string]*ipWindow
	limit  int
	window time.Duration
}

type ipWindow struct {
	count int
	end   time.Time
}

func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	l := &IPRateLimiter{hits: make(map[string]*ipWindow), limit: limit, window: window}
	go l.sweep()
	return l
}

func (l *IPRateLimiter) sweep() {
	t := time.NewTicker(l.window)
	defer t.Stop()
	for range t.C {
		now := time.Now()
		l.mu.Lock()
		for k, w := range l.hits {
			if now.After(w.end) {
				delete(l.hits, k)
			}
		}
		l.mu.Unlock()
	}
}

func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// Limit is the middleware. chimw.RealIP runs globally first, so RemoteAddr is the
// real client IP.
func (l *IPRateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		l.mu.Lock()
		now := time.Now()
		win := l.hits[ip]
		if win == nil || now.After(win.end) {
			win = &ipWindow{end: now.Add(l.window)}
			l.hits[ip] = win
		}
		win.count++
		over := win.count > l.limit
		l.mu.Unlock()
		if over {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"rate_limit_exceeded"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// CSRFGuard rejects cross-site state-changing requests that authenticate via the
// httpOnly cookie. Bearer/Authorization-header clients (mobile/LTI) are exempt
// (not cookie-driven, so not CSRF-able). For an unsafe method on a cookie-auth
// request it requires the Origin header to exactly match an allowed origin —
// defense in depth beyond SameSite=Lax (which has browser edge cases / grace windows).
func CSRFGuard(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			if r.Header.Get("Authorization") != "" { // Bearer client — not CSRF-able
				next.ServeHTTP(w, r)
				return
			}
			if origin := r.Header.Get("Origin"); origin == "" || !allowed[origin] {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"error":"cross_origin_forbidden"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
