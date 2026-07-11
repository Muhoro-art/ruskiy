package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/event"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

type CurriculumHandler struct {
	store    *store.CurriculumStore
	profiles *store.ProfileStore
	streaks  *store.StreakStore
	teacher  *store.TeacherStore // auto-completes practice assignments fed by Path work (nil-safe)
	notifier *event.Notifier     // pushes completion events to the teacher (nil-safe)
}

func NewCurriculumHandler(s *store.CurriculumStore, profiles *store.ProfileStore, streaks *store.StreakStore, teacher *store.TeacherStore, notifier *event.Notifier) *CurriculumHandler {
	return &CurriculumHandler{store: s, profiles: profiles, streaks: streaks, teacher: teacher, notifier: notifier}
}

// validCEFR is the set of accepted current-level values. Anything else in the
// sync payload is ignored rather than written to the enum column.
var validCEFR = map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true, "C2": true}

func (h *CurriculumHandler) userID(r *http.Request) (uuid.UUID, bool) {
	id := middleware.GetUserID(r.Context())
	if id == "" {
		return uuid.Nil, false
	}
	uid, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil, false
	}
	return uid, true
}

// PostAnswers — POST /v1/curriculum/answers: the Path lesson runner reports
// each answered question (prompt + the learner's answer + verdict) so teachers
// can review Path work question-by-question, same as adaptive practice.
// Fire-and-forget on the client; capped and truncated here.
func (h *CurriculumHandler) PostAnswers(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req struct {
		Answers []store.PathAnswerIn `json:"answers"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 256*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if len(req.Answers) == 0 {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	if len(req.Answers) > 100 {
		req.Answers = req.Answers[:100]
	}
	for i := range req.Answers {
		if len(req.Answers[i].QuestionID) > 120 || len(req.Answers[i].LessonID) > 120 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid question id"})
			return
		}
		req.Answers[i].Prompt = truncateRunes(req.Answers[i].Prompt, 300)
		req.Answers[i].Response = truncateRunes(req.Answers[i].Response, 300)
		req.Answers[i].CorrectAnswer = truncateRunes(req.Answers[i].CorrectAnswer, 300)
	}
	lid, err := h.profiles.PrimaryIDByUserID(r.Context(), uid)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "learner profile required"})
		return
	}
	if h.teacher != nil {
		if err := h.teacher.RecordPathAnswers(r.Context(), lid, req.Answers); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to record answers"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GetProgress returns the authenticated user's curriculum progress blob.
func (h *CurriculumHandler) GetProgress(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	data, err := h.store.Get(r.Context(), uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load progress"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// PutProgress overwrites the authenticated user's curriculum progress blob.
func (h *CurriculumHandler) PutProgress(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.userID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB cap
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if !json.Valid(body) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body must be valid JSON"})
		return
	}
	changed, err := h.store.Upsert(r.Context(), uid, json.RawMessage(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save progress"})
		return
	}
	// Unchanged blob = a no-op page-mount re-push. Skip the projections below so
	// merely OPENING the Path page can never stamp activity, advance a streak, or
	// count as "Active (7d)" on the teacher dashboard — honest stats require that
	// activity means the learner actually did something.
	if !changed {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	// Project the client-derived current level onto the profile so the server-side
	// level (stats / leaderboard / teacher reports) reflects real curriculum
	// progress. Best-effort: the blob above is the source of truth, this is a cached
	// projection — a failure here must not fail the sync (the next push retries it).
	// AdvanceLevelByUserID is monotonic, so an out-of-order/stale push can't lower it.
	if h.profiles != nil {
		var meta struct {
			CurrentLevel string `json:"currentLevel"`
		}
		if json.Unmarshal(body, &meta) == nil && validCEFR[meta.CurrentLevel] {
			if err := h.profiles.AdvanceLevelByUserID(r.Context(), uid, meta.CurrentLevel); err != nil {
				log.Printf("curriculum sync: failed to update current_level for user %s: %v", uid, err)
			}
		}
	}

	// Bridge Path progress into the teacher-visible streak row so a student's Path
	// work shows up on the teacher dashboard instead of reading as 0%/never-active.
	// EARNED mastery only: items (lessons+exams) with attempts>0 count; placement
	// ("tested out", attempts=0) shows as the student's LEVEL, never as mastery.
	// Best-effort — a failure here must never fail the sync.
	if h.streaks != nil && h.profiles != nil {
		type item struct {
			BestScore       float64  `json:"bestScore"`
			Attempts        float64  `json:"attempts"`
			SeenQuestionIDs []string `json:"seenQuestionIds"`
		}
		var prog struct {
			Lessons     map[string]item `json:"lessons"`
			Exams       map[string]item `json:"exams"`
			PlacedLevel string          `json:"placedLevel"`
		}
		if json.Unmarshal(body, &prog) == nil {
			engaged := 0
			seenTotal := 0
			var scoreSum float64
			for _, m := range []map[string]item{prog.Lessons, prog.Exams} {
				for _, it := range m {
					seenTotal += len(it.SeenQuestionIDs)
					if it.Attempts > 0 {
						engaged++
						s := it.BestScore
						if s < 0 {
							s = 0
						} else if s > 1 {
							s = 1
						}
						scoreSum += s
					}
				}
			}
			// Any real curriculum signal (worked items, placement, or tested-out
			// entries) counts as being active; a completely empty blob does not.
			hasSignal := engaged > 0 || prog.PlacedLevel != "" || len(prog.Lessons) > 0 || len(prog.Exams) > 0
			if hasSignal {
				mastery := 0.0
				if engaged > 0 {
					mastery = scoreSum / float64(engaged)
				}
				if lid, perr := h.profiles.PrimaryIDByUserID(r.Context(), uid); perr == nil {
					if err := h.streaks.RecordCurriculumProgress(r.Context(), lid, mastery, engaged); err != nil {
						log.Printf("curriculum sync: failed to bridge streak for user %s: %v", uid, err)
					}
					// Path questions count toward practice-skills assignments: log the
					// growth in answered questions, then complete anything that crossed
					// its min_exercises bar. Best-effort, same as the bridge above.
					if err := h.streaks.RecordCurriculumSeen(r.Context(), lid, seenTotal); err != nil {
						log.Printf("curriculum sync: failed to log practice questions for user %s: %v", uid, err)
					}
					if h.teacher != nil {
						if ids, aerr := h.teacher.AutoCompletePracticeAssignments(r.Context(), lid); aerr == nil && len(ids) > 0 {
							_ = h.streaks.AddXP(r.Context(), lid, xpPracticeBonus*len(ids))
							notifyCompletions(r.Context(), h.notifier, h.teacher, lid, ids)
						}
					}
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
