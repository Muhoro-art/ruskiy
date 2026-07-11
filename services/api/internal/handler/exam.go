package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/exam"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

// ExamHandler backs dean-assigned exams: a dean schedules a CEFR-level exam for a
// cohort; the cohort's learners take it (client curriculum content) and post their
// result; the dean sees per-exam results and per-teacher exam performance.
type ExamHandler struct {
	exams    *store.ExamStore
	inst     *store.InstitutionStore
	profiles *store.ProfileStore
	activity *store.ActivityStore // records the exam assignment for the activity panel; nil-safe
}

func NewExamHandler(exams *store.ExamStore, inst *store.InstitutionStore, profiles *store.ProfileStore, activity *store.ActivityStore) *ExamHandler {
	return &ExamHandler{exams: exams, inst: inst, profiles: profiles, activity: activity}
}

var validExamLevels = map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true, "C2": true}

func (h *ExamHandler) uid(r *http.Request) (uuid.UUID, bool) {
	id := middleware.GetUserID(r.Context())
	u, err := uuid.Parse(id)
	return u, err == nil
}

// deanInst resolves the signed-in dean's institution.
func (h *ExamHandler) deanInst(r *http.Request) (*store.Institution, uuid.UUID, bool) {
	uid, ok := h.uid(r)
	if !ok {
		return nil, uuid.Nil, false
	}
	inst, err := h.inst.OfUser(r.Context(), uid)
	if err != nil || inst == nil {
		return nil, uid, false
	}
	return inst, uid, true
}

// callerLearner resolves the signed-in user's primary learner profile id.
func (h *ExamHandler) callerLearner(r *http.Request) (uuid.UUID, bool) {
	uid, ok := h.uid(r)
	if !ok {
		return uuid.Nil, false
	}
	lid, err := h.profiles.PrimaryIDByUserID(r.Context(), uid)
	if err != nil {
		return uuid.Nil, false
	}
	return lid, true
}

// parseDue accepts an RFC3339 timestamp or a bare YYYY-MM-DD date (or "" for none).
func parseDue(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return &t
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t
	}
	return nil
}

// ---------------- Dean (institution-scoped) ----------------

// Create schedules an exam for one of the dean's institution cohorts.
func (h *ExamHandler) Create(w http.ResponseWriter, r *http.Request) {
	inst, deanID, ok := h.deanInst(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	var req struct {
		CohortID      string  `json:"cohortId"`
		Level         string  `json:"level"`
		Title         string  `json:"title"`
		DueAt         string  `json:"dueAt"`
		PassThreshold float64 `json:"passThreshold"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	req.Level = strings.ToUpper(strings.TrimSpace(req.Level))
	if !validExamLevels[req.Level] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "level must be one of A1..C2"})
		return
	}
	if t := strings.TrimSpace(req.Title); t == "" || len(t) > 200 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required (max 200 chars)"})
		return
	}
	cohortID, err := uuid.Parse(req.CohortID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid cohortId is required"})
		return
	}
	inCohort, err := h.inst.CohortInInstitution(r.Context(), inst.ID, cohortID)
	if err != nil || !inCohort {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that cohort isn't in your institution"})
		return
	}
	pass := req.PassThreshold
	if pass <= 0 || pass > 1 {
		pass = 0.66
	}
	e, err := h.exams.Create(r.Context(), cohortID, req.Level, strings.TrimSpace(req.Title), pass, parseDue(req.DueAt), deanID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to assign exam"})
		return
	}
	h.activity.Record(r.Context(), deanID, store.ActExamAssigned, req.Level+" · "+strings.TrimSpace(req.Title))
	writeJSON(w, http.StatusCreated, e)
}

// List returns every assigned exam in the dean's institution (with stats).
func (h *ExamHandler) List(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInst(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	list, err := h.exams.ListForInstitution(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load exams"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// examInInstitution verifies an exam's cohort belongs to the dean's institution.
func (h *ExamHandler) examInInstitution(r *http.Request, instID, examID uuid.UUID) bool {
	ei, err := h.exams.ExamCohortInstitution(r.Context(), examID)
	return err == nil && ei != nil && *ei == instID
}

// Delete removes an assigned exam in the dean's institution.
func (h *ExamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInst(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	examID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid exam id"})
		return
	}
	if !h.examInInstitution(r, inst.ID, examID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that exam isn't in your institution"})
		return
	}
	if err := h.exams.Delete(r.Context(), examID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete exam"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// Results returns every cohort member's outcome for one exam.
func (h *ExamHandler) Results(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInst(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	examID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid exam id"})
		return
	}
	if !h.examInInstitution(r, inst.ID, examID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that exam isn't in your institution"})
		return
	}
	rows, err := h.exams.Results(r.Context(), examID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load results"})
		return
	}
	writeJSON(w, http.StatusOK, rows)
}

// TeacherPerf returns per-teacher exam performance for the institution.
func (h *ExamHandler) TeacherPerf(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInst(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	list, err := h.exams.TeacherExamPerf(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load performance"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// ---------------- Learner ----------------

// Mine returns the exams assigned to the signed-in learner's cohorts.
func (h *ExamHandler) Mine(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearner(r)
	if !ok {
		writeJSON(w, http.StatusOK, []store.LearnerExam{}) // staff / no profile → nothing to take
		return
	}
	list, err := h.exams.ListForLearner(r.Context(), lid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load exams"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// Get returns one assigned exam the learner is allowed to take (for the exam runner).
func (h *ExamHandler) Get(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearner(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "no learner profile"})
		return
	}
	examID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid exam id"})
		return
	}
	e, err := h.exams.GetForLearner(r.Context(), lid, examID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "exam not found or not assigned to you"})
		return
	}
	writeJSON(w, http.StatusOK, e)
}

// Submit records the learner's result (single attempt, membership-checked in the store).
func (h *ExamHandler) Submit(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearner(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "no learner profile"})
		return
	}
	examID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid exam id"})
		return
	}
	// The learner submits their per-question ANSWERS; the server re-grades them against
	// its own embedded answer key and derives correct/total itself — the client's own
	// tally is never trusted (see internal/exam). pass/fail is then derived from the
	// assigned exam's pass_threshold in the store.
	var req struct {
		Answers []exam.SubmittedAnswer `json:"answers"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Answers) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "answers are required"})
		return
	}
	if len(req.Answers) > 200 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "too many answers"})
		return
	}
	// Resolve the exam's LEVEL server-side (never trust a client-supplied level) so we
	// grade against the right answer key.
	e, err := h.exams.GetForLearner(r.Context(), lid, examID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "exam not found or not assigned to you"})
		return
	}
	correct, total, gok := exam.Grade("exam-"+e.Level, req.Answers)
	if !gok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "could not grade submission"})
		return
	}
	stored, err := h.exams.RecordResult(r.Context(), examID, lid, correct, total)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to record result"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"recorded": stored, "correct": correct, "total": total})
}
