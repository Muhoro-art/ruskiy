package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/engine"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

type StatsHandler struct {
	streaks  *store.StreakStore
	profiles *store.ProfileStore
	skills   *store.SkillStore
}

func NewStatsHandler(streaks *store.StreakStore, profiles *store.ProfileStore, skills *store.SkillStore) *StatsHandler {
	return &StatsHandler{streaks: streaks, profiles: profiles, skills: skills}
}

// GetStats returns the learner's aggregate stats (streak, XP, level, skill counts).
func (h *StatsHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	uid, _ := uuid.Parse(userID)
	profiles, err := h.profiles.ListByUserID(r.Context(), uid)
	if err != nil || len(profiles) == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"streakDays": 0, "totalXp": 0, "level": 1,
			"skillsMastered": 0, "totalSkills": 0,
		})
		return
	}

	profile := profiles[0]
	stats, _ := h.streaks.Get(r.Context(), profile.ID)
	skills, _ := h.skills.GetLearnerSkills(r.Context(), profile.ID)

	mastered := 0
	learning := 0
	for _, sk := range skills {
		if sk.Status == "mastered" {
			mastered++
		}
		if sk.Status == "learning" || sk.Status == "review" {
			learning++
		}
	}

	level := 1
	if stats != nil {
		level = engine.LevelFromXP(stats.TotalXP)
	}

	streakDays := 0
	longestStreak := 0
	totalXP := 0
	totalSessions := 0
	if stats != nil {
		streakDays = stats.CurrentStreak
		longestStreak = stats.LongestStreak
		totalXP = stats.TotalXP
		totalSessions = stats.TotalSessions
	}

	resp := map[string]interface{}{
		"streakDays":     streakDays,
		"longestStreak":  longestStreak,
		"totalXp":        totalXP,
		"level":          level,
		"totalSessions":  totalSessions,
		"skillsMastered": mastered,
		"skillsLearning": learning,
		"totalSkills":    len(skills),
		"currentLevel":   profile.CurrentLevel,
		"learnerId":      profile.ID,
	}

	writeJSON(w, http.StatusOK, resp)
}
