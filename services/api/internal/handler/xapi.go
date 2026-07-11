package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/middleware"
	"github.com/russkiy/api/internal/store"
)

// XAPIHandler implements a minimal xAPI LRS: it validates the required statement
// structure (actor, verb, object) and persists the statement.
type XAPIHandler struct {
	store *store.XAPIStore
}

func NewXAPIHandler(s *store.XAPIStore) *XAPIHandler {
	return &XAPIHandler{store: s}
}

// xapiStatement captures the three required xAPI properties; the full statement
// is stored verbatim as `raw`.
type xapiStatement struct {
	Actor  json.RawMessage `json:"actor"`
	Verb   json.RawMessage `json:"verb"`
	Object json.RawMessage `json:"object"`
}

func (h *XAPIHandler) Store(w http.ResponseWriter, r *http.Request) {
	uid, err := uuid.Parse(middleware.GetUserID(r.Context()))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	var stmt xapiStatement
	if err := json.Unmarshal(body, &stmt); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid xAPI statement JSON"})
		return
	}
	// xAPI requires actor, verb, and object.
	if len(stmt.Actor) == 0 || len(stmt.Verb) == 0 || len(stmt.Object) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "statement must include actor, verb, and object"})
		return
	}
	id, err := h.store.Insert(r.Context(), uid, stmt.Actor, stmt.Verb, stmt.Object, json.RawMessage(body))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to store statement"})
		return
	}
	// xAPI: respond 200 with the statement id(s).
	writeJSON(w, http.StatusOK, []string{id.String()})
}

func (h *XAPIHandler) List(w http.ResponseWriter, r *http.Request) {
	uid, err := uuid.Parse(middleware.GetUserID(r.Context()))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	recs, err := h.store.Recent(r.Context(), uid, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to query statements"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"statements": recs})
}
