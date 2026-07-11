package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/client"
	"github.com/russkiy/api/internal/engine"
	"github.com/russkiy/api/internal/event"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/model"
	"github.com/russkiy/api/internal/store"
)

type SessionHandler struct {
	sessions *store.SessionStore
	skills   *store.SkillStore
	content  *store.ContentStore
	streaks  *store.StreakStore
	profiles *store.ProfileStore
	teacher  *store.TeacherStore // auto-completes practice assignments on session finish (nil-safe)
	notifier *event.Notifier     // pushes completion events to the teacher (nil-safe)
	ml       *client.MLClient
}

func NewSessionHandler(
	sessions *store.SessionStore,
	skills *store.SkillStore,
	content *store.ContentStore,
	streaks *store.StreakStore,
	profiles *store.ProfileStore,
	teacher *store.TeacherStore,
	notifier *event.Notifier,
	ml *client.MLClient,
) *SessionHandler {
	return &SessionHandler{
		sessions: sessions,
		skills:   skills,
		content:  content,
		streaks:  streaks,
		profiles: profiles,
		teacher:  teacher,
		notifier: notifier,
		ml:       ml,
	}
}

func (h *SessionHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req model.GenerateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	// Validate time budget bounds (C3 audit fix)
	if req.TimeBudgetMinutes < 5 {
		req.TimeBudgetMinutes = 5
	}
	if req.TimeBudgetMinutes > 60 {
		req.TimeBudgetMinutes = 60
	}

	ctx := r.Context()

	// Get learner profile for segment/level info
	profile, err := h.profiles.GetByID(ctx, req.LearnerID)
	if err != nil || profile == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "learner profile not found"})
		return
	}

	// Ownership: the body-supplied learnerId must resolve to a profile owned by the
	// authenticated caller. Without this, any learner could generate sessions and
	// initialize/read another learner's skills by passing their profile id (IDOR).
	if uid, perr := uuid.Parse(middleware.GetUserID(ctx)); perr != nil || profile.UserID != uid {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"})
		return
	}

	// Configure session based on time budget
	cfg := engine.DefaultSessionConfig(req.TimeBudgetMinutes)

	// Fetch learner's skill states
	dueSkills, err := h.skills.GetDueForReview(ctx, req.LearnerID, cfg.MaxItems)
	if err != nil {
		log.Printf("Error fetching due skills: %v", err)
	}
	weakSkills, err := h.skills.GetWeakest(ctx, req.LearnerID, cfg.MaxItems)
	if err != nil {
		log.Printf("Error fetching weak skills: %v", err)
	}
	allSkills, err := h.skills.GetLearnerSkills(ctx, req.LearnerID)
	if err != nil {
		log.Printf("Error fetching all skills: %v", err)
	}

	// If learner has no skills initialized yet, initialize them
	if len(allSkills) == 0 {
		if initErr := h.skills.InitializeSkills(ctx, req.LearnerID, string(profile.CurrentLevel)); initErr != nil {
			log.Printf("Error initializing skills: %v", initErr)
		}
		allSkills, _ = h.skills.GetLearnerSkills(ctx, req.LearnerID)
	}

	// Fetch unlocked skills (prerequisites met) for prerequisite enforcement
	unlockedSkills, err := h.skills.GetUnlockedSkills(ctx, req.LearnerID, engine.PrerequisiteThreshold)
	if err != nil {
		log.Printf("Error fetching unlocked skills: %v", err)
	}
	unlockedIDs := make(map[string]bool, len(unlockedSkills))
	for _, sk := range unlockedSkills {
		unlockedIDs[sk.SkillID] = true
	}
	log.Printf("[Adaptive] Learner %s: %d total skills, %d unlocked (prerequisites met)", req.LearnerID, len(allSkills), len(unlockedIDs))

	// Select skills for this session (with prerequisite enforcement)
	selections := engine.SelectSkills(dueSkills, weakSkills, allSkills, cfg, unlockedIDs)

	// If no skill selections possible (empty DB), return a minimal session
	if len(selections) == 0 {
		writeJSON(w, http.StatusOK, map[string]string{"error": "no skills available for session"})
		return
	}

	// Gather skill IDs for content query
	skillIDs := make([]string, len(selections))
	for i, sel := range selections {
		skillIDs[i] = sel.Skill.SkillID
	}

	// Fetch content matching these skills — try segment-specific first, then fallback
	// Also search across nearby CEFR levels (i+1 principle: mix current + one above)
	contentAtoms, err := h.content.GetBySkills(ctx, skillIDs, string(profile.CurrentLevel), string(profile.Segment), cfg.MaxItems*3)
	if err != nil {
		log.Printf("Error fetching segment content: %v", err)
	}
	log.Printf("[Adaptive] Found %d segment-specific content atoms for segment=%s, level=%s", len(contentAtoms), profile.Segment, profile.CurrentLevel)

	// Supplement with non-segment content if we don't have enough
	if len(contentAtoms) < cfg.MaxItems*2 {
		fallbackAtoms, fbErr := h.content.GetBySkillsAny(ctx, skillIDs, string(profile.CurrentLevel), cfg.MaxItems*3)
		if fbErr != nil {
			log.Printf("Error fetching fallback content: %v", fbErr)
		}
		// Append fallback content, avoiding duplicates
		existingIDs := make(map[uuid.UUID]bool, len(contentAtoms))
		for _, c := range contentAtoms {
			existingIDs[c.ID] = true
		}
		for _, c := range fallbackAtoms {
			if !existingIDs[c.ID] {
				contentAtoms = append(contentAtoms, c)
			}
		}
		log.Printf("[Adaptive] After fallback: %d total content atoms", len(contentAtoms))
	}

	// Get recently used content to avoid repetition
	recentlyUsed, _ := h.content.GetRecentlyUsed(ctx, req.LearnerID, 7)

	// Create the session
	session := &model.Session{
		ID:           uuid.New(),
		LearnerID:    req.LearnerID,
		Status:       model.SessionActive,
		CurrentIndex: 0,
		TotalXP:      0,
		StartedAt:    time.Now(),
		AccuracyRate: 0,
	}

	if err := h.sessions.Create(ctx, session); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session"})
		return
	}

	// Build session items using adaptive engine
	items := engine.BuildSession(session.ID, selections, contentAtoms, recentlyUsed)

	// Persist session items
	if err := h.sessions.CreateSessionItems(ctx, items); err != nil {
		log.Printf("Error creating session items: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create session items"})
		return
	}

	// Increment usage counters
	for _, item := range items {
		_ = h.content.IncrementUsage(ctx, item.ContentID)
	}

	// Build response with content data
	itemsWithContent := make([]model.SessionItemWithContent, len(items))
	for i, item := range items {
		itemsWithContent[i] = model.SessionItemWithContent{SessionItem: item}
		c, err := h.content.GetByID(ctx, item.ContentID)
		if err == nil {
			itemsWithContent[i].Content = c
		}
	}

	result := model.SessionWithItems{
		Session: *session,
		Items:   itemsWithContent,
	}

	writeJSON(w, http.StatusCreated, result)
}

