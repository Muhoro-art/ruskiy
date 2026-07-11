package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

// DeanHandler backs the Dean command-and-control panel — scoped to the dean's OWN
// institution, so a dean only ever sees how their tenant's teachers are performing.
type DeanHandler struct {
	teachers     *store.TeacherStore
	institutions *store.InstitutionStore
}

func NewDeanHandler(teachers *store.TeacherStore, institutions *store.InstitutionStore) *DeanHandler {
	return &DeanHandler{teachers: teachers, institutions: institutions}
}

func (h *DeanHandler) deanInstitution(r *http.Request) (*store.Institution, bool) {
	id := middleware.GetUserID(r.Context())
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, false
	}
	inst, err := h.institutions.OfUser(r.Context(), uid)
	if err != nil || inst == nil {
		return nil, false
	}
	return inst, true
}

// Overview: the dean's institution totals + per-teacher performance table.
func (h *DeanHandler) Overview(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.deanInstitution(r)
	if !ok {
		// A dean not attached to an institution has nothing to oversee yet.
		writeJSON(w, http.StatusOK, &store.DeanOverview{TeacherRows: []store.TeacherPerf{}})
		return
	}
	ov, err := h.teachers.DeanOverview(r.Context(), inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build overview"})
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

// TeacherDetail: one teacher's command-center rollup — only if that teacher belongs
// to the dean's institution (cross-tenant drill-down is denied).
func (h *DeanHandler) TeacherDetail(w http.ResponseWriter, r *http.Request) {
	inst, ok := h.deanInstitution(r)
	if !ok {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "you are not attached to an institution"})
		return
	}
	tid, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid teacher id"})
		return
	}
	member, err := h.institutions.UserInInstitution(r.Context(), tid, inst.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if !member {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "that teacher isn't in your institution"})
		return
	}
	c2, err := h.teachers.TeacherC2(r.Context(), tid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build teacher detail"})
		return
	}
	writeJSON(w, http.StatusOK, c2)
}
