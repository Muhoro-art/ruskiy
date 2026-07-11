package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/russkiy/api/internal/store"
)

// Студия Phase A — teacher-authored content CRUD + submit-for-moderation.
// Authorization: the store scopes every statement by author_id = caller, so a
// forged id in the URL can only ever hit the caller's own rows (404 otherwise).

// contentRequest is the create/update payload.
type contentRequest struct {
	Title        string          `json:"title"`
	ExerciseType string          `json:"exerciseType"`
	ContentData  json.RawMessage `json:"contentData"`
	CEFRLevel    string          `json:"cefrLevel"`
	Topic        string          `json:"topic"`
	TargetSkills []string        `json:"targetSkills"`
}

const (
	maxContentBytes   = 64 << 10 // 64 KiB per item — far above any legitimate exercise
	maxCompositeSteps = 20
	maxDistractors    = 6
	maxMatchPairs     = 12
	maxFieldLen       = 500
	maxTitleLen       = 200
	maxTopicLen       = 100
	maxTargetSkills   = 10
	maxSkillIDLen     = 120
)

// atomicContent mirrors the studio's editable fields per exercise type — the
// FULL ten-type engine. Unknown JSON keys are tolerated (forward-compat) but
// never required.
type atomicContent struct {
	PromptEn      string   `json:"promptEn"`
	PromptRu      string   `json:"promptRu"`
	CorrectAnswer string   `json:"correctAnswer"`
	Answer        string   `json:"answer"`
	HintEn        string   `json:"hintEn"`
	ExplanationEn string   `json:"explanationEn"`
	Distractors   []string `json:"distractors"`
	MatchPairs    []struct {
		Left  string `json:"left"`
		Right string `json:"right"`
	} `json:"matchPairs"`
	// sentence_builder
	CorrectOrder     []string `json:"correctOrder"`
	DistractorTokens []string `json:"distractorTokens"`
	TranslationEn    string   `json:"translationEn"`
	// listening
	TextRu string `json:"textRu"`
	// memory_match
	Pairs []struct {
		Ru string `json:"ru"`
		En string `json:"en"`
	} `json:"pairs"`
	// drag_endings
	TemplateRu string `json:"templateRu"`
	Slots      []struct {
		Stem    string `json:"stem"`
		Correct string `json:"correct"`
	} `json:"slots"`
	EndingBank []string `json:"endingBank"`
	// free_response
	ModelAnswerRu string   `json:"modelAnswerRu"`
	RubricEn      []string `json:"rubricEn"`
	ResponseMode  string   `json:"responseMode"`
	// dialogue
	DialogueLines []struct {
		Speaker string `json:"speaker"`
		TextRu  string `json:"textRu"`
		TextEn  string `json:"textEn"`
	} `json:"dialogueLines"`
}

// fieldLenOK counts CHARACTERS (runes), not bytes — Cyrillic is 2 bytes/char in
// UTF-8, so a byte-based cap would reject Russian content at half the advertised
// length in a Russian-language authoring tool.
func fieldLenOK(ss ...string) bool {
	for _, s := range ss {
		if utf8.RuneCountInString(s) > maxFieldLen {
			return false
		}
	}
	return true
}