func (h *SessionHandler) GetState(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sessionID, err := uuid.Parse(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid session ID"})
		return
	}

	ctx := r.Context()
	session, err := h.sessions.GetByID(ctx, sessionID)
	if err != nil || session == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	// Ownership check — verify session belongs to authenticated user (S4 audit fix)
	if err := h.verifySessionOwnership(r, session); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"})
		return
	}

	items, _ := h.sessions.GetSessionItems(ctx, sessionID)

	// Enrich with content
	itemsWithContent := make([]model.SessionItemWithContent, len(items))
	for i, item := range items {
		itemsWithContent[i] = model.SessionItemWithContent{SessionItem: item}
		c, err := h.content.GetByID(ctx, item.ContentID)
		if err == nil {
			itemsWithContent[i].Content = c
		}
	}

	result := model.SessionWithItems{
		Session: *session,
		Items:   itemsWithContent,
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *SessionHandler) Submit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sessionID, err := uuid.Parse(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid session ID"})
		return
	}

	var result model.ExerciseResult
	if err := json.NewDecoder(r.Body).Decode(&result); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	ctx := r.Context()

	// Ownership check (S4 audit fix)
	session, err := h.sessions.GetByID(ctx, sessionID)
	if err != nil || session == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}
	if err := h.verifySessionOwnership(r, session); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"})
		return
	}

	// Pin every downstream skill/streak/result write to the ownership-validated
	// session's learner, ignoring any body-supplied learnerId (audit IDOR fix):
	// otherwise the FSRS upsert would land on whatever learner the body named.
	result.LearnerID = session.LearnerID

	result.ID = uuid.New()
	result.SessionID = sessionID
	result.Timestamp = time.Now()

	// 1. Run error classification (non-blocking if ML service unavailable)
	if !result.IsCorrect && h.ml != nil {
		classReq := client.ClassifyErrorRequest{
			LearnerResponse: result.Response,
			CorrectAnswer:   result.CorrectAnswer,
		}
		classResp, err := h.ml.ClassifyError(ctx, classReq)
		if err == nil && classResp != nil {
			et := model.ErrorType(classResp.ErrorType)
			result.ErrorType = &et
		}
	}

	// 2. Look up skill for this content
	var skillID string
	contentAtom, _ := h.content.GetByID(ctx, result.ContentID)
	if contentAtom != nil && len(contentAtom.TargetSkills) > 0 {
		skillID = contentAtom.TargetSkills[0]
	}

	// 3. Update FSRS skill state
	var skillConfidence float64
	if skillID != "" {
		learnerSkill, err := h.skills.GetLearnerSkill(ctx, result.LearnerID, skillID)
		if err == nil && learnerSkill != nil {
			skillConfidence = learnerSkill.Confidence

			// Apply FSRS
			grade := engine.GradeFromResult(&result)
			engine.UpdateSkillState(learnerSkill, grade, result.ErrorType)

			// Persist updated state
			if upsertErr := h.skills.UpsertLearnerSkill(ctx, result.LearnerID, learnerSkill); upsertErr != nil {
				log.Printf("Error updating skill state: %v", upsertErr)
			}
		}
	}

	// 4. Calculate XP
	streakStats, _ := h.streaks.Get(ctx, result.LearnerID)
	streakDays := 0
	if streakStats != nil {
		streakDays = streakStats.CurrentStreak
	}
	difficulty := 0.5
	if contentAtom != nil {
		difficulty = contentAtom.Difficulty
	}
	xpEarned := engine.CalculateXP(&result, difficulty, skillConfidence, streakDays)
	result.XPEarned = xpEarned

	// 5. Save the result
	if err := h.sessions.SaveResult(ctx, &result); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save result"})
		return
	}

	// 6. Advance session counters ATOMICALLY in SQL (index + XP increment, accuracy
	// recomputed from exercise_results) so concurrent submits don't lose an update.
	_ = h.sessions.IncrementSessionProgress(ctx, sessionID, xpEarned)

	// Build feedback response
	feedback := map[string]interface{}{
		"result":   result,
		"xpEarned": xpEarned,
	}
	if result.ErrorType != nil {
		feedback["errorType"] = *result.ErrorType
	}

	writeJSON(w, http.StatusOK, feedback)
}

