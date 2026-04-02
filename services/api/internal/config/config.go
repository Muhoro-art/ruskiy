package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	JWTSecret      string
	JWTAccessTTL   time.Duration
	JWTRefreshTTL  time.Duration
	AllowedOrigins []string
	Environment    string
}

func Load() *Config {
	env := getEnv("ENVIRONMENT", "development")

	cfg := &Config{
		Port:          getEnv("PORT", "8080"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://russkiy:russkiy@localhost:5432/russkiy?sslmode=disable"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTAccessTTL:  time.Duration(getEnvInt("JWT_ACCESS_TTL_MINUTES", 15)) * time.Minute,
		JWTRefreshTTL: time.Duration(getEnvInt("JWT_REFRESH_TTL_DAYS", 30)) * 24 * time.Hour,
		Environment:   env,
	}

	// S3 audit fix — warn if using default JWT secret in non-dev environments
	if env != "development" && cfg.JWTSecret == "dev-secret-change-in-production" {
		log.Println("WARNING: Using default JWT secret in non-development environment. Set JWT_SECRET env var!")
	}

	// C6 audit fix — configurable CORS origins via env var
	originsEnv := os.Getenv("ALLOWED_ORIGINS")
	if originsEnv != "" {
		cfg.AllowedOrigins = strings.Split(originsEnv, ",")
	} else {
		cfg.AllowedOrigins = []string{"http://localhost:3000", "http://localhost:3939", "http://localhost:8081"}
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
