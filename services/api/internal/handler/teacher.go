package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/event"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

type TeacherHandler struct {
	store        *store.TeacherStore
	institutions *store.InstitutionStore
	profiles     *store.ProfileStore   // resolves the CALLER's learner profile for the learner-facing endpoints
	streaks      *store.StreakStore    // XP awards on assignment completion; nil-safe
	notifier     *event.Notifier       // live push (SSE) for assignment created/completed; nil-safe
	activity     *store.ActivityStore  // records staff actions for the dean activity panel; nil-safe
}

func NewTeacherHandler(s *store.TeacherStore, institutions *store.InstitutionStore, profiles *store.ProfileStore, streaks *store.StreakStore, notifier *event.Notifier, activity *store.ActivityStore) *TeacherHandler {
	return &TeacherHandler{store: s, institutions: institutions, profiles: profiles, streaks: streaks, notifier: notifier, activity: activity}
}

// Assignment XP model: +10 per correct answer, −5 per miss (a timeout counts
// as a miss); finishing a practice-skills assignment pays a flat bonus because
// its exercises already earned session/Path XP on their own (no double
// counting). Lifetime totals never go below zero (store clamps).
const (
	xpPerCorrect    = 10
	xpPerMiss       = -5
	xpPracticeBonus = 20
)

func assignmentXP(correct, total int) int {
	return xpPerCorrect*correct + xpPerMiss*(total-correct)
}

// notifyCompletions pushes an "assignment_completed" event to each completed
// assignment's teacher. Shared by the three auto-complete/complete paths
// (session finish, curriculum sync, explicit POST). Best-effort by design.
func notifyCompletions(ctx context.Context, notifier *event.Notifier, ts *store.TeacherStore, learnerID uuid.UUID, assignmentIDs []uuid.UUID) {
	if notifier == nil {
		return
	}
	for _, aid := range assignmentIDs {
		info, err := ts.GetAssignmentNotifyInfo(ctx, aid, learnerID)
		if err != nil {
			continue
		}
		notifier.Publish(map[string]string{
			"type":         "assignment_completed",
			"assignmentId": aid.String(),
			"cohortId":     info.CohortID.String(),
			"title":        info.Title,
			"learnerName":  info.LearnerName,
		}, info.TeacherUserID)
	}
}

// callerLearnerID resolves the signed-in user's primary learner profile — the
// identity used by the learner-facing cohort/assignment endpoints. Staff (no
// profile) get (Nil, false).
func (h *TeacherHandler) callerLearnerID(r *http.Request) (uuid.UUID, bool) {
	uid, ok := h.teacherID(r)
	if !ok {
		return uuid.Nil, false
	}
	lid, err := h.profiles.PrimaryIDByUserID(r.Context(), uid)
	if err != nil {
		return uuid.Nil, false
	}
	return lid, true
}

// institutionOf returns the signed-in user's institution (nil if independent).
func (h *TeacherHandler) institutionOf(r *http.Request) *store.Institution {
	uid, ok := h.teacherID(r)
	if !ok {
		return nil
	}
	inst, _ := h.institutions.OfUser(r.Context(), uid)
	return inst
}

// deanCanViewCohort / deanCanViewLearner scope the dean's read-only bypass to the
// dean's OWN institution — a dean never sees another university's data.
func (h *TeacherHandler) deanCanViewCohort(r *http.Request, cohortID uuid.UUID) bool {
	if !isDean(r) {
		return false
	}
	inst := h.institutionOf(r)
	if inst == nil {
		return false
	}
	ok, _ := h.institutions.CohortInInstitution(r.Context(), inst.ID, cohortID)
	return ok
}

func (h *TeacherHandler) deanCanViewLearner(r *http.Request, learnerID uuid.UUID) bool {
	if !isDean(r) {
		return false
	}
	inst := h.institutionOf(r)
	if inst == nil {
		return false
	}
	ok, _ := h.institutions.LearnerInInstitution(r.Context(), inst.ID, learnerID)
	return ok
}

