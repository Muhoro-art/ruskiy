package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/event"
	"github.com/russkiy/api/internal/middleware"
)

// EventsHandler streams server-sent events to the signed-in user — the push
// half of live updates (a new assignment lands, a student finishes a task).
// Clients treat each event as a "refresh now" poke and keep their slow poll
// as the fallback, so a dropped stream or missed event degrades gracefully.
type EventsHandler struct {
	notifier *event.Notifier
}

func NewEventsHandler(n *event.Notifier) *EventsHandler {
	return &EventsHandler{notifier: n}
}

// Stream — GET /v1/events (authenticated). Standard SSE: one "data: {...}"
// frame per event, comment heartbeats every 25s so proxies and the browser
// keep the connection alive.
func (h *EventsHandler) Stream(w http.ResponseWriter, r *http.Request) {
	uid, err := uuid.Parse(middleware.GetUserID(r.Context()))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
		return
	}
	// The server's global 30s WriteTimeout would sever a long-lived stream;
	// clear the deadline for THIS response only.
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx et al.: don't buffer the stream
	w.WriteHeader(http.StatusOK)

	events, cancel := h.notifier.Subscribe(uid)
	defer cancel()

	// Opening comment forces headers + proxy passthrough immediately.
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case payload, open := <-events:
			if !open {
				return
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
