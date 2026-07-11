package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/russkiy/api/internal/auth"
	"github.com/russkiy/api/internal/client"
	"github.com/russkiy/api/internal/config"
	"github.com/russkiy/api/internal/email"
	"github.com/russkiy/api/internal/event"
	"github.com/russkiy/api/internal/handler"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/redisstore"
	"github.com/russkiy/api/internal/store"
)

func main() {
	cfg := config.Load()

	// Connect to PostgreSQL with an explicitly-sized pool. Defaults are tiny
	// (≈max(4, #CPUs)); explicit bounds + lifetimes keep N replicas under
	// Postgres max_connections and recycle stale connections.
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Invalid DATABASE_URL: %v", err)
	}
	poolCfg.MaxConns = int32(cfg.DBMaxConns)
	poolCfg.MinConns = int32(cfg.DBMinConns)
	poolCfg.MaxConnLifetime = time.Hour
	poolCfg.MaxConnIdleTime = 30 * time.Minute
	poolCfg.HealthCheckPeriod = time.Minute
	dbpool, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer dbpool.Close()

	if err := dbpool.Ping(context.Background()); err != nil {
		log.Fatalf("Unable to ping database: %v", err)
	}
	log.Println("Connected to PostgreSQL")

	// Initialize ML client
	mlURL := os.Getenv("ML_SERVICE_URL")
	if mlURL == "" {
		mlURL = "http://localhost:8090"
	}
	mlClient := client.NewMLClient(mlURL)

	// Load (or create+persist) the RSA key pair for JWT signing. Persisting the
	// key means tokens survive restarts and are valid across all replicas; set
	// JWT_PRIVATE_KEY_PATH in production. Empty path = ephemeral dev key.
	keyPair, err := auth.LoadOrCreateKeyPair(cfg.JWTKeyPath)
	if err != nil {
		log.Fatalf("Failed to load RSA key pair: %v", err)
	}
	if cfg.JWTKeyPath == "" {
		log.Println("WARNING: using an ephemeral RSA key (set JWT_PRIVATE_KEY_PATH to persist it)")
	} else {
		log.Printf("Loaded RSA key pair from %s", cfg.JWTKeyPath)
	}

	// Apply configured token lifetimes over the package defaults. Set ONCE here,
	// before any token is issued and before the Redis token-store TTL below is derived
	// from auth.RefreshTokenTTL, so JWT_ACCESS_TTL_MINUTES / JWT_REFRESH_TTL_DAYS take
	// real effect (previously these env vars were loaded but never read).
	auth.AccessTokenTTL = cfg.JWTAccessTTL
	auth.RefreshTokenTTL = cfg.JWTRefreshTTL
	// The refresh-allowlist TTL doubles as a server-side idle cap: shorter than the full
	// refresh lifetime, refreshed on each rotation, so an idle session can no longer
	// refresh once it lapses. Requires Redis (the memory fallback doesn't expire).
	sessionStoreTTL := auth.RefreshTokenTTL
	if cfg.SessionIdleTTL > 0 && cfg.SessionIdleTTL < sessionStoreTTL {
		sessionStoreTTL = cfg.SessionIdleTTL
	}
	log.Printf("Token lifetimes: access=%s refresh=%s idle-cap=%s", auth.AccessTokenTTL, auth.RefreshTokenTTL, sessionStoreTTL)

	// Initialize auth state. Prefer Redis (shared across replicas, survives
	// restarts); fall back to in-memory for local dev when Redis is unavailable.
	var tokenStore auth.TokenStore = auth.NewMemoryTokenStore()
	var lockoutManager auth.Lockout = auth.NewLockoutManager()
	var rateLimit func(http.Handler) http.Handler
	// LTI launch replay protection (state→nonce). Redis-backed when available;
	// in-memory fallback keeps single-instance dev secure too. 10-minute TTL
	// comfortably covers the login→launch round-trip.
	var ltiState handler.LTIStateStore = handler.NewMemoryStateStore(10 * time.Minute)
	// Human-verification challenge state (outstanding puzzles + single-use passes).
	// 4-minute solve window; a solved pass lives 10 minutes before it must be re-earned.
	var challengeStore handler.ChallengeStore = handler.NewMemoryChallengeStore(4*time.Minute, 10*time.Minute)
	if rdb, rerr := redisstore.New(cfg.RedisURL); rerr == nil {
		tokenStore = redisstore.NewTokenStore(rdb, sessionStoreTTL, auth.RefreshTokenTTL)
		lockoutManager = redisstore.NewLockout(rdb, auth.MaxFailedAttempts, auth.LockoutDuration, auth.LockoutDuration)
		rateLimit = redisstore.NewRateLimiter(rdb, 100, 1000, time.Minute).RateLimit()
		ltiState = redisstore.NewLTIStateStore(rdb, 10*time.Minute)
		challengeStore = redisstore.NewChallengeStore(rdb, 4*time.Minute, 10*time.Minute)
		log.Println("Connected to Redis — token revocation, lockout, rate limiting, LTI replay state, and human-check state are shared and durable")
	} else {
		log.Printf("WARNING: Redis unavailable (%v) — using in-memory auth state and rate limiter (dev only)", rerr)
		rateLimit = middleware.NewRateLimiter(middleware.DefaultRateLimitConfig()).RateLimit()
	}

	// Initialize stores
	userStore := store.NewUserStore(dbpool)
	profileStore := store.NewProfileStore(dbpool)
	sessionStore := store.NewSessionStore(dbpool)
	skillStore := store.NewSkillStore(dbpool)
	contentStore := store.NewContentStore(dbpool)
	streakStore := store.NewStreakStore(dbpool)
	curriculumStore := store.NewCurriculumStore(dbpool)
	teacherStore := store.NewTeacherStore(dbpool)
	xapiStore := store.NewXAPIStore(dbpool)
	analyticsStore := store.NewAnalyticsStore(dbpool)
	institutionStore := store.NewInstitutionStore(dbpool)
	examStore := store.NewExamStore(dbpool)
	activityStore := store.NewActivityStore(dbpool)
	emailVerifyStore := store.NewEmailVerifyStore(dbpool)
	legalConsentStore := store.NewLegalConsentStore(dbpool)

	// Email sender for verification links (SMTP when SMTP_* configured, else a dev log
	// sender). The verification link's base is APP_BASE_URL, or the first CORS origin.
	mailer := email.New()
	appBaseURL := cfg.AppBaseURL
	if appBaseURL == "" && len(cfg.AllowedOrigins) > 0 {
		appBaseURL = cfg.AllowedOrigins[0]
	}
	if cfg.EmailVerificationRequired && !mailer.Configured() {
		log.Println("WARNING: EMAIL_VERIFICATION_REQUIRED is on but SMTP is not configured — verification links will only appear in the server log. Set SMTP_HOST/SMTP_FROM (and creds) to actually email them.")
	}

	// Initialize handlers
	// Live push: in-process per-user event channel behind GET /v1/events (SSE).
	notifier := event.NewNotifier()
	authHandler := handler.NewAuthHandler(userStore, keyPair, tokenStore, lockoutManager, emailVerifyStore, mailer, appBaseURL, cfg.EmailVerificationRequired, legalConsentStore)
	challengeHandler := handler.NewChallengeHandler(challengeStore, cfg.HumanCheckEnabled)
	profileHandler := handler.NewProfileHandler(profileStore, skillStore, userStore)
	sessionHandler := handler.NewSessionHandler(sessionStore, skillStore, contentStore, streakStore, profileStore, teacherStore, notifier, mlClient)
	placementHandler := handler.NewPlacementHandler(skillStore, contentStore, profileStore)
	teacherHandler := handler.NewTeacherHandler(teacherStore, institutionStore, profileStore, streakStore, notifier, activityStore)
	institutionHandler := handler.NewInstitutionHandler(institutionStore, userStore, teacherStore, activityStore, cfg.AdminAPIKey)
	skillsHandler := handler.NewSkillsHandler(skillStore, profileStore)
	statsHandler := handler.NewStatsHandler(streakStore, profileStore, skillStore)
	curriculumHandler := handler.NewCurriculumHandler(curriculumStore, profileStore, streakStore, teacherStore, notifier)
	eventsHandler := handler.NewEventsHandler(notifier)
	adminHandler := handler.NewAdminHandler(userStore, cfg.AdminAPIKey)
	xapiHandler := handler.NewXAPIHandler(xapiStore)
	analyticsHandler := handler.NewAnalyticsHandler(analyticsStore, profileStore)
	deanHandler := handler.NewDeanHandler(teacherStore, institutionStore)
	examHandler := handler.NewExamHandler(examStore, institutionStore, profileStore, activityStore)
	ltiHandler := handler.NewLTIHandler(handler.LTIConfig{
		Issuer:         cfg.LTIIssuer,
		ClientID:       cfg.LTIClientID,
		DeploymentID:   cfg.LTIDeploymentID,
		AuthURL:        cfg.LTIAuthURL,
		JWKSURL:        cfg.LTIJWKSURL,
		PlatformKeyPEM: cfg.LTIPlatformKey,
	}, userStore, keyPair, tokenStore, ltiState)

	// Retention: purge behavioral events older than 90 days (data minimization) —
	// the dashboards only ever query a trailing ≤90-day window. Runs at startup then daily.
	go func() {
		purge := func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if n, err := analyticsStore.PurgeOld(ctx, 90); err != nil {
				log.Printf("analytics retention purge failed: %v", err)
			} else if n > 0 {
				log.Printf("analytics retention: purged %d events older than 90 days", n)
			}
			// activity_log is otherwise never purged (only per-account CASCADE), so bound
			// its growth with a generous 1-year retention — deans only view a recent window.
			if n, err := activityStore.PurgeOld(ctx, 365); err != nil {
				log.Printf("activity retention purge failed: %v", err)
			} else if n > 0 {
				log.Printf("activity retention: purged %d actions older than 365 days", n)
			}
			// Expired email-verification tokens (they're short-lived anyway).
			if _, err := emailVerifyStore.PurgeExpired(ctx); err != nil {
				log.Printf("email-verification token purge failed: %v", err)
			}
		}
		purge()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			purge()
		}
	}()

	// Router setup
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(middleware.SecurityHeaders)
	r.Use(chimw.RequestID)
	// Trusted-proxy-aware client IP: chi's RealIP blindly trusts X-Forwarded-For, which
	// lets a client spoof its IP and defeat the per-IP auth throttle. TrustedRealIP only
	// honors XFF when the TCP peer is in TRUSTED_PROXIES (empty ⇒ use the raw peer).
	r.Use(middleware.TrustedRealIP(middleware.ParseCIDRs(cfg.TrustedProxies)))
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.MaxBodySize(1 << 20)) // 1 MB max body size (S6 audit fix)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Human-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Liveness — is the process up?
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"russkiy-api","version":"0.1.0"}`))
	})

	// Readiness — can the process actually serve traffic (DB reachable)? Load
	// balancers should gate routing on this, not /health.
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := dbpool.Ping(ctx); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"unavailable","db":"down"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ready"}`))
	})

	// Public routes
	r.Route("/v1", func(r chi.Router) {
		// Auth (public) — IP-throttled BEFORE the DB lookup, since the per-user rate
		// limiter can't cover unauthenticated requests (it keys on the JWT user id).
		// This bounds credential-stuffing / registration spam / email enumeration.
		authThrottle := middleware.NewIPRateLimiter(20, time.Minute).Limit
		// Human-verification gate: register + token additionally require a single-use
		// pass earned by solving a challenge (bot deterrence). No-op when disabled.
		humanGate := handler.RequireHuman(challengeStore, cfg.HumanCheckEnabled)
		r.With(authThrottle).Get("/auth/challenge", challengeHandler.GetChallenge)
		r.With(authThrottle).Post("/auth/challenge", challengeHandler.VerifyChallenge)
		r.With(authThrottle, humanGate).Post("/auth/register", authHandler.Register)
		r.With(authThrottle, humanGate).Post("/auth/token", authHandler.Login)
		r.With(authThrottle).Post("/auth/refresh", authHandler.Refresh)
		r.With(authThrottle).Post("/auth/logout", authHandler.Logout)
		// Email verification (block-until-verified). Public + IP-throttled; verify consumes
		// a single-use token, resend is always-200 so it can't be used to probe emails.
		r.With(authThrottle).Post("/auth/verify-email", authHandler.VerifyEmail)
		r.With(authThrottle).Post("/auth/resend-verification", authHandler.ResendVerification)
		// Inline signup validation: is this email / display name still free? IP-throttled.
		r.With(authThrottle).Post("/auth/check-availability", authHandler.CheckAvailability)

		// Current legal document versions (public) — the signup form links to + records them.
		r.Get("/legal/versions", authHandler.LegalVersions)

		// Skills catalog (public)
		r.Get("/skills", skillsHandler.ListAll)
		r.Get("/skills/category", skillsHandler.ListByCategory)

		// Admin (gated by the X-Admin-Key header, not JWT — for bootstrapping roles).
		// These are UNAUTHENTICATED-until-key-checked and grant role escalation + tenant
		// creation, so they MUST be IP-throttled to bound brute-forcing of the admin key.
		r.With(authThrottle).Post("/admin/users/role", adminHandler.SetRole)
		// Platform provisioning: create an institution (tenant) + appoint its first dean.
		r.With(authThrottle).Post("/admin/institutions", institutionHandler.CreateInstitution)
		r.With(authThrottle).Post("/admin/institutions/{id}/members", institutionHandler.AppointMember)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.JWTAuth(keyPair.PublicKey))
			// CSRF defense-in-depth for cookie-authenticated mutations (Bearer clients
			// are exempt). Runs after auth so unsafe cross-origin cookie requests 403.
			r.Use(middleware.CSRFGuard(cfg.AllowedOrigins))
			r.Use(rateLimit) // per-user rate limiting (Redis-backed when available)

			// Account self-service deletion (right-to-erasure): CASCADE purges all
			// owned data (profiles, sessions, skills, analytics, consents, xapi rows).
			r.Delete("/me", authHandler.DeleteAccount)

			// The caller's own consent audit trail (what they agreed to, when, from where).
			r.Get("/me/legal-consents", authHandler.MyLegalConsents)

			// Profiles
			r.Post("/profiles", profileHandler.Create)
			r.Get("/profiles", profileHandler.ListByUser)
			r.Get("/profiles/{id}", profileHandler.Get)

			// Learner stats
			r.Get("/stats", statsHandler.GetStats)

			// Curriculum progress sync (cross-device)
			r.Get("/curriculum/progress", curriculumHandler.GetProgress)
			r.Put("/curriculum/progress", curriculumHandler.PutProgress)
			// Per-question Path answers — feeds the teacher's answer sheets.
			r.Post("/curriculum/answers", curriculumHandler.PostAnswers)

			// Skills (learner-specific)
			r.Get("/skills/me", skillsHandler.LearnerSkills)
			r.Get("/skills/weak", skillsHandler.WeakSkills)

			// Placement Assessment
			r.Post("/placement/generate", placementHandler.GeneratePlacement)
			r.Post("/placement/submit", placementHandler.SubmitPlacement)

			// Sessions
			r.Post("/sessions/generate", sessionHandler.Generate)
			r.Get("/sessions/{id}/state", sessionHandler.GetState)
			r.Post("/sessions/{id}/submit", sessionHandler.Submit)
			r.Post("/sessions/{id}/complete", sessionHandler.Complete)
			r.Get("/sessions/history", sessionHandler.History)

			// Leaderboard (any authenticated user)
			r.Get("/leaderboard", teacherHandler.GetLeaderboard)

			// Institution self-serve (any authenticated user): read own tenant context,
			// join by code (students), or accept a teacher/dean invite.
			r.Get("/institution/me", institutionHandler.Me)
			r.Post("/institution/join", institutionHandler.Join)
			r.Post("/institution/invites/accept", institutionHandler.AcceptInvite)

			// Cohort joining — LEARNER-consented (see cohort_invite.go): a student
			// accepts/declines a teacher's invitation, or redeems a join code the
			// teacher shared. Assignments: what's assigned to ME.
			r.Get("/me/cohort-invites", teacherHandler.MyCohortInvites)
			r.Post("/me/cohort-invites/{id}/respond", teacherHandler.RespondCohortInvite)
			r.Post("/cohorts/join", teacherHandler.JoinCohortByCode)
			r.Get("/me/assignments", teacherHandler.MyAssignments)
			// Phase B delivery: the materials attached to an assignment the caller
			// can see. Phase C pool: moderator-approved content, platform-wide.
			r.Get("/me/assignments/{id}/content", teacherHandler.MyAssignmentContent)
			r.Post("/me/assignments/{id}/complete", teacherHandler.CompleteMyAssignment)
			// Dean-assigned exams the learner can take + submit a result for.
			r.Get("/me/exams", examHandler.Mine)
			r.Get("/me/exams/{id}", examHandler.Get)
			r.Post("/me/exams/{id}/submit", examHandler.Submit)
			// Live updates: SSE stream of assignment created/completed events for
			// the signed-in user (clients keep a slow poll as fallback).
			r.Get("/events", eventsHandler.Stream)
			r.Get("/content/global", teacherHandler.GlobalContent)

			// Teacher & Institutional — role-gated. Deans are admitted too (they get
			// read-only oversight of every teacher's cohorts/students inside the handlers).
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireAnyRole("teacher", "dean"))
				r.Get("/teacher/overview", teacherHandler.Overview) // command center
				r.Post("/teacher/cohorts", teacherHandler.CreateCohort)
				r.Get("/teacher/cohorts", teacherHandler.ListCohorts)
				// Membership is INVITE-only (student must accept) or via join code —
				// the old force-add endpoint is gone.
				r.Post("/teacher/cohorts/{id}/invites", teacherHandler.InviteCohortMember)
				r.Get("/teacher/cohorts/{id}/invites", teacherHandler.ListCohortInvitesHandler)
				r.Delete("/teacher/cohorts/{id}/members/{learnerId}", teacherHandler.RemoveCohortMember)
				r.Post("/teacher/cohorts/{id}/code", teacherHandler.RotateCohortCode)
				r.Get("/teacher/cohorts/{id}/heatmap", teacherHandler.GetCohortHeatmap)
				r.Get("/teacher/cohorts/{id}/roster", teacherHandler.GetCohortRoster)
				// Desk drill-down: which assignments one student did / didn't do,
				// with the per-question results of their single recorded attempt.
				r.Get("/teacher/cohorts/{id}/students/{learnerID}/assignments", teacherHandler.StudentAssignmentsDetail)
				// Full-page answer sheet for one student × one assignment («Ответы ↗»).
				r.Get("/teacher/cohorts/{id}/students/{learnerID}/assignments/{assignmentID}/answers", teacherHandler.StudentAssignmentAnswers)
				// Period report (day/week/month): per-student activity + teacher commentary.
				r.Get("/teacher/cohorts/{id}/report", teacherHandler.GetCohortReport)
				r.Post("/teacher/cohorts/{id}/report/comment", teacherHandler.PostReportComment)
				r.Post("/teacher/assignments", teacherHandler.CreateAssignment)
				r.Get("/teacher/assignments", teacherHandler.ListAssignments)
				// Студия Phase A — authored content (author-scoped CRUD + moderation submit).
				r.Post("/teacher/content", teacherHandler.CreateContent)
				r.Get("/teacher/content", teacherHandler.ListContent)
				r.Patch("/teacher/content/{id}", teacherHandler.UpdateContent)
				r.Delete("/teacher/content/{id}", teacherHandler.DeleteContent)
				r.Post("/teacher/content/{id}/submit", teacherHandler.SubmitContent)
				r.Get("/teacher/learners", teacherHandler.SearchLearners)
				r.Get("/teacher/students/{id}/report", teacherHandler.GetStudentReport)
			})

			// Dean command & control — sees how every teacher is performing.
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("dean"))
				r.Get("/dean/overview", deanHandler.Overview)
				r.Get("/dean/teachers/{id}", deanHandler.TeacherDetail)
				// Institution management (dean-scoped to their own tenant): invite
				// teachers, view the enrolled-student pool, and assign cohorts.
				r.Post("/institution/invites", institutionHandler.Invite)
				r.Get("/institution/students", institutionHandler.Students)
				r.Get("/institution/teachers", institutionHandler.Teachers)
				r.Post("/institution/cohorts", institutionHandler.AssignCohort)
				r.Get("/institution/cohorts", institutionHandler.ListCohorts)
				r.Post("/institution/cohorts/{id}/members", institutionHandler.EnrolStudent)
				// Dean management: teachers, cohorts, students, invites, institution settings.
				r.Delete("/institution/teachers/{userId}", institutionHandler.RemoveTeacher)
				r.Patch("/institution/teachers/{userId}/role", institutionHandler.SetTeacherRole)
				r.Get("/institution/invites", institutionHandler.ListInvites)
				r.Delete("/institution/invites/{inviteId}", institutionHandler.RevokeInvite)
				r.Patch("/institution/cohorts/{id}", institutionHandler.UpdateCohort)
				r.Delete("/institution/cohorts/{id}", institutionHandler.DeleteCohort)
				r.Delete("/institution/cohorts/{id}/members/{learnerId}", institutionHandler.RemoveCohortStudent)
				r.Delete("/institution/students/{learnerId}", institutionHandler.UnenrolStudent)
				r.Patch("/institution", institutionHandler.UpdateInstitution)
				r.Post("/institution/code", institutionHandler.RotateJoinCode)
				// Dean-assigned exams + exam-based teacher performance.
				r.Get("/institution/exams", examHandler.List)
				r.Post("/institution/exams", examHandler.Create)
				r.Delete("/institution/exams/{id}", examHandler.Delete)
				r.Get("/institution/exams/{id}/results", examHandler.Results)
				r.Get("/institution/exam-performance", examHandler.TeacherPerf)
				// Teacher activity panel (proactive vs passive).
				r.Get("/institution/activity", institutionHandler.ActivityFeed)
				r.Get("/institution/activity/counts", institutionHandler.ActivityCounts)
			})

			// xAPI LRS (authenticated client posts/queries statements)
			r.Post("/xapi/statements", xapiHandler.Store)
			r.Get("/xapi/statements", xapiHandler.List)

			// Product analytics: any authenticated learner emits behavioral events
			// (minors are dropped server-side inside the handler).
			r.Post("/analytics/events", analyticsHandler.Ingest)

			// Admin monitoring dashboards — role-gated to admins only.
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("admin"))
				r.Get("/admin/analytics/overview", analyticsHandler.Overview)
				r.Get("/admin/analytics/routes", analyticsHandler.Routes)
				r.Get("/admin/analytics/heatmap", analyticsHandler.Heatmap)
				r.Get("/admin/analytics/engagement", analyticsHandler.Engagement)
				// Студия Phase C — content moderation queue (approve/reject + audit).
				r.Get("/admin/content/reviews", teacherHandler.ListContentReviews)
				r.Post("/admin/content/{id}/review", teacherHandler.ResolveContentReview)
			})
		})

		// LTI 1.3 — public: the platform/browser hits these without our JWT. IP-throttled
		// like the other public routes: /lti/launch does real work (RS256 id_token verify,
		// JWKS fetch, state/nonce lookup, user provisioning) so it needs a rate cap too.
		r.With(authThrottle).Get("/lti/login", ltiHandler.Login)
		r.With(authThrottle).Post("/lti/login", ltiHandler.Login)
		r.With(authThrottle).Post("/lti/launch", ltiHandler.Launch)
	})

	// Start server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	log.Printf("Russkiy API server starting on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
	log.Println("Server stopped")
}

func init() {
	fmt.Println(`
  ██████  ██    ██ ███████ ███████ ██   ██ ██ ██    ██
  ██   ██ ██    ██ ██      ██      ██  ██  ██  ██  ██
  ██████  ██    ██ ███████ ███████ █████   ██   ████
  ██   ██ ██    ██      ██      ██ ██  ██  ██    ██
  ██   ██  ██████  ███████ ███████ ██   ██ ██    ██

  Adaptive Russian Language Learning Platform
  `)
}