func (h *TeacherHandler) teacherID(r *http.Request) (uuid.UUID, bool) {
	id := middleware.GetUserID(r.Context())
	if id == "" {
		return uuid.Nil, false
	}
	uid, err := uuid.Parse(id)
	return uid, err == nil
}

// isDean reports whether the requester holds the dean role — deans get read-only
// oversight across every teacher's cohorts and students, bypassing ownership.
func isDean(r *http.Request) bool {
	return middleware.GetRole(r.Context()) == "dean"
}

// Overview is the teacher command-center rollup for the signed-in teacher.
func (h *TeacherHandler) Overview(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	c2, err := h.store.TeacherC2(r.Context(), tid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build overview"})
		return
	}
	writeJSON(w, http.StatusOK, c2)
}

// ---------------- Cohorts ----------------

type CreateCohortRequest struct {
	Name string `json:"name"`
}

func (h *TeacherHandler) CreateCohort(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req CreateCohortRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}
	// Tag the cohort with the teacher's institution (nil for an independent teacher).
	var instID *uuid.UUID
	if inst := h.institutionOf(r); inst != nil {
		instID = &inst.ID
	}
	cohort, err := h.store.CreateCohort(r.Context(), tid, req.Name, instID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create cohort"})
		return
	}
	h.activity.Record(r.Context(), tid, store.ActCohortCreated, req.Name)
	writeJSON(w, http.StatusCreated, cohort)
}

func (h *TeacherHandler) ListCohorts(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohorts, err := h.store.ListCohorts(r.Context(), tid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list cohorts"})
		return
	}
	writeJSON(w, http.StatusOK, cohorts)
}

// ---------------- Assignments ----------------

type CreateAssignmentRequest struct {
	CohortID     string   `json:"cohortId"`
	Title        string   `json:"title"`
	TargetSkills []string `json:"targetSkills"`
	MinExercises int      `json:"minExercises"`
	Deadline     string   `json:"deadline"`
	// LearnerIDs narrows the assignment to specific cohort members (a subgroup or
	// an individual). Empty/omitted = the whole cohort.
	LearnerIDs []string `json:"learnerIds,omitempty"`
	// ContentIDs attaches the teacher's own Студия materials (Phase B delivery).
	ContentIDs []string `json:"contentIds,omitempty"`
	// TimePerQuestionSec puts a countdown on every question. Teacher assignments
	// are ALWAYS timed — omitted/0 falls back to the 30s default (max 600).
	TimePerQuestionSec int `json:"timePerQuestionSec,omitempty"`
}

// Every teacher assignment is time-constrained; this is the per-question
// default when the teacher doesn't pick a value herself.
const defaultTimePerQuestionSec = 30

