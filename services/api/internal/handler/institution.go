package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

// InstitutionHandler backs multi-tenant provisioning: institution creation
// (platform super-admin), teacher/dean invites + accept (dean), student join code
// (learner), and the enrolled-student roster + dean cohort assignment.
type InstitutionHandler struct {
	inst     *store.InstitutionStore
	users    *store.UserStore
	teachers *store.TeacherStore
	activity *store.ActivityStore // records dean actions for the activity panel; nil-safe
	adminKey string
}

func NewInstitutionHandler(inst *store.InstitutionStore, users *store.UserStore, teachers *store.TeacherStore, activity *store.ActivityStore, adminKey string) *InstitutionHandler {
	return &InstitutionHandler{inst: inst, users: users, teachers: teachers, activity: activity, adminKey: adminKey}
}

func (h *InstitutionHandler) uid(r *http.Request) (uuid.UUID, bool) {
	id := middleware.GetUserID(r.Context())
	if id == "" {
		return uuid.Nil, false
	}
	u, err := uuid.Parse(id)
	return u, err == nil
}

func (h *InstitutionHandler) authorizedAdmin(r *http.Request) bool {
	return adminKeyEqual(h.adminKey, r.Header.Get("X-Admin-Key")) // constant-time
}

// deanInstitution returns the signed-in dean's institution, or nil.
func (h *InstitutionHandler) deanInstitution(r *http.Request) (*store.Institution, uuid.UUID, bool) {
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

var validInviteRoles = map[string]bool{"teacher": true, "dean": true}

// ---------------- Platform super-admin (X-Admin-Key) ----------------

// CreateInstitution provisions a new tenant. Platform-gated (this is the B2B step).
// maxNameLen bounds staff-supplied names/titles (institution, cohort, exam) so an
// over-length value returns a clean 400 and can't be used to write oversized DB rows
// (storage-growth abuse) — the global 1MB body cap is far too coarse for a single field.
const maxNameLen = 200

func (h *InstitutionHandler) CreateInstitution(w http.ResponseWriter, r *http.Request) {
	if !h.authorizedAdmin(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin key required"})
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || len(req.Name) > maxNameLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required (max 200 chars)"})
		return
	}
	inst, err := h.inst.Create(r.Context(), req.Name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create institution"})
		return
	}
	writeJSON(w, http.StatusCreated, inst)
}

// AppointMember attaches a user (by email) to an institution with a role — used to
// appoint an institution's first dean. Platform-gated.
func (h *InstitutionHandler) AppointMember(w http.ResponseWriter, r *http.Request) {
	if !h.authorizedAdmin(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin key required"})
		return
	}
	instID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid institution id"})
		return
	}
	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || !validInviteRoles[req.Role] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email and role (teacher|dean) are required"})
		return
	}
	n, err := h.inst.SetMemberByEmail(r.Context(), instID, req.Email, req.Role)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to appoint member"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no user with that email (they must register first)"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------------- Any authenticated user ----------------

// Me returns the caller's institution context (nil if independent) + their role,
// so the UI can render tenant-aware chrome.
func (h *InstitutionHandler) Me(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.uid(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	inst, err := h.inst.OfUser(r.Context(), uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load institution"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"institution": inst, // null if independent
		"role":        middleware.GetRole(r.Context()),
	})
}

// Join enrols the signed-in learner into an institution via its join code.
func (h *InstitutionHandler) Join(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.uid(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}
	inst, err := h.inst.JoinByCode(r.Context(), uid, req.Code)
	if errors.Is(err, store.ErrCodeInvalid) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "that join code isn't valid"})
		return
	}
	if errors.Is(err, store.ErrJoinNotAllowed) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "join codes are for students who aren't already in an institution"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to join"})
		return
	}
	writeJSON(w, http.StatusOK, inst)
}

// AcceptInvite binds the signed-in user (must match the invite email) to the
// invite's institution + role (teacher/dean).
func (h *InstitutionHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	uid, ok := h.uid(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}
	user, err := h.users.GetByID(r.Context(), uid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load account"})
		return
	}
	inst, role, err := h.inst.AcceptInvite(r.Context(), uid, user.Email, req.Token)
	if errors.Is(err, store.ErrInviteInvalid) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "this invite is invalid or expired"})
		return
	}
	if errors.Is(err, store.ErrInviteEmailMismatch) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "this invite was sent to a different email"})
		return
	}
	if errors.Is(err, store.ErrAlreadyInInstitution) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "you already belong to another institution — leave it before accepting a new invite"})
		return
	}
	if errors.Is(err, store.ErrLastDean) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "you are the institution's only dean — appoint another dean before stepping down to teacher"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to accept invite"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"institution": inst, "role": role})
}

// ---------------- Dean-only (institution-scoped) ----------------

