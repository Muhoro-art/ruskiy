# Russkiy — reg.ru Public-Launch Hardening

_Pre-launch security pass for hosting the platform publicly on reg.ru. Complements
[`security-audit-2026-07.md`](./security-audit-2026-07.md) (the systemic IDOR / refresh /
COPPA blockers, all closed in code batches A–H) and [`production-readiness.md`](./production-readiness.md)._

This round targeted a second, smaller audit (9 confirmed findings) focused on what
becomes exploitable the moment the API is reachable from the open internet behind a
reverse proxy, plus the operator configuration needed to deploy safely.

---

## Part 1 — Code fixes shipped this round

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | HIGH | **Config fails open.** `ENVIRONMENT` defaulted to `development`, so a host that simply forgot to set it silently skipped every production hardening guard (JWT key, DB TLS, admin-key length, CORS). | Default is now `production`; only `development`/`dev`/`test` relax the guards. A forgotten env var now **fails closed** (refuses to boot). `config.go` |
| 2 | HIGH | **Rate-limit bypass via `X-Forwarded-For`.** chi's `RealIP` blindly trusts `XFF`, so a bot rotates the header and every request lands in a new bucket — the per-IP auth throttle (credential stuffing / signup spam / admin-key brute force) is defeated. | New `middleware.TrustedRealIP`: honors `XFF` **only** when the TCP peer is in `TRUSTED_PROXIES`; otherwise uses the spoof-proof TCP peer. Replaces `RealIP` globally. Unit-tested (`protect_test.go`). |
| 3 / 9 | HIGH | **Client asserts its own exam pass.** `POST /me/exams/{id}/submit` trusted a body field `passed`, so a learner could POST `passed:true` regardless of their answers, corrupting teacher/dean performance dashboards. | `passed` is now derived **server-side** in SQL from the score vs the exam's `pass_threshold` (`store/exam.go`); the client field is gone from the request, handler, and web client. |
| 4 | MED | **Human-check keyspace too small.** A 6-tile grid with 2–3 correct gave a blind bot ≈1/35 per attempt. | Enlarged to a 9-tile (3×3) grid with 3–4 correct ⇒ ≈1/210 per attempt (`C(9,3)+C(9,4)`). Combined with the now-un-bypassable throttle (#2), scripted solving is impractical without a real vision model. |
| 5 | MED | **Last-dean race.** Two concurrent demotions of different deans each took `FOR UPDATE` on their own row, both read `deanCount=2`, and both committed → institution left with **0 deans** (locked out). | Institution-scoped `pg_advisory_xact_lock(hashtext(institution_id))` at the top of `RemoveMember` + `SetMemberRole` serializes all dean-count changes per tenant. |
| 6 | MED | **Unthrottled auth-adjacent routes.** `/auth/logout`, `/auth/refresh`, and the **public** `/admin/*` routes (role escalation + tenant creation, gated only by the admin key) had no IP throttle — the admin key was brute-forceable at full speed. | All now wrapped in the same `authThrottle` (20/min per IP). With #2 that limit can't be side-stepped. |
| 7 | MED | **PII survives erasure.** The activity log stored the raw invitee **email** for `staff_invited`; the log is retained long-term, so it outlived that person's later account deletion as an orphaned PII copy. | Records only the **role** now, never the email (`handler/institution.go`). |
| 8 | LOW | **Registration email-enumeration oracle.** `POST /auth/register` returns `409 "email already registered"`, letting an attacker probe which emails have accounts. | **Accepted tradeoff** — documented, not changed. A distinct-error signup UX is worth more than the marginal privacy gain here, and the anti-automation throttle (#2/#6) + human-check (#4) bound bulk probing. Revisit if abuse appears. |

All fixes: `go build ./...` clean, `go vet` clean, full Go test suite green, web `tsc --noEmit`
clean. Fail-fast guards verified by running the real binary (unset `ENVIRONMENT` → fatal on
missing prod secrets; short `ADMIN_API_KEY` → fatal unconditionally). XFF-spoof resistance
verified by unit test (5 rotating spoofed headers still hit one bucket → 429).

---

## Part 2 — Operator go-live checklist (reg.ru)

Nothing below is optional for a public host. The API now **refuses to boot** if the
starred (★) items are missing in production — that is intentional.

### Environment & secrets (API)

- [ ] `ENVIRONMENT=production` — or leave it unset; it now defaults to production. Never set it to `development`/`dev`/`test` on the public host.
- [ ] ★ `JWT_PRIVATE_KEY_PATH=/etc/russkiy/jwt_private.pem` — a **persistent** RSA key mounted read-only. An ephemeral in-memory key invalidates every token on restart and breaks multi-replica auth. Generate: `openssl genrsa -out jwt_private.pem 2048 && chmod 600 jwt_private.pem`. Back it up in the secret store; rotating it logs everyone out.
- [ ] `JWT_SECRET` — set to a long random value (used for any residual HS paths). Never leave the `dev-secret-change-in-production` default; boot warns on it.
- [ ] ★ `DATABASE_URL=postgres://USER:PASS@HOST:5432/russkiy?sslmode=verify-full` — must **not** contain `sslmode=disable` or `sslmode=allow` (boot refuses). Prefer `verify-full` with the reg.ru CA bundle; `require` is the floor. Use a dedicated least-privilege DB user, not a superuser.
- [ ] `REDIS_URL=rediss://…` (TLS) or a private-network `redis://` with `requirepass`. Redis-backed lockout/rate-limit/refresh-allowlist are **fail-closed** — a Redis outage denies, it does not wave requests through — so Redis must be highly available.
- [ ] ★ `ALLOWED_ORIGINS=https://app.yourdomain.ru` — your real web origin(s), comma-separated, **HTTPS only**. Boot refuses in production if unset (no localhost default leaks to the public). This also arms the `CSRFGuard` Origin allowlist.
- [ ] ★ `TRUSTED_PROXIES=<reg.ru LB / your nginx CIDR>` — the CIDR(s) of the reverse proxy that terminates TLS in front of the API (e.g. `10.0.0.0/8`, or the specific LB `/32`). **Required for correct client IPs.** If unset behind a proxy, every request appears to come from the proxy and the per-IP throttle collapses to one shared bucket (self-DoS). If wrong/too-wide, clients can spoof `XFF` again. Set it to the narrowest range that covers your proxy.
- [ ] `ADMIN_API_KEY` — either **empty** (disables the public `/admin/*` bootstrap routes entirely — preferred after the first dean exists) or a random string **≥24 chars** (boot refuses shorter). Rotate after initial provisioning. Consider firewalling `/v1/admin/*` to an admin IP at the proxy regardless.
- [ ] `HUMAN_CHECK_ENABLED=true` (default) for the public web. Only disable for non-web API integrations that can't render the challenge.
- [ ] **Session length** — `JWT_ACCESS_TTL_MINUTES` (default 15) and `JWT_REFRESH_TTL_DAYS` (default 30) now actually take effect (they were dead config before). The **refresh TTL is a sliding window**: an active user stays logged in indefinitely, and the refresh cookie expires after this many days of *not opening the app at all* (default 30). Lower `JWT_REFRESH_TTL_DAYS` (e.g. 7) for a tighter session on a public/shared-computer deployment. Non-positive values are clamped back to the defaults.
- [ ] ★ **Email/SMTP for verification** — `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 implicit TLS), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (e.g. `Russkiy <no-reply@yourdomain.ru>`). Registration is **block-until-verified** by default (`EMAIL_VERIFICATION_REQUIRED=true`), so **without working SMTP no one can activate an account** — the API logs the link instead and warns at boot. Set `APP_BASE_URL` to the public web origin (e.g. `https://app.yourdomain.ru`) so verification links point at the right host (falls back to the first `ALLOWED_ORIGINS`). Set `EMAIL_VERIFICATION_REQUIRED=false` only if you deliberately want signups usable without confirming their email.
- [ ] **Idle auto-logout** — two layers: the client-side inactivity logout `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES` (web, default **30**, build-time var, warning modal) and the **server-side** idle cap `SESSION_IDLE_MINUTES` (API, default **60**, requires Redis) which refuses to refresh a session idle past the cap so a bypassed client can't keep a walked-away session alive. Keep the server value ≥ the client value so normal reading gaps don't force a re-login. Set `SESSION_IDLE_MINUTES=0` to disable the server cap (back to the 30-day sliding session).
- [ ] `DB_MAX_CONNS` / `DB_MIN_CONNS` — size so `replicas × DB_MAX_CONNS < postgres max_connections`, or front Postgres with PgBouncer.

### TLS / edge (reg.ru reverse proxy)

- [ ] TLS terminated at the proxy with a valid cert (Let's Encrypt or reg.ru-issued); redirect all `:80` → `:443`.
- [ ] Proxy sets `X-Forwarded-For` correctly and **strips any client-supplied `X-Forwarded-For`/`X-Real-IP`** before appending the real peer (defense in depth alongside `TRUSTED_PROXIES`).
- [ ] HSTS at the edge: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (the app also emits security headers via `SecurityHeaders` middleware; the edge is the durable place for HSTS).
- [ ] Do not expose Postgres (5432) or Redis (6379) to the internet — bind to the private network only.
- [ ] `/health` (liveness) and `/readyz` (DB-gated readiness) wired to the LB; route traffic on `/readyz`, not `/health`.

### Cookies / auth (already enforced in code — verify in prod)

- [ ] Auth cookie is `HttpOnly; Secure; SameSite=Lax` and scoped to the app domain. `Secure` requires HTTPS end-to-end — confirm the proxy isn't downgrading to plain HTTP internally in a way that drops it.
- [ ] Web app talks to the API through the same-origin `/api` proxy (no hardcoded `http://localhost:8080`), so cookies and CORS line up under one origin.

### Data & privacy

- [ ] Confirm the right-to-erasure endpoint (`DELETE /v1/me`) cascades (profiles, sessions, skills, analytics, consents, xAPI) — it does in code; verify against the live schema after migrations.
- [ ] Apply all SQL migrations through `026_assigned_exams.sql` + `027_activity_log.sql` before first traffic (this deployment applies `.sql` files directly — there is no `schema_migrations` version table, so track applied files out-of-band).
- [ ] Set a retention/purge job for `activity_log` and analytics per your privacy policy.
- [ ] COPPA: minors' parental-consent records are server-side and auditable (batch C) — confirm the consent table is populated for any under-13 signups before enabling that segment publicly.

### Post-deploy smoke checks

- [ ] Boot the API with the production env set — it should start cleanly (no `FATAL`). Deliberately unset `ALLOWED_ORIGINS` once in staging to confirm it **refuses** to boot (proves the guard is active).
- [ ] From two different source IPs, exceed 20 auth requests/min and confirm `429` per IP — then confirm rotating `X-Forwarded-For` from one IP does **not** raise the limit.
- [ ] Submit an assigned exam with a failing score and confirm the dashboard shows it as **not passed** (server-derived), regardless of any tampered request body.
- [ ] Attempt to demote the only dean → expect `409 last dean`.

---

## Session lifetime & inactivity (how logout actually works)

Traced through the live code (`internal/auth/auth.go`, `handler/authcookies.go`, `handler/auth.go`, `apps/web/src/lib/{api,auth}.ts`, `dashboard/layout.tsx`):

- **Access token: 15 min** (`JWT_ACCESS_TTL_MINUTES`), stored **in memory only** on the web client. Refreshed **transparently on a 401** (single silent retry), so an active user never notices it expire.
- **Refresh token: 30 days, sliding** (`JWT_REFRESH_TTL_DAYS`). Every `/auth/refresh` mints a fresh full-TTL token — **no absolute cap**. Refresh is jti-allowlisted + revocable, so logout genuinely ends it.
- **No proactive refresh timer.** The access token is refreshed only reactively on a 401 (silent, single retry), so an active user never notices its 15-min expiry.
- **Two logout triggers now:** (a) explicit "Sign out"; (b) the token path — a 401 whose silent refresh fails clears auth and redirects to the role's login portal; **and (c) idle auto-logout** (below).
- **Token-expiry bound = the refresh TTL (default 30 days).** Come back within 30 days → seamless silent re-auth off the cookie (even after a full page reload, since the reload's first API call refreshes). Come back after 30 days → re-login. A page reload is **not** a logout.
- **Idle auto-logout (shipped, all roles):** `apps/web/src/components/auth/IdleLogout.tsx`, mounted in the dashboard layout. After `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES` (default 30) of no interaction it signs the user out; a warning modal with a 60-second countdown appears first (so a learner reading/listening without clicking can tap "Stay"). Activity is a **shared `last_activity` localStorage timestamp**, so being active in one tab keeps every tab alive (no surprise logout of a background tab). Copy is role-aware (English for learners, Russian for staff). Verified live: modal renders with the countdown, "Stay" dismisses + resets the timer, and crossing the limit redirects to the login portal.
- **Caveats:** the refresh allowlist is durable only with Redis (in-memory fallback logs everyone out on API restart); a stolen access token stays valid up to 15 min after logout (stateless JWT, standard tradeoff).

## Part 3 — second-pass review of the new multi-tenant surface

A dedicated adversarial review ran over the code added this session (institution
management, exams, activity log, human-check, and the hardening diffs themselves) —
5 finder dimensions (tenant-IDOR, privilege-escalation, SQL/integrity, input/DoS,
hardening-diff correctness), each finding then adversarially refuted against the real
code. **12 confirmed (3 refuted); no blockers, no highs, and no cross-tenant breach** —
the `deanInstitution()` gate + `WHERE institution_id` scoping and the exam
membership-join hold everywhere. Confirmed items were integrity/robustness/DoS-hardening.

**Fixed + verified (`go build`/`vet`/tests green):**

| Area | Fix |
|---|---|
| Last-dean invariant | `AcceptInvite` now takes the institution advisory lock + last-dean guard (a sole dean could self-demote to **0 deans** by accepting a self-addressed teacher invite → locked-out tenant). |
| Role integrity | `SetMemberRole` now rejects a non-staff source role (`ErrNotStaff`) — a dean could otherwise flip a self-enrolled **student** straight to dean with no consent step. |
| Orphaned data | `RemoveMember` now reassigns the removed member's **assignments** (not just cohorts) to the new owner, so they're manageable and completion notifications route correctly. |
| Stale data | `UnenrolStudent` now purges the learner's `assignment_completions` + `assignment_targets` so old work doesn't resurface as "done" (un-redoable) on re-enrolment. |
| Input bounds (DoS) | Length caps (≤200) on exam title, cohort name, institution name; email format+length validation on invites; `ActivityStore.Record` truncates `detail` to 256 runes. |
| Retention | New `activity_log` purge (365-day) in the daily job — the log was otherwise never purged (unbounded growth). |
| Throttle coverage | Public LTI routes (`/lti/login`, `/lti/launch`) now carry the same per-IP `authThrottle` as `/auth` + `/admin`. |
| Proxy misconfig | Production now logs a startup **WARNING** when `TRUSTED_PROXIES` is empty (self-DoS risk behind a proxy) — parity with the other prod guards, but a warning not a fatal (a directly-exposed API legitimately has none). |

**Refuted (not bugs):** `ExamStore.Delete` unscoped-DELETE (caller enforces ownership before it); join-code brute-force (≈40-bit code + per-user throttle + unaffiliated-only + rotation); human-check answer inferability (accepted, documented CAPTCHA tradeoff with sound single-use/server-verify controls).

## Part 4 — the two deferred items (now implemented)

**Server-authoritative exam grading.** The learner now submits their per-question
**answers**, and the server re-grades them against an embedded answer key
(`services/api/internal/exam` + `answerkey.json`, generated by
`scripts/gen-exam-answerkey.mjs` from the curriculum). `ExamHandler.Submit` resolves the
exam's level server-side, grades, and derives correct/total itself — the client's own
tally is never trusted. The 260 objective questions (MC/fill_blank) grade by normalized
match; the ~22 matching/free_response (no single answer) fall back to the client verdict.
The denominator is the exam's full length, so omitting hard questions can't inflate the
percentage. Adversarially unit-tested: a fabricated all-`correct:true` submission with
wrong responses scores **0**; a correct answer with a `false` client flag still counts.
**Residual (documented):** exam content is delivered to the browser, so a determined
attacker who reads the bundle can still submit correct answers — fully preventing that
needs serving questions from the server without answers (a content-pipeline project).

**Server-side idle session cap.** The refresh-token allowlist TTL is now a server idle
cap (`SESSION_IDLE_MINUTES`, default 60m; requires Redis): each rotation refreshes it, so
an active session survives, but a session left idle past the cap loses its allowlist entry
and can no longer refresh — a re-login is forced. This backs the client idle-logout
server-side (a DevTools-bypassed client can't keep a walked-away session alive). The
revocation markers keep the full refresh-lifetime TTL (a revoked token can't be un-revoked
by expiry). The cap is deliberately longer than the client `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES`
so normal reading gaps don't force a logout.

## Part 5 — pre-launch checklist verification

Production-build + app-protection checklist, verified against the real code + the actual built bundle.

| Item | Status | Evidence |
|---|---|---|
| `next build` passes | ✅ | Clean build, exit 0, all routes compiled. |
| No client source maps in prod | ✅ | `productionBrowserSourceMaps: false` set explicitly in `next.config.ts` (also `poweredByHeader: false`). |
| No dev-only env vars committed | ✅ | Only `services/api/.env.example` (template) is tracked; no `.env` on disk; `.env`/`.env.local` gitignored. Dev fallbacks (`/api`, `localhost:8080`) are safe server-side defaults. |
| No secrets in `NEXT_PUBLIC_*` | ✅ | Only `NEXT_PUBLIC_API_URL` (`/api`) and `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES` (a number). Neither is sensitive. |
| No API keys / internal URLs in client bundle | ✅ | Grep of `.next/static` for `ADMIN_API_KEY`/`JWT_SECRET`/`dev-secret`/`localhost:8080`/`DATABASE_URL`/`REDIS_URL`/`X-Admin-Key` → **none**. Client uses relative `/api` + `/v1/auth`. `API_PROXY_TARGET` lives in `next.config` `rewrites()` (server-only, not bundled). |
| CSRF protection + cookie auth | ✅ | `middleware.CSRFGuard(AllowedOrigins)` on the JWT-protected mutation group (Origin allowlist on unsafe methods, Bearer-exempt); cookies `HttpOnly`+`Secure`(HTTPS)+`SameSite=Lax`; access token in-memory only (localStorage holds just a non-sensitive `is_authenticated` flag). |
| Sanitize user-generated content | ✅ | **Zero** `dangerouslySetInnerHTML`/`innerHTML`/`document.write` in `apps/web/src` — all UGC (names, titles, activity detail, comments, free-response) renders through JSX text interpolation, which React auto-escapes. |
| CAPTCHA / email verification on register | ✅ (CAPTCHA) | Self-hosted human-check (`RequireHuman`) gates `/auth/register` **and** `/auth/token`, plus the per-IP `authThrottle`. Email verification is **not** implemented — the checklist accepts CAPTCHA *or* email verification, so this is satisfied; email verification remains an optional add-on. |
| Account lockout / failed-login delay | ✅ | Redis lockout (`CheckLockout`→429, `RecordFailedAttempt`, `ResetAttempts`), **fail-closed** on Redis error (in-process fallback counter), + `auth.DummyVerify` equalizes login timing to block user-enumeration. |

**Optional follow-ups (not blockers):** a full script-src/style-src CSP (current CSP is `frame-ancestors 'none'` — clickjacking is covered, but a nonce-based CSP would add XSS defense-in-depth on top of React's auto-escaping); email verification on signup; broadening `.gitignore` to `.env.production`/`.env.development` (none exist today).

## Part 6 — registration hardening (unique name/email + email verification)

Three signup gaps closed and **verified live end-to-end**:

- **Case-insensitive unique email.** `Foo@x.com` and `foo@x.com` can no longer both exist (functional unique index on `lower(email)` in migration 028; email normalized to lowercase on register + login). The handler's pre-check is now backed by the DB index, so a concurrent-signup race is caught too (`23505` → `409`).
- **Unique, required display name.** New column `users.display_name` (case-insensitive unique index), required at signup (2–40 chars). A duplicate returns `409 {field:"name"}`; the signup UI surfaces it.
- **Block-until-verified email confirmation.** Signup now creates the account **unverified and issues no session**; the server emails a single-use, 24-hour verification link (`email_verification_tokens`, SHA-256-hashed). Login is refused with `403 email_not_verified` until confirmed. Onboarding (segment/level) moved to `/onboarding`, shown on first verified sign-in. Pluggable sender: SMTP when configured, else a dev log sender. Env: `EMAIL_VERIFICATION_REQUIRED` (default on), `APP_BASE_URL`, `SMTP_*`.

- **Inline "already taken" feedback.** Both signup forms check email + name availability **on blur** (throttled `POST /auth/check-availability`) and show the error immediately under the field — you find out the moment you leave the email box, not after filling the whole form. The submit button is disabled while a field is taken; the DB unique index + register `409` remain the authoritative race-safe guard.

Live-verified (dev API + browser): register → `verificationRequired` (no tokens); duplicate name → 409; `UPPER@`-cased duplicate email → 409; login before verify → 403; `/auth/verify-email` with the logged token → `verified:true`; token single-use (reuse rejected); login after verify → 200 + tokens; `/auth/check-availability` returns `emailAvailable:false` for a registered email and `nameAvailable:false` (case-insensitive) for a taken name; and the signup form shows the inline "already registered" message on blur.

## Part 7 — legal consent + policy documents (152-FZ)

**Built + verified live to the requirements of Federal Law 152-FZ** (incl. amendments through 2025).

- **Two SEPARATE, standalone consents at signup** — the **1 Sept 2025 amendment** prohibits bundling data-processing consent into the Terms. So both signup forms now show **two distinct, un-pre-ticked checkboxes**: (1) accept the Terms of Service + Cookie Policy; (2) a **standalone consent to the processing of personal data** (Art. 9). The submit button is disabled until both are ticked, and the server (`/auth/register`) **rejects** signup unless `acceptedTerms` AND `acceptedDataProcessing` are true. Verified live: Terms-only → `400 {field:dataProcessing}`.
- **Auditable consent record** (migrations `030`+`031` → `legal_consents`). On registration the server writes: `user_id`, the exact versions agreed (`terms/privacy/cookie/consent_version`), `accepted_at` (server timestamp), `ip_address`, `user_agent` — the evidence Roskomnadzor would request. Endpoints: `GET /v1/legal/versions` (public), `GET /v1/me/legal-consents` (the user's own copy).
- **Bilingual documents** (`/legal/consent`, `/legal/privacy`, `/legal/terms`, `/legal/cookies`) — **Russian is the legally-operative version and is shown by default**, with an EN toggle. Drafted to the statutory structure: the **Privacy Policy** ("Политика обработки персональных данных", 152-FZ 18.1) covers operator + responsible person, categories/purposes/legal basis, **data localization (Art. 18.5)**, **retention periods**, cross-border, subject rights, security, minors, and **breach notification (24h/72h)**; the **Consent** carries the Art. 9 elements (data list, purposes, actions, term, withdrawal).
- **Cookie banner** (site-wide, separate action): "Essential only" vs "Accept all"; analytics runs only on explicit "Accept all" (plus the existing adults-only rule).

**Operator obligations to complete before launch (these are filings/facts only you can do — not code):**
- **Complete the `[BRACKETED]` facts** in `lib/legalContent.ts` (+ `services/api/internal/legal/legal.go` versions): operator legal name, ИНН/ОГРН, registered address, contact email, and appoint the **person responsible for organizing processing** (Art. 18.1).
- **File the Roskomnadzor processing notification** (уведомление об обработке ПДн) via the RKN portal **before** processing begins; the retention periods must match the Privacy Policy.
- **Data localization (Art. 18.5, tightened July 2025 by FZ-23)**: initial collection + storage of Russian citizens' data must be on servers **in Russia** — host the API + Postgres on reg.ru's RU infrastructure (a foreign cloud even for the intake form violates this).
- **Under-18 = minor — age-gated by date of birth, handled via the guardian-account model** (the standard for kids' apps):
  - **Date of birth is collected at registration** (a Day/Month/Year wizard on the learner AND teacher signup) and is **required** — it's the authoritative age signal, not the self-selected learning segment. Stored on `users.date_of_birth` (migration 032) so an auditor can verify age against the recorded consent. The server rejects a missing, malformed, future, or >120y date (400, `field=dateOfBirth`).
  - When the DOB shows the registrant is **under 18**, the signup's standalone data-processing consent **reframes as a guardian consent** ("I am this person's parent or legal guardian, I am 18+, and — since a minor cannot consent in law — I consent on their behalf…"), and the audit log records it as a GUARDIAN consent for that account. So the **account holder is the parent/legal guardian**; the child never signs anything.
  - At onboarding, for any under-18 **segment** (kid/teen) the guardian also confirms per-profile: a server-side record is written to `consents` with `segment`, `method=guardian_checkbox`, `created_at`, and the **guardian's account email derived server-side** (not client-claimed).
  - Verified live: missing/future DOB → 400; adult DOB (age 36) stored; minor DOB (age 11) stored + GUARDIAN audit line; the signup UI flips to guardian wording for a minor birth-year and back to self-consent for an adult one; a teen profile writes `consents(segment=teen, consenter_email=<guardian>)`.
- **Breach process**: notify Roskomnadzor within **24h** of detecting an unlawful/accidental transfer, with the investigation result within **72h** (2025 rule). Note: FSB now also audits technical measures; fines since 2025 run 3–15M ₽ (repeat: up to 3% of turnover, cap 500M ₽).
- **Consent retention vs erasure**: decide whether to keep the consent proof after account deletion (the `030` migration flags this; currently CASCADE-deletes).

## Residual / follow-up (not blockers for launch)

- **Russian-language authority**: documents are bilingual with Russian as the operative version; a native review of the Russian legal wording is advisable.

- **Exam-answer extraction** (low): because exam content (with answers) is delivered to
  the browser for rendering, a determined attacker can still read the bundle and submit
  correct answers. Server-side re-grading (above) stops trivial fabrication and score
  inflation; fully closing this needs server-served questions (answers off the client).

- Registration email-enumeration oracle (#8) — accepted; revisit if abused.
- Mobile app (`apps/mobile`) still breaks on the human-check gate — it isn't part of the public web launch; gate it or ship a mobile challenge before that platform goes live.
- Teachers can't self-assign exams (dean-only) and dean management actions aren't themselves in the activity log — product follow-ups, not security.