func (h *TeacherHandler) CreateAssignment(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req CreateAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
		return
	}
	cohortID, err := uuid.Parse(req.CohortID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid cohortId is required"})
		return
	}
	// Ownership check: the teacher must own the cohort.
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}

	var deadline *time.Time
	if req.Deadline != "" {
		if t, err := time.Parse(time.RFC3339, req.Deadline); err == nil {
			deadline = &t
		} else if t, err := time.Parse("2006-01-02", req.Deadline); err == nil {
			deadline = &t
		}
	}
	skills := req.TargetSkills
	if skills == nil {
		skills = []string{}
	}
	minEx := req.MinExercises
	if minEx <= 0 {
		minEx = 10
	}

	// Per-student targeting: every target must be a member of THIS cohort, or the
	// assignment would leak outside the class via the learner-facing list.
	targets := make([]uuid.UUID, 0, len(req.LearnerIDs))
	for _, s := range req.LearnerIDs {
		lid, perr := uuid.Parse(s)
		if perr != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid learner id in learnerIds"})
			return
		}
		targets = append(targets, lid)
	}
	if len(targets) > 0 {
		allIn, err := h.store.AllMembersOfCohort(r.Context(), cohortID, targets)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		if !allIn {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "all targeted students must be members of the cohort"})
			return
		}
	}

	// Attached Студия materials must be the CALLER's own items — attaching someone
	// else's content id would exfiltrate it to this teacher's students.
	contentIDs := make([]uuid.UUID, 0, len(req.ContentIDs))
	for _, s := range req.ContentIDs {
		cid, perr := uuid.Parse(s)
		if perr != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid content id in contentIds"})
			return
		}
		contentIDs = append(contentIDs, cid)
	}
	if len(contentIDs) > 0 {
		ok, err := h.store.AllContentAttachable(r.Context(), tid, contentIDs)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
			return
		}
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "materials must be your own or from the approved global pool"})
			return
		}
	}

	timePerQ := req.TimePerQuestionSec
	if timePerQ <= 0 {
		timePerQ = defaultTimePerQuestionSec
	} else if timePerQ > 600 {
		timePerQ = 600
	}

	a, err := h.store.CreateAssignment(r.Context(), tid, cohortID, req.Title, skills, minEx, deadline, targets, contentIDs, timePerQ)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create assignment"})
		return
	}
	// Push "you have a new assignment" to every recipient's open session so it
	// appears (with a toast) without waiting for their fallback poll.
	if h.notifier != nil {
		if userIDs, nerr := h.store.RecipientUserIDs(r.Context(), cohortID, targets); nerr == nil && len(userIDs) > 0 {
			h.notifier.Publish(map[string]string{
				"type":         "assignment_created",
				"assignmentId": a.ID.String(),
				"title":        a.Title,
			}, userIDs...)
		}
	}
	h.activity.Record(r.Context(), tid, store.ActAssignmentCreated, a.Title)
	writeJSON(w, http.StatusCreated, a)
}

func (h *TeacherHandler) ListAssignments(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	items, err := h.store.ListAssignments(r.Context(), tid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list assignments"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// ---------------- Leaderboard (real, from learner_streaks) ----------------

func (h *TeacherHandler) GetLeaderboard(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = "global"
	}
	rows, err := h.store.Leaderboard(r.Context(), 20)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load leaderboard"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"scope":       scope,
		"period":      "all-time",
		"resetsIn":    "",
		"leaderboard": rows,
	})
}

// SearchLearners lets a teacher find learners to enrol (by display-name query).
func (h *TeacherHandler) SearchLearners(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.teacherID(r); !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	q := r.URL.Query().Get("q")
	// Two teacher modes: an INSTITUTION teacher may only search their institution's
	// enrolled-student pool; an INDEPENDENT teacher can search all learners.
	var results []store.LearnerBrief
	var err error
	if inst := h.institutionOf(r); inst != nil {
		results, err = h.institutions.ListStudents(r.Context(), inst.ID, q, 20)
	} else {
		results, err = h.store.SearchLearners(r.Context(), q, 20)
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "search failed"})
		return
	}
	writeJSON(w, http.StatusOK, results)
}

// ---------------- Cohort joining (consent-based) ----------------
//
// A teacher can no longer force-add a learner. Enrolment happens only with the
// STUDENT's consent: they accept an invitation, or they redeem a join code the
// teacher shared with them. Tenant checks run at BOTH invite-create time
// (teacher side) and accept/redeem time (learner side) so an affiliation change
// in between can't smuggle a student across the boundary.

type addMemberRequest struct {
	LearnerID string `json:"learnerId"`
}

// learnerTenantError applies the tenant boundary between a learner and a cohort's
// institution. Returns "" when the pairing is allowed, else the error message.
func (h *TeacherHandler) learnerTenantError(r *http.Request, learnerID uuid.UUID, cohortInst *uuid.UUID) (string, error) {
	if cohortInst != nil {
		inPool, err := h.institutions.LearnerInInstitution(r.Context(), *cohortInst, learnerID)
		if err != nil {
			return "", err
		}
		if !inPool {
			return "that student isn't enrolled in this cohort's institution", nil
		}
		return "", nil
	}
	free, err := h.institutions.LearnerIsUnaffiliated(r.Context(), learnerID)
	if err != nil {
		return "", err
	}
	if !free {
		return "that student belongs to an institution", nil
	}
	return "", nil
}