// Invite issues a teacher/dean invite for the dean's own institution.
func (h *InstitutionHandler) Invite(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email is required"})
		return
	}
	// Validate format + bound length so garbage isn't persisted and an over-length value
	// returns a clean 400 rather than a Postgres "value too long" surfaced as a 500.
	req.Email = strings.TrimSpace(req.Email)
	if len(req.Email) > 254 || !emailRegex.MatchString(req.Email) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid email format"})
		return
	}
	if req.Role == "" {
		req.Role = "teacher"
	}
	if !validInviteRoles[req.Role] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be teacher or dean"})
		return
	}
	token, err := h.inst.CreateInvite(r.Context(), inst.ID, req.Email, req.Role)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create invite"})
		return
	}
	if uid, uok := h.uid(r); uok {
		// Store only the ROLE, never the invitee's email — activity_log is retained
		// long-term, so persisting the email here would survive that person's later
		// account deletion (right-to-erasure) as an orphaned copy of their PII.
		h.activity.Record(r.Context(), uid, store.ActStaffInvited, req.Role)
	}
	writeJSON(w, http.StatusCreated, map[string]string{"token": token, "email": req.Email, "role": req.Role})
}

// Students returns the institution's enrolled-student roster (the pool a teacher picks from).
func (h *InstitutionHandler) Students(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	list, err := h.inst.ListStudents(r.Context(), inst.ID, r.URL.Query().Get("q"), 100)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load students"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// Teachers returns the institution's teachers + deans (for the assign dropdown).
func (h *InstitutionHandler) Teachers(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	list, err := h.inst.ListTeachers(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load teachers"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// AssignCohort creates a cohort ASSIGNED to a teacher in the dean's institution.
func (h *InstitutionHandler) AssignCohort(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	var req struct {
		Name      string `json:"name"`
		TeacherID string `json:"teacherId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || len(req.Name) > maxNameLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required (max 200 chars)"})
		return
	}
	teacherID, err := uuid.Parse(req.TeacherID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid teacherId is required"})
		return
	}
	c, err := h.inst.CreateCohortFor(r.Context(), inst.ID, teacherID, req.Name)
	if errors.Is(err, store.ErrTeacherNotInInstitution) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "that teacher isn't in your institution"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create cohort"})
		return
	}
	if uid, uok := h.uid(r); uok {
		h.activity.Record(r.Context(), uid, store.ActCohortCreated, req.Name)
	}
	writeJSON(w, http.StatusCreated, c)
}

// EnrolStudent adds a pool student to one of the institution's cohorts (dean roster
// assignment — the student must be enrolled in the institution and the cohort in it).
func (h *InstitutionHandler) EnrolStudent(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	var req struct {
		LearnerID string `json:"learnerId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	learnerID, err := uuid.Parse(req.LearnerID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid learnerId is required"})
		return
	}
	inCohort, err := h.inst.CohortInInstitution(r.Context(), inst.ID, cohortID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !inCohort {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that cohort isn't in your institution"})
		return
	}
	inPool, err := h.inst.LearnerInInstitution(r.Context(), inst.ID, learnerID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !inPool {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that student isn't enrolled in your institution"})
		return
	}
	if err := h.teachers.AddCohortMember(r.Context(), cohortID, learnerID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to enrol student"})
		return
	}
	if uid, uok := h.uid(r); uok {
		h.activity.Record(r.Context(), uid, store.ActStudentEnrolled, "")
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// ListCohorts returns every cohort in the dean's institution (with teacher + headcount).
func (h *InstitutionHandler) ListCohorts(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	list, err := h.inst.ListCohorts(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load cohorts"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// ---------------- Dean-only management (institution-scoped) ----------------

// RemoveTeacher detaches a teacher/dean from the dean's institution (their cohorts
// move to the acting dean). Cannot remove yourself here, nor the last dean.
func (h *InstitutionHandler) RemoveTeacher(w http.ResponseWriter, r *http.Request) {
	inst, deanID, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid user id"})
		return
	}
	if userID == deanID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "you can't remove your own account here"})
		return
	}
	err = h.inst.RemoveMember(r.Context(), inst.ID, userID, deanID)
	switch {
	case errors.Is(err, store.ErrNotInInstitution):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "that member isn't in your institution"})
	case errors.Is(err, store.ErrLastDean):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "an institution must keep at least one dean — appoint another first"})
	case err != nil:
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to remove member"})
	default:
		writeJSON(w, http.StatusOK, map[string]bool{"removed": true})
	}
}