// validateAtomic checks the type-specific required fields (mirrors the props of
// the exercise components that will render this content).
func validateAtomic(exerciseType string, data json.RawMessage) error {
	var a atomicContent
	if err := json.Unmarshal(data, &a); err != nil {
		return fmt.Errorf("contentData must be a JSON object")
	}
	if !fieldLenOK(a.PromptEn, a.PromptRu, a.CorrectAnswer, a.Answer, a.HintEn, a.ExplanationEn) {
		return fmt.Errorf("a field exceeds %d characters", maxFieldLen)
	}
	switch exerciseType {
	case "multiple_choice":
		if strings.TrimSpace(a.PromptEn) == "" || strings.TrimSpace(a.CorrectAnswer) == "" {
			return fmt.Errorf("multiple_choice requires promptEn and correctAnswer")
		}
		if len(a.Distractors) < 1 || len(a.Distractors) > maxDistractors {
			return fmt.Errorf("multiple_choice requires 1–%d distractors", maxDistractors)
		}
		if !fieldLenOK(a.Distractors...) {
			return fmt.Errorf("a distractor exceeds %d characters", maxFieldLen)
		}
		// Blank distractors render as unclickable empty buttons; a distractor equal
		// to the answer makes two "correct" options. Both break the exercise.
		correct := strings.TrimSpace(a.CorrectAnswer)
		seen := map[string]bool{}
		for _, d := range a.Distractors {
			dt := strings.TrimSpace(d)
			if dt == "" {
				return fmt.Errorf("distractors must be non-empty")
			}
			if dt == correct {
				return fmt.Errorf("a distractor equals the correct answer")
			}
			if seen[dt] {
				return fmt.Errorf("distractors must be unique")
			}
			seen[dt] = true
		}
	case "fill_blank":
		// EXACTLY one blank: the renderer splits on ___ and shows only the first
		// two parts, so a second blank silently truncates the sentence.
		if strings.Count(a.PromptRu, "___") != 1 {
			return fmt.Errorf("fill_blank requires promptRu with exactly one ___")
		}
		if strings.TrimSpace(a.CorrectAnswer) == "" {
			return fmt.Errorf("fill_blank requires correctAnswer")
		}
	case "word_scramble":
		if strings.TrimSpace(a.PromptEn) == "" || strings.TrimSpace(a.Answer) == "" {
			return fmt.Errorf("word_scramble requires promptEn and answer")
		}
	case "sentence_builder":
		if strings.TrimSpace(a.PromptEn) == "" {
			return fmt.Errorf("sentence_builder requires promptEn")
		}
		if len(a.CorrectOrder) < 2 || len(a.CorrectOrder) > 30 {
			return fmt.Errorf("sentence_builder requires 2–30 words in correctOrder")
		}
		for _, w := range a.CorrectOrder {
			if strings.TrimSpace(w) == "" {
				return fmt.Errorf("sentence words must be non-empty")
			}
		}
		if len(a.DistractorTokens) > 15 {
			return fmt.Errorf("at most 15 distractor tokens")
		}
		for _, w := range a.DistractorTokens {
			if strings.TrimSpace(w) == "" {
				return fmt.Errorf("distractor tokens must be non-empty")
			}
		}
		if !fieldLenOK(a.TranslationEn) || !fieldLenOK(a.CorrectOrder...) || !fieldLenOK(a.DistractorTokens...) {
			return fmt.Errorf("a field exceeds %d characters", maxFieldLen)
		}
	case "listening":
		if strings.TrimSpace(a.PromptEn) == "" || strings.TrimSpace(a.TextRu) == "" || strings.TrimSpace(a.CorrectAnswer) == "" {
			return fmt.Errorf("listening requires promptEn, textRu and correctAnswer")
		}
		if len(a.Distractors) < 1 || len(a.Distractors) > maxDistractors {
			return fmt.Errorf("listening requires 1–%d distractors", maxDistractors)
		}
		if !fieldLenOK(a.TextRu) || !fieldLenOK(a.Distractors...) {
			return fmt.Errorf("a field exceeds %d characters", maxFieldLen)
		}
		correct := strings.TrimSpace(a.CorrectAnswer)
		seen := map[string]bool{}
		for _, d := range a.Distractors {
			dt := strings.TrimSpace(d)
			if dt == "" || dt == correct || seen[dt] {
				return fmt.Errorf("distractors must be non-empty, unique and differ from the answer")
			}
			seen[dt] = true
		}
	case "memory_match":
		if len(a.Pairs) < 2 || len(a.Pairs) > 10 {
			return fmt.Errorf("memory_match requires 2–10 pairs")
		}
		rus, ens := map[string]bool{}, map[string]bool{}
		for _, p := range a.Pairs {
			ru, en := strings.TrimSpace(p.Ru), strings.TrimSpace(p.En)
			if ru == "" || en == "" {
				return fmt.Errorf("memory pairs must be non-empty")
			}
			if !fieldLenOK(ru, en) {
				return fmt.Errorf("a pair exceeds %d characters", maxFieldLen)
			}
			// Duplicate texts make two visually identical cards from different
			// pairs — the game turns into an unfair guess.
			if rus[ru] || ens[en] {
				return fmt.Errorf("memory pairs must have unique values")
			}
			rus[ru], ens[en] = true, true
		}
	case "drag_endings":
		if strings.TrimSpace(a.PromptEn) == "" || strings.TrimSpace(a.TemplateRu) == "" {
			return fmt.Errorf("drag_endings requires promptEn and templateRu")
		}
		if len(a.Slots) < 1 || len(a.Slots) > 8 {
			return fmt.Errorf("drag_endings requires 1–8 slots")
		}
		if len(a.EndingBank) < 1 || len(a.EndingBank) > 16 {
			return fmt.Errorf("drag_endings requires 1–16 bank endings")
		}
		if !fieldLenOK(a.TemplateRu) || !fieldLenOK(a.EndingBank...) {
			return fmt.Errorf("a field exceeds %d characters", maxFieldLen)
		}
		bank := map[string]bool{}
		for _, e := range a.EndingBank {
			if strings.TrimSpace(e) == "" {
				return fmt.Errorf("bank endings must be non-empty")
			}
			bank[e] = true
		}
		for i, sl := range a.Slots {
			if strings.TrimSpace(sl.Stem) == "" || strings.TrimSpace(sl.Correct) == "" {
				return fmt.Errorf("slot %d needs a stem and a correct ending", i+1)
			}
			if !fieldLenOK(sl.Stem, sl.Correct) {
				return fmt.Errorf("a slot exceeds %d characters", maxFieldLen)
			}
			// The correct ending must be draggable from the bank, and the template
			// must actually reference the slot — otherwise the exercise is unwinnable
			// or renders with orphaned slots.
			if !bank[sl.Correct] {
				return fmt.Errorf("slot %d's correct ending %q must be in the bank", i+1, sl.Correct)
			}
			if !strings.Contains(a.TemplateRu, fmt.Sprintf("{%d}", i)) {
				return fmt.Errorf("templateRu must contain {%d} for slot %d", i, i+1)
			}
		}
	case "free_response":
		if strings.TrimSpace(a.PromptEn) == "" || strings.TrimSpace(a.ModelAnswerRu) == "" {
			return fmt.Errorf("free_response requires promptEn and modelAnswerRu")
		}
		if len(a.RubricEn) < 1 || len(a.RubricEn) > 8 {
			return fmt.Errorf("free_response requires 1–8 rubric points")
		}
		for _, rb := range a.RubricEn {
			if strings.TrimSpace(rb) == "" {
				return fmt.Errorf("rubric points must be non-empty")
			}
		}
		if !fieldLenOK(a.ModelAnswerRu) || !fieldLenOK(a.RubricEn...) {
			return fmt.Errorf("a field exceeds %d characters", maxFieldLen)
		}
		if a.ResponseMode != "" && a.ResponseMode != "writing" && a.ResponseMode != "speaking" {
			return fmt.Errorf("responseMode must be writing or speaking")
		}
	case "dialogue":
		if len(a.DialogueLines) < 2 || len(a.DialogueLines) > 20 {
			return fmt.Errorf("dialogue requires 2–20 lines")
		}
		for i, l := range a.DialogueLines {
			if strings.TrimSpace(l.Speaker) == "" || strings.TrimSpace(l.TextRu) == "" || strings.TrimSpace(l.TextEn) == "" {
				return fmt.Errorf("dialogue line %d needs speaker, textRu and textEn", i+1)
			}
			if !fieldLenOK(l.Speaker, l.TextRu, l.TextEn) {
				return fmt.Errorf("a dialogue line exceeds %d characters", maxFieldLen)
			}
		}
	case "matching":
		if len(a.MatchPairs) < 2 || len(a.MatchPairs) > maxMatchPairs {
			return fmt.Errorf("matching requires 2–%d pairs", maxMatchPairs)
		}
		// The component keys pairs by string value in BOTH directions, so any
		// duplicate left or right makes the exercise unwinnable (buttons lock and
		// "all matched" can never be reached).
		lefts, rights := map[string]bool{}, map[string]bool{}
		for _, p := range a.MatchPairs {
			l, rr := strings.TrimSpace(p.Left), strings.TrimSpace(p.Right)
			if l == "" || rr == "" {
				return fmt.Errorf("matching pairs must be non-empty")
			}
			if !fieldLenOK(l, rr) {
				return fmt.Errorf("a pair exceeds %d characters", maxFieldLen)
			}
			if lefts[l] || rights[rr] {
				return fmt.Errorf("matching pairs must have unique left and right values")
			}
			lefts[l], rights[rr] = true, true
		}
	default:
		return fmt.Errorf("unsupported exercise type %q", exerciseType)
	}
	return nil
}

