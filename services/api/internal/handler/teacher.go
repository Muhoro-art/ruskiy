package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/middleware"
)

type TeacherHandler struct{}

func NewTeacherHandler() *TeacherHandler {
	return &TeacherHandler{}
}

// Cohort management

type CreateCohortRequest struct {
	Name string `json:"name"`
}

func (h *TeacherHandler) CreateCohort(w http.ResponseWriter, r *http.Request) {
	teacherID := middleware.GetUserID(r.Context())
	if teacherID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req CreateCohortRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	cohort := map[string]interface{}{
		"id":        uuid.New(),
		"teacherId": teacherID,
		"name":      req.Name,
		"createdAt": time.Now(),
		"students":  []interface{}{},
	}

	writeJSON(w, http.StatusCreated, cohort)
}

func (h *TeacherHandler) ListCohorts(w http.ResponseWriter, r *http.Request) {
	// Mock response — would query DB
	cohorts := []map[string]interface{}{
		{
			"id":              "c1",
			"name":            "Russian 101 — Spring 2026",
			"studentCount":    24,
			"avgProficiency":  0.42,
			"activeTodayCount": 18,
		},
	}
	writeJSON(w, http.StatusOK, cohorts)
}

func (h *TeacherHandler) GetCohortHeatmap(w http.ResponseWriter, r *http.Request) {
	cohortID := chi.URLParam(r, "id")

	// Mock heatmap data — would aggregate from learner_skills table
	skills := []string{
		"Nom. Case", "Acc. Case", "Gen. Case", "Dat. Case",
		"Verb Conj.", "Aspect", "Phonetics", "Vocabulary",
	}

	students := []map[string]interface{}{
		{"id": "s1", "name": "Anna K.", "scores": []float64{0.92, 0.78, 0.45, 0.31, 0.85, 0.52, 0.67, 0.88}},
		{"id": "s2", "name": "Boris M.", "scores": []float64{0.88, 0.65, 0.38, 0.42, 0.71, 0.33, 0.55, 0.72}},
		{"id": "s3", "name": "Clara S.", "scores": []float64{0.95, 0.91, 0.72, 0.68, 0.93, 0.78, 0.82, 0.94}},
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cohortId": cohortID,
		"skills":   skills,
		"students": students,
	})
}

// Assignment management

type CreateAssignmentRequest struct {
	CohortID     string   `json:"cohortId"`
	Title        string   `json:"title"`
	TargetSkills []string `json:"targetSkills"`
	MinExercises int      `json:"minExercises"`
	Deadline     string   `json:"deadline"`
	DiffMin      float64  `json:"difficultyMin"`
	DiffMax      float64  `json:"difficultyMax"`
}

func (h *TeacherHandler) CreateAssignment(w http.ResponseWriter, r *http.Request) {
	teacherID := middleware.GetUserID(r.Context())
	if teacherID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req CreateAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	assignment := map[string]interface{}{
		"id":           uuid.New(),
		"cohortId":     req.CohortID,
		"teacherId":    teacherID,
		"title":        req.Title,
		"targetSkills": req.TargetSkills,
		"minExercises": req.MinExercises,
		"deadline":     req.Deadline,
		"createdAt":    time.Now(),
	}

	writeJSON(w, http.StatusCreated, assignment)
}

func (h *TeacherHandler) GetStudentReport(w http.ResponseWriter, r *http.Request) {
	studentID := chi.URLParam(r, "id")

	// Mock student report — would query knowledge graph + error history
	report := map[string]interface{}{
		"studentId":         studentID,
		"currentLevel":      "A1",
		"avgAccuracy":       0.54,
		"learningVelocity":  1.2,
		"predictedPlateau":  "Genitive Case (B1 level)",
		"topErrorType":      "transfer",
		"sessionsCompleted": 31,
		"interventionSuggestions": []string{
			"Schedule focused case system review",
			"Increase exposure to case-marked nouns in context",
			"Consider peer pairing for grammar practice",
		},
	}

	writeJSON(w, http.StatusOK, report)
}

// LMS Integration — xAPI statement receiver
func (h *TeacherHandler) ReceiveXAPIStatement(w http.ResponseWriter, r *http.Request) {
	var statement map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&statement); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid xAPI statement"})
		return
	}

	// Store statement in LRS (Learning Record Store)
	// In production, this would persist to the analytics data lake
	statementID := uuid.New()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"statementId": statementID,
		"stored":      true,
	})
}

// LTI 1.3 Launch endpoint
func (h *TeacherHandler) LTILaunch(w http.ResponseWriter, r *http.Request) {
	// In production: validate JWT, extract claims, SSO the user
	// For now, return the expected LTI launch response
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"launchType": "LTI-1.3",
		"status":     "ready",
		"message":    "LTI launch endpoint active. Configure your LMS with this URL.",
		"config": map[string]string{
			"loginUrl":    "/v1/lti/login",
			"launchUrl":   "/v1/lti/launch",
			"jwksUrl":     "/v1/lti/.well-known/jwks.json",
			"redirectUri": "/v1/lti/callback",
		},
	})
}

// Leaderboard
func (h *TeacherHandler) GetLeaderboard(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope") // "friends", "cohort", "global"
	if scope == "" {
		scope = "friends"
	}

	// Mock leaderboard — would query Redis sorted sets
	leaderboard := []map[string]interface{}{
		{"rank": 1, "name": "Clara S.", "xp": 1420, "streakDays": 28, "level": "A2"},
		{"rank": 2, "name": "Elena R.", "xp": 1285, "streakDays": 15, "level": "A2"},
		{"rank": 3, "name": "Anna K.", "xp": 1190, "streakDays": 22, "level": "A2"},
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"scope":       scope,
		"period":      "weekly",
		"resetsIn":    "3d 14h",
		"leaderboard": leaderboard,
	})
}
