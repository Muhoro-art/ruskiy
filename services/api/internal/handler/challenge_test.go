package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type chalResp struct {
	Disabled bool       `json:"disabled"`
	ID       string     `json:"id"`
	Prompt   string     `json:"prompt"`
	Tiles    []chalTile `json:"tiles"`
}

type verifyResp struct {
	OK    bool   `json:"ok"`
	Token string `json:"token"`
	Error string `json:"error"`
}

func newTestChallenge(enabled bool) (*ChallengeHandler, *MemoryChallengeStore) {
	store := NewMemoryChallengeStore(4*time.Minute, 10*time.Minute)
	return NewChallengeHandler(store, enabled), store
}

// getChallenge issues a challenge and returns the decoded response.
func getChallenge(t *testing.T, h *ChallengeHandler) chalResp {
	t.Helper()
	rec := httptest.NewRecorder()
	h.GetChallenge(rec, httptest.NewRequest(http.MethodGet, "/v1/auth/challenge", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GetChallenge status = %d, want 200", rec.Code)
	}
	var resp chalResp
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode challenge: %v", err)
	}
	return resp
}

// solveKeys returns the tile keys a human would tap: those whose emoji belongs to
// the category named in the prompt. It relies only on the public response.
func solveKeys(t *testing.T, resp chalResp) []string {
	t.Helper()
	label := strings.TrimPrefix(resp.Prompt, "Tap all the ")
	var target []string
	for _, c := range chalCategories {
		if c.label == label {
			target = c.emojis
			break
		}
	}
	if target == nil {
		t.Fatalf("prompt names unknown category: %q", resp.Prompt)
	}
	inTarget := make(map[string]bool, len(target))
	for _, e := range target {
		inTarget[e] = true
	}
	var keys []string
	for _, tile := range resp.Tiles {
		if inTarget[tile.Emoji] {
			keys = append(keys, tile.Key)
		}
	}
	return keys
}

func postVerify(t *testing.T, h *ChallengeHandler, id string, selected []string) verifyResp {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"id": id, "selected": selected})
	rec := httptest.NewRecorder()
	h.VerifyChallenge(rec, httptest.NewRequest(http.MethodPost, "/v1/auth/challenge", bytes.NewReader(body)))
	var resp verifyResp
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode verify: %v", err)
	}
	return resp
}

func TestChallengeShape(t *testing.T) {
	h, _ := newTestChallenge(true)
	resp := getChallenge(t, h)

	if resp.Disabled {
		t.Fatal("challenge should not be disabled")
	}
	if resp.ID == "" || resp.Prompt == "" {
		t.Fatal("challenge missing id/prompt")
	}
	if len(resp.Tiles) != humanTileCount {
		t.Fatalf("tiles = %d, want %d", len(resp.Tiles), humanTileCount)
	}
	seen := map[string]bool{}
	for _, tile := range resp.Tiles {
		if tile.Key == "" || tile.Emoji == "" {
			t.Fatal("tile missing key/emoji")
		}
		if seen[tile.Key] {
			t.Fatalf("duplicate tile key %q", tile.Key)
		}
		seen[tile.Key] = true
	}
	// There must be a real answer to find (at least one, fewer than all).
	correct := solveKeys(t, resp)
	if len(correct) == 0 || len(correct) >= humanTileCount {
		t.Fatalf("solvable set size = %d, want 1..%d", len(correct), humanTileCount-1)
	}
}

func TestChallengeCorrectSolveMintsPass(t *testing.T) {
	h, store := newTestChallenge(true)
	resp := getChallenge(t, h)
	v := postVerify(t, h, resp.ID, solveKeys(t, resp))
	if !v.OK || v.Token == "" {
		t.Fatalf("correct solve: ok=%v token=%q, want ok+token", v.OK, v.Token)
	}
	// The minted pass must be redeemable exactly once.
	if !store.TakePass(v.Token) {
		t.Fatal("pass should be redeemable once")
	}
	if store.TakePass(v.Token) {
		t.Fatal("pass must not be redeemable twice (single-use)")
	}
}

func TestChallengeWrongSelectionFails(t *testing.T) {
	h, _ := newTestChallenge(true)
	resp := getChallenge(t, h)
	correct := solveKeys(t, resp)

	// Submit the complement (definitely wrong: fillers instead of the target set).
	correctSet := map[string]bool{}
	for _, k := range correct {
		correctSet[k] = true
	}
	var wrong []string
	for _, tile := range resp.Tiles {
		if !correctSet[tile.Key] {
			wrong = append(wrong, tile.Key)
		}
	}
	v := postVerify(t, h, resp.ID, wrong)
	if v.OK {
		t.Fatal("wrong selection should not verify")
	}
	// The challenge is single-attempt: retrying the same id (even correctly) fails.
	again := postVerify(t, h, resp.ID, correct)
	if again.OK || again.Error != "expired" {
		t.Fatalf("consumed challenge: ok=%v err=%q, want ok=false err=expired", again.OK, again.Error)
	}
}

func TestChallengeUnknownIDFails(t *testing.T) {
	h, _ := newTestChallenge(true)
	v := postVerify(t, h, "does-not-exist", []string{"a", "b"})
	if v.OK || v.Error != "expired" {
		t.Fatalf("unknown id: ok=%v err=%q, want ok=false err=expired", v.OK, v.Error)
	}
}

func TestRequireHumanGate(t *testing.T) {
	h, store := newTestChallenge(true)
	resp := getChallenge(t, h)
	v := postVerify(t, h, resp.ID, solveKeys(t, resp))
	if !v.OK {
		t.Fatal("precondition: solve should succeed")
	}

	var reached bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true; w.WriteHeader(200) })
	gate := RequireHuman(store, true)(next)

	// Missing token → 403, downstream not reached.
	rec := httptest.NewRecorder()
	gate.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v1/auth/token", nil))
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("no token: code=%d reached=%v, want 403 + not reached", rec.Code, reached)
	}

	// Valid token → passes through.
	reached = false
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/token", nil)
	req.Header.Set("X-Human-Token", v.Token)
	gate.ServeHTTP(rec, req)
	if rec.Code != 200 || !reached {
		t.Fatalf("valid token: code=%d reached=%v, want 200 + reached", rec.Code, reached)
	}

	// Replaying the same (now consumed) token → 403.
	reached = false
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/v1/auth/token", nil)
	req.Header.Set("X-Human-Token", v.Token)
	gate.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden || reached {
		t.Fatalf("replayed token: code=%d reached=%v, want 403 + not reached", rec.Code, reached)
	}
}

func TestChallengeDisabled(t *testing.T) {
	h, store := newTestChallenge(false)

	resp := getChallenge(t, h)
	if !resp.Disabled {
		t.Fatal("disabled handler should report disabled=true")
	}

	// The gate is a pass-through when disabled, even with no token.
	var reached bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true; w.WriteHeader(200) })
	rec := httptest.NewRecorder()
	RequireHuman(store, false)(next).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v1/auth/token", nil))
	if rec.Code != 200 || !reached {
		t.Fatalf("disabled gate: code=%d reached=%v, want 200 + reached", rec.Code, reached)
	}
}