// validateContent validates atomic types directly and 'composite' as an ordered
// list of typed atomic steps — the combinatorial builder.
func validateContent(exerciseType string, data json.RawMessage) error {
	if len(data) == 0 {
		return fmt.Errorf("contentData is required")
	}
	if len(data) > maxContentBytes {
		return fmt.Errorf("contentData exceeds %d bytes", maxContentBytes)
	}
	if exerciseType != "composite" {
		return validateAtomic(exerciseType, data)
	}
	var c struct {
		Steps []struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		} `json:"steps"`
	}
	if err := json.Unmarshal(data, &c); err != nil {
		return fmt.Errorf("composite contentData must be {steps: [...]}")
	}
	if len(c.Steps) < 1 || len(c.Steps) > maxCompositeSteps {
		return fmt.Errorf("composite requires 1–%d steps", maxCompositeSteps)
	}
	for i, s := range c.Steps {
		if s.Type == "composite" {
			return fmt.Errorf("step %d: composites cannot nest", i+1)
		}
		if err := validateAtomic(s.Type, s.Data); err != nil {
			return fmt.Errorf("step %d: %v", i+1, err)
		}
	}
	return nil
}

var validContentCEFR = map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true, "C2": true}

func (h *TeacherHandler) parseContentRequest(w http.ResponseWriter, r *http.Request) (*contentRequest, bool) {
	var req contentRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxContentBytes*2)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return nil, false
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || utf8.RuneCountInString(req.Title) > maxTitleLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("title is required (max %d chars)", maxTitleLen)})
		return nil, false
	}
	if req.CEFRLevel == "" {
		req.CEFRLevel = "A1"
	}
	if !validContentCEFR[req.CEFRLevel] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid cefrLevel"})
		return nil, false
	}
	if utf8.RuneCountInString(req.Topic) > maxTopicLen {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "topic too long"})
		return nil, false
	}
	if len(req.TargetSkills) > maxTargetSkills {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "too many target skills"})
		return nil, false
	}
	for _, sk := range req.TargetSkills {
		if utf8.RuneCountInString(sk) > maxSkillIDLen {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid skill id"})
			return nil, false
		}
	}
	if err := validateContent(req.ExerciseType, req.ContentData); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return nil, false
	}
	return &req, true
}

