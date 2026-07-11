# Russkiy — Production Readiness & Security

Status of scaling and security ahead of a real launch. Items marked **✅ done**
are implemented in this repo; **☐ ops** require deployment/infra decisions (not
code); **☐ legal/product** need non-engineering work.

## 1. Can it serve 10,000 concurrent users?

**Yes, with the items below — and only after a real load test.** The architecture
favors it: the curriculum is a **static client-side bundle** (served by CDN, not
the API), learner progress is kept in `localStorage` with a **debounced** sync, and
the Go API is **stateless** (all shared state in Redis), so it scales horizontally.
10k active learners is on the order of a few hundred req/s at the API — modest.

### Implemented to support scale
- ✅ **Stateless API** — token revocation, lockout, rate-limit, and LTI replay state
  live in Redis, so you can run N identical instances behind a load balancer.
- ✅ **Tuned DB pool** — explicit `DB_MAX_CONNS` / `DB_MIN_CONNS` + conn lifetimes
  (`main.go`), instead of the tiny default. Keep `N_instances × DB_MAX_CONNS` under
  Postgres `max_connections` (or front with PgBouncer).
- ✅ **Readiness probe** `/readyz` (pings the DB) vs liveness `/health` — gate the
  load balancer on `/readyz`.
- ✅ **Graceful shutdown** (SIGTERM → `server.Shutdown`) + request timeouts +
  1 MB body cap.
- ✅ **Per-user rate limiting** (Redis; 100/min free, 1000/min premium).

### Ops checklist before 10k (not code)
- ☐ Run **≥2–4 API replicas** behind a load balancer with autoscaling on CPU/RPS.
- ☐ **Managed Postgres** + a **read replica** (teacher heatmaps/reports are the
  heavy reads); add **PgBouncer** if instance count × pool size is large.
- ☐ **Managed Redis** (single node easily handles 10k).
- ☐ Serve the web via **CDN** (Vercel/CloudFront) — offloads the bulk of bandwidth
  (the ~1.3 MB curriculum bundle) entirely off the API.
- ☐ Put **Cloudflare/WAF** in front for DDoS + bot protection.
- ☐ **Load test** (k6/Locust) at 10k virtual users and tune from the numbers.

### Local load-test result (one dev instance, laptop, dev Postgres)
A quick concurrency test (`scratchpad/loadtest.js`) against a **single** instance:

| Endpoint | Concurrency | Throughput | Errors | p95 |
|---|---|---|---|---|
| `/health` (raw) | 100 | **~2,360 req/s** | 0 | 63 ms |
| `/readyz` (+DB ping) | 100 | **~1,370 req/s** | 0 | 97 ms |
| `/readyz` (+DB ping) | 400 | ~1,350 req/s | 0 | 376 ms |

**Reading:** one laptop instance already sustains **~1,350 DB-backed req/s with
zero errors**, and degrades *gracefully* (queues, doesn't fail) at 4× overload.
Since 10k active learners generate on the order of a **few hundred** API req/s
(the curriculum is CDN-served and sync is debounced), 10k concurrent is comfortably
reachable with **2–4 production instances + managed Postgres + CDN**. Re-run a full
k6 test in a prod-like environment to confirm before launch.

## 2. Security — implemented (✅)

- **Passwords:** bcrypt (cost 10); policy now **≥10 chars + letters & numbers**.
- **Auth tokens:** JWT **RS256** (asymmetric), 15-min access / 30-day refresh,
  with **refresh-token revocation** in Redis.
- **httpOnly cookie auth:** access + refresh tokens are issued as **httpOnly,
  SameSite=Lax, Secure** cookies and accepted on protected routes — the web serves
  the API **same-origin via a Next.js proxy** (`/api/*`) so the browser sends them.
  The web **no longer stores the refresh token in JS** (closes the XSS exfiltration
  of the long-lived token). `/v1/auth/logout` revokes + clears cookies.
  *(Bearer-header auth still works for mobile/LTI.)*
- **Brute force:** account lockout (5 fails / 15 min).
- **SQL injection:** parameterized queries via `pgx` everywhere.
- **Access control:** JWT middleware, `RequireRole("teacher")`, and per-resource
  **ownership/IDOR checks**.
- **Security headers:** API (`SecurityHeaders` middleware) + web (`next.config.ts`):
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `frame-ancestors 'none'`, HSTS (over HTTPS).
- **CORS** allowlist (configurable, not `*`); **LTI 1.3** signature + replay
  protection.
- **Startup guard:** in production, **fail-fast** if `JWT_PRIVATE_KEY_PATH` is unset.

## 3. Security — remaining

### ☐ ops / config
- **TLS everywhere + HSTS preload** at the load balancer; set real `JWT_SECRET`,
  `ADMIN_API_KEY` (rotate), and a **secrets manager** (not raw env).
- **Lock down the admin endpoint** (`/v1/admin/users/role`) — IP-allowlist or move
  behind the VPN; it is key-gated and disabled when the key is unset.
- **Backups** (PITR) + **audit-log retention**; centralized logging/metrics
  (the app already emits request logs + xAPI).
- **Full CSP** with script/style nonces (current CSP only sets `frame-ancestors`).

### ☐ product / engineering follow-ups
- **Email verification** on register; **MFA** for teachers/admins.
- **Move the access token out of JS too** (currently kept for the Bearer fallback /
  `isAuthenticated` signal) — fully cookie-only once mobile is migrated.
- **Persist `currentLevel` server-side** (today it rides in the synced progress
  blob, which works, but isn't a profile column).

### ☐ legal — COPPA (the kids segment ships to under-13s)
This is the highest-risk **non-engineering** gap. A consent checkbox is **not**
compliant. Before enabling kid signups in production you need:
- **Verifiable parental consent** (not a checkbox) — e.g. a small auth charge,
  signed form, or a parent-account model where the adult is the account holder.
- **Data minimization** for children (we collect only a nickname in-app) and a
  documented **deletion / access** path.
- A **privacy policy** covering children's data and, if EU, **GDPR-K**.
Until then, consider gating the kid segment behind a parent account or disabling
self-serve kid signup. (A timestamped consent event is recorded at signup as a
starting point — `kid_consent` — but it is not a substitute for verifiable consent.)

## 4. Environment variables (production)

```
ENVIRONMENT=production
PORT=8080
DATABASE_URL=postgres://…           # managed PG, sslmode=require
REDIS_URL=rediss://…                # managed Redis (TLS)
JWT_PRIVATE_KEY_PATH=/secrets/jwt.pem   # REQUIRED in prod (persisted RSA key)
ADMIN_API_KEY=…                     # strong, rotated; or unset to disable
ALLOWED_ORIGINS=https://app.russkiy.ru
DB_MAX_CONNS=20  DB_MIN_CONNS=2
API_PROXY_TARGET=http://api:8080    # web → API (same-origin proxy)
LTI_*                               # if institutional SSO is used
```
