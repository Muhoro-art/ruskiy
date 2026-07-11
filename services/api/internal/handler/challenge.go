package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// Human-verification challenge ("are you a human?") — a self-hosted, no-external-
// dependency bot check that gates the public auth routes (register + login).
//
// Flow: the client GETs a challenge ("Tap all the animals" over an emoji grid),
// the learner taps the matching tiles, POSTs the selection back, and on a correct
// answer the server mints a SINGLE-USE pass token. The register/token routes then
// require that pass (see RequireHuman). This raises the cost of scripted
// credential-stuffing / signup spam on top of the per-IP throttle in main.go.
//
// It is a deterrent, not a guarantee: a determined, vision-capable bot can still
// solve an emoji grid — that is the accepted tradeoff of a self-hosted challenge
// versus a commercial CAPTCHA. Everything is single-use + TTL'd + server-verified
// so a solved answer can't be replayed and the correct set is never trusted from
// the client. Set HUMAN_CHECK_ENABLED=false to disable the whole gate.

// humanTileCount is how many tiles a challenge shows (a 3×3 grid). The solve-window
// and pass TTLs are set where the store is constructed (cmd/server/main.go).
// A 9-tile grid with 3–4 correct tiles gives a random guesser ≈1/210 per attempt
// (C(9,3)+C(9,4)=210); combined with the per-IP auth throttle this makes scripted
// solving impractical without an actual vision model.
const humanTileCount = 9

// ChallengeStore persists the correct answer for an outstanding challenge and the
// single-use passes minted when one is solved. Redis-backed across replicas in
// production; the in-memory fallback keeps single-instance dev working. Both are
// single-use (consuming removes the entry) and TTL'd.
type ChallengeStore interface {
	SaveChallenge(id, answer string) error
	// TakeChallenge atomically returns and removes the answer for id. ok is false
	// if the id is unknown, expired, or already consumed.
	TakeChallenge(id string) (answer string, ok bool)
	SavePass(token string) error
	// TakePass atomically consumes a solved-pass token (false if unknown/expired/used).
	TakePass(token string) bool
}

// chalCategories are mutually-exclusive, unambiguous emoji groups. The challenge
// names one category and mixes its tiles with fillers drawn from the others, so a
// solver must recognise the category rather than tap a fixed pattern.
var chalCategories = []struct {
	label  string
	emojis []string
}{
	{"animals", []string{"🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🐔", "🐧", "🦆", "🐢", "🐙", "🦋"}},
	{"fruits", []string{"🍎", "🍌", "🍇", "🍓", "🍑", "🍒", "🍍", "🥝", "🍉", "🍊", "🥭", "🍐", "🍈", "🍏"}},
	{"vehicles", []string{"🚗", "🚌", "🚕", "🚎", "🚓", "🚑", "🚒", "✈️", "🚀", "🚲", "🛵", "🚚", "🚂", "⛵"}},
	{"sports items", []string{"⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🥊", "⛳", "🏒", "🥅"}},
}

type chalTile struct {
	Key   string `json:"key"`
	Emoji string `json:"emoji"`
}

// ChallengeHandler issues and verifies human-verification challenges.
type ChallengeHandler struct {
	store   ChallengeStore
	enabled bool
}

func NewChallengeHandler(store ChallengeStore, enabled bool) *ChallengeHandler {
	return &ChallengeHandler{store: store, enabled: enabled}
}

// GetChallenge (GET /v1/auth/challenge) returns a fresh puzzle, or {disabled:true}
// when the gate is turned off (the client then skips the check).
func (h *ChallengeHandler) GetChallenge(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		writeJSON(w, http.StatusOK, map[string]any{"disabled": true})
		return
	}

	// Pick the target category, then 3–4 correct tiles + fillers from the others.
	ti := randN(len(chalCategories))
	target := chalCategories[ti]
	correctN := 3 + randN(2) // 3 or 4 correct tiles
	if correctN >= humanTileCount {
		correctN = humanTileCount - 1
	}
	correct := pickDistinct(target.emojis, correctN)

	fillerPool := make([]string, 0, 32)
	for i, c := range chalCategories {
		if i != ti {
			fillerPool = append(fillerPool, c.emojis...)
		}
	}
	fillers := pickDistinct(fillerPool, humanTileCount-len(correct))

	// Give every tile an unguessable key so the answer isn't a positional pattern.
	tiles := make([]chalTile, 0, humanTileCount)
	correctKeys := make([]string, 0, len(correct))
	for _, e := range correct {
		k := randToken(4)
		tiles = append(tiles, chalTile{Key: k, Emoji: e})
		correctKeys = append(correctKeys, k)
	}
	for _, e := range fillers {
		tiles = append(tiles, chalTile{Key: randToken(4), Emoji: e})
	}
	shuffleTiles(tiles)

	sort.Strings(correctKeys)
	answer := strings.Join(correctKeys, ",")
	id := randToken(16)
	if err := h.store.SaveChallenge(id, answer); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "challenge_unavailable"})
		return
	}

	// Discourage caching of the one-shot challenge by any intermediary.
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"disabled": false,
		"id":       id,
		"prompt":   "Tap all the " + target.label,
		"tiles":    tiles,
	})
}