// SetTeacherRole changes a member's role (teacher<->dean) within the institution.
func (h *InstitutionHandler) SetTeacherRole(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	userID, err := uuid.Parse(chi.URLParam(r, "userId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid user id"})
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validInviteRoles[req.Role] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be teacher or dean"})
		return
	}
	err = h.inst.SetMemberRole(r.Context(), inst.ID, userID, req.Role)
	switch {
	case errors.Is(err, store.ErrNotInInstitution):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "that member isn't in your institution"})
	case errors.Is(err, store.ErrNotStaff):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "that member is a student — invite them as staff instead of changing their role directly"})
	case errors.Is(err, store.ErrLastDean):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "an institution must keep at least one dean"})
	case err != nil:
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to change role"})
	default:
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

// ListInvites returns the institution's outstanding invites.
func (h *InstitutionHandler) ListInvites(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	list, err := h.inst.ListInvites(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load invites"})
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// RevokeInvite cancels a pending invite.
func (h *InstitutionHandler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	inviteID, err := uuid.Parse(chi.URLParam(r, "inviteId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid invite id"})
		return
	}
	n, err := h.inst.RevokeInvite(r.Context(), inst.ID, inviteID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to revoke invite"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such pending invite"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"revoked": true})
}

// UpdateCohort renames and/or reassigns an institution cohort.
func (h *InstitutionHandler) UpdateCohort(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	var req struct {
		Name      string `json:"name"`
		TeacherID string `json:"teacherId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	if len(req.Name) > maxNameLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name too long (max 200 chars)"})
		return
	}
	if req.Name != "" {
		if err := h.inst.RenameCohort(r.Context(), inst.ID, cohortID, req.Name); err != nil {
			if errors.Is(err, store.ErrCohortNotInInstitution) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "that cohort isn't in your institution"})
			} else {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to rename cohort"})
			}
			return
		}
	}
	if req.TeacherID != "" {
		teacherID, perr := uuid.Parse(req.TeacherID)
		if perr != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "valid teacherId required"})
			return
		}
		err = h.inst.ReassignCohort(r.Context(), inst.ID, cohortID, teacherID)
		switch {
		case errors.Is(err, store.ErrTeacherNotInInstitution):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "that teacher isn't in your institution"})
			return
		case errors.Is(err, store.ErrCohortNotInInstitution):
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "that cohort isn't in your institution"})
			return
		case err != nil:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to reassign cohort"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DeleteCohort removes an institution cohort (cascades members/assignments).
func (h *InstitutionHandler) DeleteCohort(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	cohortID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cohort id"})
		return
	}
	err = h.inst.DeleteCohort(r.Context(), inst.ID, cohortID)
	if errors.Is(err, store.ErrCohortNotInInstitution) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that cohort isn't in your institution"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete cohort"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// RemoveCohortStudent removes one student from one of the institution's cohorts.
func (h *InstitutionHandler) RemoveCohortStudent(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
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
	inCohort, err := h.inst.CohortInInstitution(r.Context(), inst.ID, cohortID)
	if err != nil || !inCohort {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that cohort isn't in your institution"})
		return
	}
	if err := h.teachers.RemoveCohortMember(r.Context(), cohortID, learnerID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to remove student"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"removed": true})
}

// UnenrolStudent removes a student from the institution entirely (all its cohorts + the pool).
func (h *InstitutionHandler) UnenrolStudent(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	learnerID, err := uuid.Parse(chi.URLParam(r, "learnerId"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid learner id"})
		return
	}
	err = h.inst.UnenrolStudent(r.Context(), inst.ID, learnerID)
	if errors.Is(err, store.ErrNotInInstitution) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "that student isn't in your institution"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to unenrol student"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"removed": true})
}

// UpdateInstitution renames the dean's institution.
func (h *InstitutionHandler) UpdateInstitution(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Name) < 2 || len(req.Name) > maxNameLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required (2–200 chars)"})
		return
	}
	updated, err := h.inst.Rename(r.Context(), inst.ID, req.Name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to rename institution"})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// RotateJoinCode issues a fresh student join code for the dean's institution.
func (h *InstitutionHandler) RotateJoinCode(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	updated, err := h.inst.RotateJoinCode(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to rotate join code"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"joinCode": updated.JoinCode})
}

// ActivityFeed returns the institution's recent staff activity (who did what, when).
func (h *InstitutionHandler) ActivityFeed(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	feed, err := h.activity.FeedForInstitution(r.Context(), inst.ID, 60)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load activity"})
		return
	}
	writeJSON(w, http.StatusOK, feed)
}

// ActivityCounts returns per-teacher action counts over the last 30 days (the
// proactive-vs-passive signal on the dean overview).
func (h *InstitutionHandler) ActivityCounts(w http.ResponseWriter, r *http.Request) {
	inst, _, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	counts, err := h.activity.CountsForInstitution(r.Context(), inst.ID, 30)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load activity counts"})
		return
	}
	writeJSON(w, http.StatusOK, counts)
}
