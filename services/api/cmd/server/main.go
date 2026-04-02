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
	"github.com/russkiy/api/internal/handler"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

func main() {
	cfg := config.Load()

	// Connect to PostgreSQL
	dbpool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
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

	// Initialize RSA key pair for JWT signing
	keyPair, err := auth.GenerateKeyPair()
	if err != nil {
		log.Fatalf("Failed to generate RSA key pair: %v", err)
	}
	log.Println("Generated RSA-2048 key pair for JWT signing")

	// Initialize token store and lockout manager
	tokenStore := auth.NewMemoryTokenStore()
	lockoutManager := auth.NewLockoutManager()

	// Initialize stores
	userStore := store.NewUserStore(dbpool)
	profileStore := store.NewProfileStore(dbpool)
	sessionStore := store.NewSessionStore(dbpool)
	skillStore := store.NewSkillStore(dbpool)
	contentStore := store.NewContentStore(dbpool)
	streakStore := store.NewStreakStore(dbpool)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(userStore, keyPair, tokenStore, lockoutManager)
	profileHandler := handler.NewProfileHandler(profileStore, skillStore)
	sessionHandler := handler.NewSessionHandler(sessionStore, skillStore, contentStore, streakStore, profileStore, mlClient)
	placementHandler := handler.NewPlacementHandler(skillStore, contentStore, profileStore)
	teacherHandler := handler.NewTeacherHandler()
	skillsHandler := handler.NewSkillsHandler(skillStore, profileStore)
	statsHandler := handler.NewStatsHandler(streakStore, profileStore, skillStore)

	// Router setup
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.MaxBodySize(1 << 20)) // 1 MB max body size (S6 audit fix)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"russkiy-api","version":"0.1.0"}`))
	})

	// Public routes
	r.Route("/v1", func(r chi.Router) {
		// Auth (public)
		r.Post("/auth/register", authHandler.Register)
		r.Post("/auth/token", authHandler.Login)
		r.Post("/auth/refresh", authHandler.Refresh)

		// Skills catalog (public)
		r.Get("/skills", skillsHandler.ListAll)
		r.Get("/skills/category", skillsHandler.ListByCategory)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.JWTAuth(keyPair.PublicKey))

			// Profiles
			r.Post("/profiles", profileHandler.Create)
			r.Get("/profiles", profileHandler.ListByUser)
			r.Get("/profiles/{id}", profileHandler.Get)

			// Learner stats
			r.Get("/stats", statsHandler.GetStats)

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

			// Teacher & Institutional (Phase 2) — role-gated (S4 audit fix)
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("teacher"))
				r.Post("/teacher/cohorts", teacherHandler.CreateCohort)
				r.Get("/teacher/cohorts", teacherHandler.ListCohorts)
				r.Get("/teacher/cohorts/{id}/heatmap", teacherHandler.GetCohortHeatmap)
				r.Post("/teacher/assignments", teacherHandler.CreateAssignment)
				r.Get("/teacher/students/{id}/report", teacherHandler.GetStudentReport)
			})

			// LMS Integration — moved behind auth (S5 audit fix)
			r.Post("/xapi/statements", teacherHandler.ReceiveXAPIStatement)
			r.Post("/lti/launch", teacherHandler.LTILaunch)
			r.Get("/lti/launch", teacherHandler.LTILaunch)
		})
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
