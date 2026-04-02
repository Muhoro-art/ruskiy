package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

type SkillsHandler struct {
	skills   *store.SkillStore
	profiles *store.ProfileStore
}

func NewSkillsHandler(skills *store.SkillStore, profiles *store.ProfileStore) *SkillsHandler {
	return &SkillsHandler{skills: skills, profiles: profiles}
}

// ListAll returns all available skills.
func (h *SkillsHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	skills, err := h.skills.GetAll(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch skills"})
		return
	}
	writeJSON(w, http.StatusOK, skills)
}

// ListByCategory returns skills filtered by category.
func (h *SkillsHandler) ListByCategory(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	if category == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "category query parameter required"})
		return
	}

	skills, err := h.skills.GetByCategory(r.Context(), category)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch skills"})
		return
	}
	writeJSON(w, http.StatusOK, skills)
}

// LearnerSkills returns the authenticated learner's skill states.
func (h *SkillsHandler) LearnerSkills(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	uid, _ := uuid.Parse(userID)
	profiles, err := h.profiles.ListByUserID(r.Context(), uid)
	if err != nil || len(profiles) == 0 {
		writeJSON(w, http.StatusOK, []interface{}{})
		return
	}

	states, err := h.skills.GetLearnerSkills(r.Context(), profiles[0].ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch skill states"})
		return
	}
	writeJSON(w, http.StatusOK, states)
}

// WeakSkills returns the learner's weakest skills.
func (h *SkillsHandler) WeakSkills(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	uid, _ := uuid.Parse(userID)
	profiles, err := h.profiles.ListByUserID(r.Context(), uid)
	if err != nil || len(profiles) == 0 {
		writeJSON(w, http.StatusOK, []interface{}{})
		return
	}

	skills, err := h.skills.GetWeakest(r.Context(), profiles[0].ID, 10)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch weak skills"})
		return
	}
	writeJSON(w, http.StatusOK, skills)
}
