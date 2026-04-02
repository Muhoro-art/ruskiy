package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/model"
	"github.com/russkiy/api/internal/store"
)

type ProfileHandler struct {
	profiles *store.ProfileStore
	skills   *store.SkillStore
}

func NewProfileHandler(profiles *store.ProfileStore, skills *store.SkillStore) *ProfileHandler {
	return &ProfileHandler{profiles: profiles, skills: skills}
}

func (h *ProfileHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req model.CreateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.DisplayName == "" || req.Segment == "" || req.TargetLevel == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "displayName, segment, and targetLevel are required"})
		return
	}

	// Input validation (C3 audit fix)
	if len(req.DisplayName) > 100 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "displayName must be 100 characters or fewer"})
		return
	}
	validSegments := map[string]bool{"teen": true, "migrant": true, "uni_prep": true, "kid": true, "senior": true, "professional": true}
	if !validSegments[string(req.Segment)] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid segment value"})
		return
	}
	validLevels := map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true, "C2": true}
	if !validLevels[string(req.TargetLevel)] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid targetLevel value"})
		return
	}

	uid, _ := uuid.Parse(userID)
	domain := req.Domain
	if domain == "" {
		domain = model.DomainGeneral
	}

	profile := &model.LearnerProfile{
		ID:             uuid.New(),
		UserID:         uid,
		DisplayName:    req.DisplayName,
		Segment:        req.Segment,
		NativeLanguage: "en",
		Domain:         domain,
		CurrentLevel:   model.LevelA1,
		TargetLevel:    req.TargetLevel,
		WeeklyHours:    req.WeeklyHours,
		CreatedAt:      time.Now(),
	}

	if req.TargetDate != nil {
		t, err := time.Parse("2006-01-02", *req.TargetDate)
		if err == nil {
			profile.TargetDate = &t
		}
	}

	if err := h.profiles.Create(r.Context(), profile); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create profile"})
		return
	}

	// Initialize skills for this learner based on their starting level
	if err := h.skills.InitializeSkills(r.Context(), profile.ID, string(profile.CurrentLevel)); err != nil {
		log.Printf("Warning: failed to initialize skills for profile %s: %v", profile.ID, err)
	}

	writeJSON(w, http.StatusCreated, profile)
}

func (h *ProfileHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := chi.URLParam(r, "id")
	profileID, err := uuid.Parse(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid profile ID"})
		return
	}

	profile, err := h.profiles.GetByID(r.Context(), profileID)
	if err != nil || profile == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "profile not found"})
		return
	}

	// Ownership check — user can only view their own profiles (S4 audit fix)
	if profile.UserID.String() != userID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"})
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

func (h *ProfileHandler) ListByUser(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	uid, _ := uuid.Parse(userID)
	profiles, err := h.profiles.ListByUserID(r.Context(), uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list profiles"})
		return
	}

	writeJSON(w, http.StatusOK, profiles)
}