// VerifyChallenge (POST /v1/auth/challenge) checks a submitted selection and, on
// success, returns a single-use pass token. Always 200 so the client can branch on
// the ok flag; the challenge is consumed on the first attempt (right or wrong), so
// a miss means fetching a fresh puzzle.
func (h *ChallengeHandler) VerifyChallenge(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	var req struct {
		ID       string   `json:"id"`
		Selected []string `json:"selected"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	answer, ok := h.store.TakeChallenge(req.ID)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "expired"})
		return
	}

	sel := append([]string(nil), req.Selected...)
	sort.Strings(sel)
	sel = dedupeSorted(sel)
	if strings.Join(sel, ",") != answer {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "incorrect"})
		return
	}

	token := randToken(24)
	if err := h.store.SavePass(token); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "challenge_unavailable"})
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": token})
}

// RequireHuman gates a route on a valid, single-use human-verification pass carried
// in the X-Human-Token header. It consumes the pass, so each protected attempt
// needs its own fresh proof — exactly what deters automated credential-stuffing.
// A no-op when the feature is disabled.
func RequireHuman(store ChallengeStore, enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !enabled {
				next.ServeHTTP(w, r)
				return
			}
			token := r.Header.Get("X-Human-Token")
			if token == "" || !store.TakePass(token) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "human_verification_required"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// --- crypto helpers (all challenge randomness comes from crypto/rand) ---

func randToken(nbytes int) string {
	b := make([]byte, nbytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failure is fatal for security primitives; return an obviously
		// unusable value rather than a predictable one.
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func randN(n int) int {
	if n <= 0 {
		return 0
	}
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(v.Int64())
}

// pickDistinct returns k distinct elements from pool via a crypto Fisher–Yates shuffle.
func pickDistinct(pool []string, k int) []string {
	cp := append([]string(nil), pool...)
	for i := len(cp) - 1; i > 0; i-- {
		j := randN(i + 1)
		cp[i], cp[j] = cp[j], cp[i]
	}
	if k > len(cp) {
		k = len(cp)
	}
	return cp[:k]
}

func shuffleTiles(t []chalTile) {
	for i := len(t) - 1; i > 0; i-- {
		j := randN(i + 1)
		t[i], t[j] = t[j], t[i]
	}
}

// dedupeSorted removes adjacent duplicates from a sorted slice (so a bot can't
// match by padding the selection with repeats).
func dedupeSorted(s []string) []string {
	if len(s) == 0 {
		return s
	}
	out := s[:1]
	for _, v := range s[1:] {
		if v != out[len(out)-1] {
			out = append(out, v)
		}
	}
	return out
}

// --- in-memory ChallengeStore (single-instance / Redis-down fallback) ---

type memChalEntry struct {
	val string
	exp time.Time
}

// MemoryChallengeStore is a process-local ChallengeStore. Single-use per key,
// TTL'd, and swept opportunistically on write so abandoned challenges don't
// accumulate. Namespaced keys ("c:"/"p:") keep challenges and passes separate.
type MemoryChallengeStore struct {
	mu      sync.Mutex
	m       map[string]memChalEntry
	chalTTL time.Duration
	passTTL time.Duration
}

func NewMemoryChallengeStore(chalTTL, passTTL time.Duration) *MemoryChallengeStore {
	return &MemoryChallengeStore{m: make(map[string]memChalEntry), chalTTL: chalTTL, passTTL: passTTL}
}

func (s *MemoryChallengeStore) put(key, val string, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for k, v := range s.m {
		if now.After(v.exp) {
			delete(s.m, k)
		}
	}
	s.m[key] = memChalEntry{val: val, exp: now.Add(ttl)}
}

func (s *MemoryChallengeStore) take(key string) (string, bool) {
	if key == "" {
		return "", false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.m[key]
	if ok {
		delete(s.m, key) // single-use
	}
	if !ok || time.Now().After(v.exp) {
		return "", false
	}
	return v.val, true
}

func (s *MemoryChallengeStore) SaveChallenge(id, answer string) error {
	s.put("c:"+id, answer, s.chalTTL)
	return nil
}

func (s *MemoryChallengeStore) TakeChallenge(id string) (string, bool) {
	return s.take("c:" + id)
}

func (s *MemoryChallengeStore) SavePass(token string) error {
	s.put("p:"+token, "1", s.passTTL)
	return nil
}

func (s *MemoryChallengeStore) TakePass(token string) bool {
	_, ok := s.take("p:" + token)
	return ok
}
