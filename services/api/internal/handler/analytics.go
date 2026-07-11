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

type AnalyticsHandler struct {
	store    *store.AnalyticsStore
	profiles *store.ProfileStore
}

func NewAnalyticsHandler(s *store.AnalyticsStore, profiles *store.ProfileStore) *AnalyticsHandler {
	return &AnalyticsHandler{store: s, profiles: profiles}
}

// Event types we accept. Anything else in a batch is dropped (defends the store
// against arbitrary client-supplied types).
var validEventTypes = map[string]bool{
	"page_view": true, "click": true, "dwell": true,
	"task_start": true, "task_complete": true, "task_abandon": true,
	"session_start": true, "session_end": true,
}

// Product analytics is stored ONLY for segments known to be adults — an allowlist,
// so any minor segment (kid/toddler/teen) AND any unknown/empty segment fail CLOSED
// (dropped) by default. This is the server-side backstop; the client suppresses too.
// A profile-less account (segment "") is therefore not tracked, which is the correct
// privacy stance: if we can't prove the learner is an adult, we don't store events.
var adultSegments = map[string]bool{
	"uni_prep": true, "daily_life": true, "migrant": true,
	"senior": true, "professional": true, "core": true,
}

// metaAllowedKeys is the ONLY set of keys retained from a client-supplied analytics
// `meta` object. Everything else is dropped so free-text / PII cannot be smuggled in.
var metaAllowedKeys = map[string]bool{"task": true, "lessonId": true, "from": true, "phase": true}

type ingestBody struct {
	SessionID string                 `json:"sessionId"`
	Events    []store.AnalyticsEvent `json:"events"`
}

// Ingest accepts a batch of behavioral events from an authenticated learner and
// stores them — unless the learner is a minor, in which case the batch is dropped.
func (h *AnalyticsHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 256<<10)) // 256 KB cap
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	var in ingestBody
	if err := json.Unmarshal(body, &in); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	sid, err := uuid.Parse(in.SessionID)
	if err != nil || len(in.Events) == 0 {
		w.WriteHeader(http.StatusNoContent) // nothing usable — accept silently
		return
	}

	// Privacy backstop: never store analytics for minors — and FAIL CLOSED. If the
	// segment lookup errors (DB blip, timeout), we can't prove the learner is an
	// adult, so we drop the batch rather than risk storing a child's events.
	// ErrNoRows is mapped to ("", nil) in the store, so a legitimately profile-less
	// adult account still passes.
	segment, segErr := h.profiles.SegmentByUserID(r.Context(), uid)
	if segErr != nil || !adultSegments[segment] {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	const maxBatch = 300
	if len(in.Events) > maxBatch {
		in.Events = in.Events[:maxBatch]
	}
	clean := make([]store.AnalyticsEvent, 0, len(in.Events))
	for _, e := range in.Events {
		if !validEventTypes[e.EventType] {
			continue
		}
		e.SessionID = sid // authoritative: the batch's session
		e.Route = truncate(e.Route, 256)
		e.Element = truncate(e.Element, 120)
		e.X = clampFrac(e.X)
		e.Y = clampFrac(e.Y)
		e.Meta = sanitizeMeta(e.Meta) // strip everything but a short allowlist (no PII)
		clean = append(clean, e)
	}
	if err := h.store.InsertBatch(r.Context(), uid, segment, clean); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to store events"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	data, err := h.store.Overview(r.Context(), days(r))
	respond(w, data, err)
}

func (h *AnalyticsHandler) Routes(w http.ResponseWriter, r *http.Request) {
	data, err := h.store.Routes(r.Context(), days(r))
	respond(w, data, err)
}

func (h *AnalyticsHandler) Heatmap(w http.ResponseWriter, r *http.Request) {
	route := r.URL.Query().Get("route")
	if route == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "route query param required"})
		return
	}
	data, err := h.store.ClickHeatmap(r.Context(), route, days(r), 48, 30)
	respond(w, data, err)
}

func (h *AnalyticsHandler) Engagement(w http.ResponseWriter, r *http.Request) {
	data, err := h.store.Engagement(r.Context(), days(r))
	respond(w, data, err)
}

// ---- helpers ----

func respond(w http.ResponseWriter, data interface{}, err error) {
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "query failed"})
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func days(r *http.Request) int {
	d, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if d <= 0 {
		return 14
	}
	if d > 90 {
		return 90
	}
	return d
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func clampFrac(f *float64) *float64 {
	if f == nil {
		return nil
	}
	v := *f
	if v < 0 {
		v = 0
	}
	if v > 1 {
		v = 1
	}
	return &v
}

// sanitizeMeta strips a client-supplied analytics `meta` object down to a short
// allowlist of keys with short string values, capping total size. Anything else
// (free text, PII, nested objects, non-string values, oversize) is dropped. The
// "no PII / no free text" guarantee is enforced HERE, server-side — never trusted
// from the client.
func sanitizeMeta(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	var in map[string]json.RawMessage
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil
	}
	out := make(map[string]string, len(metaAllowedKeys))
	for k := range metaAllowedKeys {
		v, ok := in[k]
		if !ok {
			continue
		}
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			continue // only short string scalars survive
		}
		out[k] = truncate(s, 64)
	}
	if len(out) == 0 {
		return nil
	}
	b, err := json.Marshal(out)
	if err != nil || len(b) > 512 {
		return nil
	}
	return b
}
