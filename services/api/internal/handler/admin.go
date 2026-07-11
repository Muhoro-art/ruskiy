package handler

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"

	"github.com/russkiy/api/internal/store"
)

// AdminHandler exposes operator actions guarded by a shared admin key (header
// X-Admin-Key), so the deployer can bootstrap roles without first having an
// admin user. If no key is configured, the endpoints are disabled.
type AdminHandler struct {
	users  *store.UserStore
	apiKey string
}

func NewAdminHandler(users *store.UserStore, apiKey string) *AdminHandler {
	return &AdminHandler{users: users, apiKey: apiKey}
}

func (h *AdminHandler) authorized(r *http.Request) bool {
	return adminKeyEqual(h.apiKey, r.Header.Get("X-Admin-Key"))
}

// adminKeyEqual compares the presented admin key to the configured one in constant
// time (over SHA-256 so length isn't leaked either), avoiding the byte-by-byte
// timing side channel of `==` on a secret that gates role escalation + tenant
// creation. Shared by AdminHandler and InstitutionHandler.
func adminKeyEqual(configured, presented string) bool {
	if configured == "" {
		return false
	}
	c := sha256.Sum256([]byte(configured))
	p := sha256.Sum256([]byte(presented))
	return subtle.ConstantTimeCompare(c[:], p[:]) == 1
}

var validRoles = map[string]bool{"learner": true, "teacher": true, "admin": true, "dean": true}

type setRoleRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// SetRole grants a role to a user by email. Requires the X-Admin-Key header.
func (h *AdminHandler) SetRole(w http.ResponseWriter, r *http.Request) {
	if !h.authorized(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "admin key required"})
		return
	}
	var req setRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email and role are required"})
		return
	}
	if !validRoles[req.Role] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role must be one of learner, teacher, admin, dean"})
		return
	}
	n, err := h.users.SetRoleByEmail(r.Context(), req.Email, req.Role)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to set role"})
		return
	}
	if n == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no user with that email"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"email": req.Email, "role": req.Role, "updated": n})
}