// CreateContent — POST /teacher/content
func (h *TeacherHandler) CreateContent(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	req, ok := h.parseContentRequest(w, r)
	if !ok {
		return
	}
	c, err := h.store.CreateContent(r.Context(), tid, req.Title, req.ExerciseType, req.ContentData, req.CEFRLevel, req.Topic, req.TargetSkills)
	if err != nil {
		if errors.Is(err, store.ErrContentQuota) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "content limit reached — delete unused materials first"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save content"})
		return
	}
	h.activity.Record(r.Context(), tid, store.ActContentCreated, c.Title)
	writeJSON(w, http.StatusCreated, c)
}

// ListContent — GET /teacher/content
func (h *TeacherHandler) ListContent(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	items, err := h.store.ListContentByAuthor(r.Context(), tid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list content"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// UpdateContent — PATCH /teacher/content/{id}
func (h *TeacherHandler) UpdateContent(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	req, ok := h.parseContentRequest(w, r)
	if !ok {
		return
	}
	c, err := h.store.UpdateContent(r.Context(), tid, id, req.Title, req.ExerciseType, req.ContentData, req.CEFRLevel, req.Topic, req.TargetSkills)
	if err != nil {
		// Not found, not the author's, or not editable (submitted/approved).
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "content not found or not editable"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// DeleteContent — DELETE /teacher/content/{id}
func (h *TeacherHandler) DeleteContent(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if err := h.store.DeleteContent(r.Context(), tid, id); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "content not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// MyAssignmentContent — GET /me/assignments/{id}/content (LEARNER delivery):
// returns the attached materials only if the caller can see the assignment
// (cohort member + untargeted-or-targeted-at-them, enforced in the store query).
func (h *TeacherHandler) MyAssignmentContent(w http.ResponseWriter, r *http.Request) {
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
	items, err := h.store.ListAssignmentContentForLearner(r.Context(), lid, aid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load materials"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// GlobalContent — GET /content/global?level= : the APPROVED platform-wide pool.
func (h *TeacherHandler) GlobalContent(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListGlobalContent(r.Context(), r.URL.Query().Get("level"), 100)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load content"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// ---------------- Moderation (admin-gated routes) ----------------

// ListContentReviews — GET /admin/content/reviews (pending queue, oldest first).
func (h *TeacherHandler) ListContentReviews(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.ListPendingReviews(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to load queue"})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

type resolveReviewRequest struct {
	Approve  bool   `json:"approve"`
	Feedback string `json:"feedback"`
}

// ResolveContentReview — POST /admin/content/{id}/review {approve, feedback}.
func (h *TeacherHandler) ResolveContentReview(w http.ResponseWriter, r *http.Request) {
	reviewerID, ok := h.teacherID(r) // the authenticated admin's user id
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	contentID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid content id"})
		return
	}
	var req resolveReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}
	if len(req.Feedback) > 2000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "feedback too long"})
		return
	}
	if !req.Approve && strings.TrimSpace(req.Feedback) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "a rejection needs feedback for the author"})
		return
	}
	if err := h.store.ResolveContentReview(r.Context(), contentID, reviewerID, req.Approve, req.Feedback); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "content is not awaiting review"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// SubmitContent — POST /teacher/content/{id}/submit (draft → moderation queue)
func (h *TeacherHandler) SubmitContent(w http.ResponseWriter, r *http.Request) {
	tid, ok := h.teacherID(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	c, err := h.store.SubmitContent(r.Context(), tid, id)
	if err != nil {
		if errors.Is(err, store.ErrContentQuota) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many items awaiting review — wait for the moderator"})
			return
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "content not found or not a draft"})
		return
	}
	writeJSON(w, http.StatusOK, c)
}