// Complete marks a session as completed and updates streak.
func (h *SessionHandler) Complete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sessionID, err := uuid.Parse(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid session ID"})
		return
	}

	ctx := r.Context()
	session, err := h.sessions.GetByID(ctx, sessionID)
	if err != nil || session == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	// Ownership check (S4 audit fix)
	if err := h.verifySessionOwnership(r, session); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"})
		return
	}

	durationSec := int(time.Since(session.StartedAt).Seconds())
	transitioned, err := h.sessions.CompleteSession(ctx, sessionID, session.TotalXP, session.AccuracyRate, durationSec)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to complete session"})
		return
	}

	// Apply streak + level ONE-SHOT side effects only when THIS call performed the
	// completion transition — a repeated/double-tapped /complete is a no-op, so XP
	// and total_sessions can't be inflated by replaying the request.
	if transitioned == 1 {
		_ = h.streaks.RecordActivity(ctx, session.LearnerID, session.TotalXP)
		if st, gerr := h.streaks.Get(ctx, session.LearnerID); gerr == nil && st != nil {
			_ = h.streaks.UpdateLevel(ctx, session.LearnerID, engine.LevelFromXP(st.TotalXP))
		}
		// Practice-skills assignments (no attached materials) complete through
		// adaptive work: a finished session may have pushed one over its
		// min_exercises bar — mark it done regardless of score, and push a
		// live event to the teacher's open classroom.
		if h.teacher != nil {
			if ids, aerr := h.teacher.AutoCompletePracticeAssignments(ctx, session.LearnerID); aerr == nil && len(ids) > 0 {
				_ = h.streaks.AddXP(ctx, session.LearnerID, xpPracticeBonus*len(ids))
				notifyCompletions(ctx, h.notifier, h.teacher, session.LearnerID, ids)
			}
		}
	}
	streakStats, _ := h.streaks.Get(ctx, session.LearnerID)

	// Get skills practiced
	items, _ := h.sessions.GetSessionItems(ctx, sessionID)
	skillSet := make(map[string]bool)
	for _, item := range items {
		if item.SkillID != "" {
			skillSet[item.SkillID] = true
		}
	}
	skills := make([]string, 0, len(skillSet))
	for s := range skillSet {
		skills = append(skills, s)
	}

	summary := model.SessionSummary{
		SessionID:       sessionID,
		TotalExercises:  len(items),
		CorrectCount:    int(session.AccuracyRate * float64(len(items))),
		AccuracyRate:    session.AccuracyRate,
		TotalXP:         session.TotalXP,
		SkillsPracticed: skills,
		Duration:        durationSec,
	}
	if streakStats != nil {
		summary.StreakDays = streakStats.CurrentStreak
	}

	writeJSON(w, http.StatusOK, summary)
}

// History returns recent sessions for the authenticated learner.
func (h *SessionHandler) History(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Get the learner ID from the profile
	uid, _ := uuid.Parse(userID)
	profiles, err := h.profiles.ListByUserID(r.Context(), uid)
	if err != nil || len(profiles) == 0 {
		writeJSON(w, http.StatusOK, []model.Session{})
		return
	}

	sessions, err := h.sessions.ListByLearner(r.Context(), profiles[0].ID, 20)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch sessions"})
		return
	}

	writeJSON(w, http.StatusOK, sessions)
}

// verifySessionOwnership checks that the session belongs to a profile owned
// by the authenticated user. Returns an error if ownership cannot be confirmed.
func (h *SessionHandler) verifySessionOwnership(r *http.Request, session *model.Session) error {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		return fmt.Errorf("no user in context")
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return err
	}
	// Look up the profile that owns this session
	profile, err := h.profiles.GetByID(r.Context(), session.LearnerID)
	if err != nil || profile == nil {
		return fmt.Errorf("profile not found")
	}
	if profile.UserID != uid {
		return fmt.Errorf("session does not belong to authenticated user")
	}
	return nil
}
