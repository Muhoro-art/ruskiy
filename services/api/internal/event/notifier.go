package event

import (
	"encoding/json"
	"sync"

	"github.com/google/uuid"
)

// Notifier is the in-process push channel behind GET /v1/events: handlers
// Publish small JSON events keyed by USER id, and every open SSE stream for
// that user receives them. This is deliberately not the Kafka-sim Broker in
// broker.go — that models durable partitioned topics for activity analytics;
// this is fire-and-forget UI signaling where a missed event is fine (the
// client's slow poll self-heals within 15s).
type Notifier struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan []byte]struct{}
}

func NewNotifier() *Notifier {
	return &Notifier{subs: make(map[uuid.UUID]map[chan []byte]struct{})}
}

// Subscribe registers a stream for userID. The returned cancel MUST be called
// when the stream ends (it unregisters and closes the channel).
func (n *Notifier) Subscribe(userID uuid.UUID) (<-chan []byte, func()) {
	ch := make(chan []byte, 8)
	n.mu.Lock()
	if n.subs[userID] == nil {
		n.subs[userID] = make(map[chan []byte]struct{})
	}
	n.subs[userID][ch] = struct{}{}
	n.mu.Unlock()
	cancel := func() {
		n.mu.Lock()
		if set, ok := n.subs[userID]; ok {
			if _, live := set[ch]; live {
				delete(set, ch)
				close(ch)
			}
			if len(set) == 0 {
				delete(n.subs, userID)
			}
		}
		n.mu.Unlock()
	}
	return ch, cancel
}

// Publish sends the event to every open stream of every given user.
// Non-blocking: a subscriber whose buffer is full simply misses this event —
// it's a UI poke, and the client's fallback poll covers the gap.
func (n *Notifier) Publish(event any, userIDs ...uuid.UUID) {
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}
	n.mu.RLock()
	defer n.mu.RUnlock()
	for _, uid := range userIDs {
		for ch := range n.subs[uid] {
			select {
			case ch <- payload:
			default:
			}
		}
	}
}