// InviteCohortMember (teacher) proposes membership; nothing is enrolled until
// the student accepts. Replaces the old direct-add endpoint.
func (h *TeacherHandler) InviteCohortMember(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil || !owns {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	var req addMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	learnerID, perr := uuid.Parse(req.LearnerID)
	if perr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid learnerId required"})
		return
	}
	instID, err := h.store.InstitutionOfCohort(r.Context(), cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if msg, err := h.learnerTenantError(r, learnerID, instID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	} else if msg != "" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": msg})
		return
	}
	if err := h.store.CreateCohortInvite(r.Context(), cohortID, learnerID, tid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create invite"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// ListCohortInvitesHandler (teacher) lists a cohort's pending invites.
func (h *TeacherHandler) ListCohortInvitesHandler(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil || (!owns && !h.deanCanViewCohort(r, cohortID)) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	items, err := h.store.ListCohortInvites(r.Context(), cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list invites"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// RotateCohortCode (teacher) generates or replaces the cohort's join code.
func (h *TeacherHandler) RotateCohortCode(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil || !owns {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	code, err := h.store.RotateCohortJoinCode(r.Context(), cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate code"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"joinCode": code})
}

// RemoveCohortMember (teacher) removes a student from the teacher's OWN cohort.
// The learner id comes from the URL; ownership is checked before anything changes.
func (h *TeacherHandler) RemoveCohortMember(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	learnerID, err := uuid.Parse(chi.URLParam(r, "learnerId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid learner id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil || !owns {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	if err := h.store.RemoveCohortMember(r.Context(), cohortID, learnerID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to remove member"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"removed": true})
}

// ---------------- Learner-facing joining ----------------

// MyCohortInvites lists the caller's pending invitations.
func (h *TeacherHandler) MyCohortInvites(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearnerID(r)
	if !ok {
		writeJSON(w, http.StatusOK, []store.CohortInvite{}) // staff / no profile → nothing pending
		return
	}
	items, err := h.store.ListLearnerInvites(r.Context(), lid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list invites"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

type respondInviteRequest struct {
	Accept bool `json:"accept"`
}

// RespondCohortInvite lets the invited student accept (enrols them) or decline.
// Ownership is enforced by loading the invite scoped to the CALLER's learner id.
func (h *TeacherHandler) RespondCohortInvite(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearnerID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	inviteID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid invite id"})
		return
	}
	var req respondInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	iv, err := h.store.InviteForLearner(r.Context(), inviteID, lid)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invite not found"})
		return
	}
	if !req.Accept {
		if err := h.store.DeclineInvite(r.Context(), iv.ID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to decline"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "declined"})
		return
	}
	// Re-check the tenant boundary at ACCEPT time (affiliation may have changed
	// since the invite was sent).
	instID, err := h.store.InstitutionOfCohort(r.Context(), iv.CohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if msg, err := h.learnerTenantError(r, lid, instID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	} else if msg != "" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": msg})
		return
	}
	if err := h.store.AcceptInviteTx(r.Context(), iv.ID, iv.CohortID, lid); err != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "invite is no longer pending"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"status": "accepted", "cohortName": iv.CohortName})
}

type joinCohortRequest struct {
	Code string `json:"code"`
}

// JoinCohortByCode enrols the CALLER into the cohort behind the code. Entering
// the code is the student's consent; the tenant boundary still applies.
func (h *TeacherHandler) JoinCohortByCode(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearnerID(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only learners can join a cohort"})
		return
	}
	var req joinCohortRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}
	cohortID, instID, cohortName, err := h.store.CohortByJoinCode(r.Context(), req.Code)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invalid_code"})
		return
	}
	if msg, err := h.learnerTenantError(r, lid, instID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	} else if msg != "" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": msg})
		return
	}
	if err := h.store.AddCohortMember(r.Context(), cohortID, lid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to join"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "joined", "cohortName": cohortName})
}

// completionStep is one answered (or timed-out) question inside one material.
// Prompt/Given/Expected carry WHAT was asked and answered, so the teacher can
// review the actual questions — not just right/wrong counts.
type completionStep struct {
	I        int    `json:"i"`
	Type     string `json:"type"`
	Result   string `json:"result"` // correct | incorrect | timeout | viewed | "c/t" (matching)
	Prompt   string `json:"prompt,omitempty"`
	Given    string `json:"given,omitempty"`
	Expected string `json:"expected,omitempty"`
}

// truncateRunes caps a client string without rejecting the whole payload —
// a long free-response answer shouldn't void the attempt record.
func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

// completionItem is the recorded outcome of one attached material.
type completionItem struct {
	ContentID string           `json:"contentId"`
	Title     string           `json:"title"`
	Steps     []completionStep `json:"steps"`
}

// validCompletionResults caps and sanitizes the client-reported results so a
// hostile client can't stuff megabytes of junk into the completions table.
func validCompletionResults(items []completionItem) ([]completionItem, bool) {
	if len(items) > 50 {
		return nil, false
	}
	totalSteps := 0
	for i := range items {
		if len(items[i].ContentID) > 64 || len([]rune(items[i].Title)) > 200 || len(items[i].Steps) > 60 {
			return nil, false
		}
		totalSteps += len(items[i].Steps)
		if totalSteps > 500 {
			return nil, false
		}
		for j := range items[i].Steps {
			if len(items[i].Steps[j].Type) > 32 || len(items[i].Steps[j].Result) > 16 {
				return nil, false
			}
			items[i].Steps[j].Prompt = truncateRunes(items[i].Steps[j].Prompt, 300)
			items[i].Steps[j].Given = truncateRunes(items[i].Steps[j].Given, 300)
			items[i].Steps[j].Expected = truncateRunes(items[i].Steps[j].Expected, 300)
		}
	}
	return items, true
}

// scoreResults recomputes the score SERVER-side from the step labels — the
// client's own tally is never trusted. "viewed" (dialogue) doesn't count;
// matching partials "c/t" count as correct only when complete.
func scoreResults(items []completionItem) (correct, total int) {
	for _, it := range items {
		for _, s := range it.Steps {
			switch s.Result {
			case "viewed", "done", "":
				continue
			case "correct":
				correct++
				total++
			default:
				if c, t, ok := parseFraction(s.Result); ok {
					if c == t && t > 0 {
						correct++
					}
					total++
					continue
				}
				total++ // incorrect, timeout, anything else
			}
		}
	}
	return correct, total
}

func parseFraction(s string) (int, int, bool) {
	parts := strings.SplitN(s, "/", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	c, err1 := strconv.Atoi(parts[0])
	t, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || c < 0 || t <= 0 || c > t {
		return 0, 0, false
	}
	return c, t, true
}

// CompleteMyAssignment — POST /me/assignments/{id}/complete: the learner
// finished the materials; the store enforces visibility so only a legitimate
// recipient can mark it done. SINGLE ATTEMPT: only the first completion's
// results/score are stored; later calls are no-ops (completed stays true).
func (h *TeacherHandler) CompleteMyAssignment(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearnerID(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "learner profile required"})
		return
	}
	aid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid assignment id"})
		return
	}
	// Body is optional (older clients sent none): {"results": [...]}.
	var req struct {
		Results []completionItem `json:"results"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(io.LimitReader(r.Body, 256*1024)).Decode(&req)
	}
	items, ok := validCompletionResults(req.Results)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "results payload too large"})
		return
	}
	correct, total := scoreResults(items)
	resultsJSON, err := json.Marshal(items)
	if err != nil {
		resultsJSON = []byte("[]")
	}
	done, newly, err := h.store.CompleteAssignment(r.Context(), lid, aid, resultsJSON, correct, total)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to record completion"})
		return
	}
	if !done {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "assignment not found"})
		return
	}
	// One-shot side effects only for the attempt that actually recorded:
	// XP (+10 correct / −5 miss) and the teacher's live notification.
	xpAwarded := 0
	if newly {
		if total > 0 && h.streaks != nil {
			xpAwarded = assignmentXP(correct, total)
			_ = h.streaks.AddXP(r.Context(), lid, xpAwarded)
		}
		notifyCompletions(r.Context(), h.notifier, h.store, lid, []uuid.UUID{aid})
	}
	writeJSON(w, http.StatusOK, map[string]any{"completed": true, "xpAwarded": xpAwarded})
}

// StudentAssignmentAnswers — GET /teacher/cohorts/{id}/students/{learnerID}/assignments/{assignmentID}/answers:
// the full-page review behind «Ответы ↗» — every question with the student's
// answer and the verdict (materials tasks from the recorded attempt, practice
// tasks from the adaptive answers in the assignment's window).
func (h *TeacherHandler) StudentAssignmentAnswers(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	learnerID, err := uuid.Parse(chi.URLParam(r, "learnerID"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid learner id"})
		return
	}
	assignmentID, err := uuid.Parse(chi.URLParam(r, "assignmentID"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid assignment id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns && !h.deanCanViewCohort(r, cohortID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	sheet, err := h.store.AssignmentAnswers(r.Context(), cohortID, learnerID, assignmentID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load answers"})
		return
	}
	if sheet == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "assignment or student not found in this cohort"})
		return
	}
	writeJSON(w, http.StatusOK, sheet)
}

// GetCohortReport — GET /teacher/cohorts/{id}/report?from=YYYY-MM-DD&to=YYYY-MM-DD:
// the end-of-period (day/week/month) table — per student: assignments done,
// scores, practice volume, XP — plus any teacher commentary for that period.
// Deans see the same report for their institution's cohorts.
func (h *TeacherHandler) GetCohortReport(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns && !h.deanCanViewCohort(r, cohortID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	from, toExcl, ok := parsePeriod(r)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid period: from/to must be YYYY-MM-DD and span at most 366 days"})
		return
	}
	// toExcl is the EXCLUSIVE range end (midnight after the requested day) for
	// timestamp comparisons; comments are keyed and echoed by the INCLUSIVE
	// user-facing date — mixing the two silently loses every comment.
	toIncl := toExcl.AddDate(0, 0, -1)
	rows, err := h.store.CohortReport(r.Context(), cohortID, from, toExcl)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build report"})
		return
	}
	comments, err := h.store.ReportComments(r.Context(), cohortID, from, toIncl)
	if err == nil {
		byLearner := map[uuid.UUID][]store.ReportComment{}
		for _, c := range comments {
			byLearner[c.LearnerID] = append(byLearner[c.LearnerID], c)
		}
		for i := range rows {
			if list, has := byLearner[rows[i].LearnerID]; has {
				rows[i].Comments = list
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"from": from.Format("2006-01-02"),
		"to":   toIncl.Format("2006-01-02"),
		"rows": rows,
	})
}

// parsePeriod reads ?from&to (dates, [from, to+1d) window). Defaults to the
// last 7 days; rejects reversed or absurdly long ranges.
func parsePeriod(r *http.Request) (time.Time, time.Time, bool) {
	now := time.Now()
	from := now.AddDate(0, 0, -7)
	to := now
	if s := r.URL.Query().Get("from"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
		from = t
	}
	if s := r.URL.Query().Get("to"); s != "" {
		t, err := time.Parse("2006-01-02", s)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
		to = t
	}
	from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.Local)
	// End is EXCLUSIVE at midnight after "to", so "to=today" includes today.
	to = time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.Local).AddDate(0, 0, 1)
	if !to.After(from) || to.Sub(from) > 367*24*time.Hour {
		return time.Time{}, time.Time{}, false
	}
	return from, to, true
}

// PostReportComment — POST /teacher/cohorts/{id}/report/comment: attach a
// teacher note to one student's report for the given period.
func (h *TeacherHandler) PostReportComment(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns && !h.deanCanViewCohort(r, cohortID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	var req struct {
		LearnerID string `json:"learnerId"`
		From      string `json:"from"`
		To        string `json:"to"`
		Comment   string `json:"comment"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	learnerID, err := uuid.Parse(req.LearnerID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid learner id"})
		return
	}
	comment := strings.TrimSpace(req.Comment)
	if comment == "" || len([]rune(comment)) > 2000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "comment must be 1..2000 characters"})
		return
	}
	fromD, err1 := time.Parse("2006-01-02", req.From)
	toD, err2 := time.Parse("2006-01-02", req.To)
	if err1 != nil || err2 != nil || toD.Before(fromD) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid period"})
		return
	}
	added, err := h.store.AddReportComment(r.Context(), cohortID, learnerID, tid, fromD, toD, comment)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save comment"})
		return
	}
	if !added {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "student is not in this cohort"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// StudentAssignmentsDetail — GET /teacher/cohorts/{id}/students/{learnerID}/assignments:
// the drill-down behind a desk click. Which assignments this student was given,
// which are done (when, with what score), and the per-question results of the
// single recorded attempt.
func (h *TeacherHandler) StudentAssignmentsDetail(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	learnerID, err := uuid.Parse(chi.URLParam(r, "learnerID"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid learner id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns && !h.deanCanViewCohort(r, cohortID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	items, err := h.store.StudentAssignments(r.Context(), cohortID, learnerID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load assignments"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// MyAssignments lists the assignments visible to the calling learner (whole-cohort
// ones plus those targeted at them).
func (h *TeacherHandler) MyAssignments(w http.ResponseWriter, r *http.Request) {
	lid, ok := h.callerLearnerID(r)
	if !ok {
		writeJSON(w, http.StatusOK, []store.LearnerAssignment{})
		return
	}
	// Self-heal practice assignments: if this learner already did enough
	// adaptive exercises (possibly before auto-completion existed), mark them
	// done now so the list below reflects it.
	if ids, aerr := h.store.AutoCompletePracticeAssignments(r.Context(), lid); aerr == nil && len(ids) > 0 {
		if h.streaks != nil {
			_ = h.streaks.AddXP(r.Context(), lid, xpPracticeBonus*len(ids))
		}
		notifyCompletions(r.Context(), h.notifier, h.store, lid, ids)
	}
	items, err := h.store.ListAssignmentsForLearner(r.Context(), lid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list assignments"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// GetCohortRoster backs the classroom view: per-student desk stats.
func (h *TeacherHandler) GetCohortRoster(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns && !h.deanCanViewCohort(r, cohortID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	roster, err := h.store.CohortRoster(r.Context(), cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load roster"})
		return
	}
	writeJSON(w, http.StatusOK, roster)
}

func (h *TeacherHandler) GetCohortHeatmap(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	owns, err := h.store.OwnsCohort(r.Context(), tid, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !owns && !h.deanCanViewCohort(r, cohortID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "not your cohort"})
		return
	}
	hm, err := h.store.CohortHeatmap(r.Context(), cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build heatmap"})
		return
	}
	writeJSON(w, http.StatusOK, hm)
}

func (h *TeacherHandler) GetStudentReport(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	learnerID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid student id"})
		return
	}
	canView, err := h.store.TeacherCanViewLearner(r.Context(), tid, learnerID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !canView && !h.deanCanViewLearner(r, learnerID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "student is not in any of your cohorts"})
		return
	}
	rep, err := h.store.StudentReport(r.Context(), learnerID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build report"})
		return
	}
	if rep == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "student not found"})
		return
	}
	writeJSON(w, http.StatusOK, rep)
}
