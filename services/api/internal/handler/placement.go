package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/engine"
	"github.com/russkiy/api/internal/model"
	"github.com/russkiy/api/internal/store"
)

type PlacementHandler struct {
	skills   *store.SkillStore
	content  *store.ContentStore
	profiles *store.ProfileStore
}

func NewPlacementHandler(skills *store.SkillStore, content *store.ContentStore, profiles *store.ProfileStore) *PlacementHandler {
	return &PlacementHandler{
		skills:   skills,
		content:  content,
		profiles: profiles,
	}
}

// placementStage defines a logical group of questions at a specific difficulty.
// Each stage has skills to test and a minimum pass rate to advance to the next stage.
// This creates a natural ceiling: if you can't pass Stage 1 (letters), you never
// see Stage 2 (basic words). A true beginner answers 3-5 questions max instead of 15.
type placementStage struct {
	Name     string   // Human-readable stage name for logging
	Skills   []string // Skill IDs to test in this stage
	Level    string   // CEFR level for these questions
	MinPass  int      // Minimum correct answers to advance to next stage
	MaxItems int      // Maximum questions to pull from this stage
}

// GeneratePlacement creates an adaptive placement test that starts from the absolute basics.
//
// Design philosophy (from product design doc):
//   - A complete beginner cannot read Cyrillic. The first questions must NOT require reading.
//   - Stage 0: Letter recognition (visual — "What sound does Р make?")
//   - Stage 1: Basic words with transliteration ("Привет (pri-vyet) means...")
//   - Stage 2: Simple grammar if they passed Stage 1
//   - Stage 3+: Advanced grammar only if they clearly know the basics
//
// The frontend will receive items grouped by stage, so it can stop adaptively
// when the learner fails a stage (handled client-side for responsiveness).
func (h *PlacementHandler) GeneratePlacement(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LearnerID uuid.UUID `json:"learnerId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	ctx := r.Context()

	profile, err := h.profiles.GetByID(ctx, req.LearnerID)
	if err != nil || profile == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "learner profile not found"})
		return
	}

	// Placement stages — ordered from absolute zero to intermediate.
	// Each stage builds on the previous. The frontend stops advancing
	// when the learner fails a stage (< MinPass correct).
	stages := []placementStage{
		{
			Name:     "cyrillic_letters",
			Skills:   []string{"script.cyrillic.cognates"},
			Level:    "A1",
			MinPass:  2, // Must get at least 2/3 letter questions right to continue
			MaxItems: 3,
		},
		{
			Name:     "basic_words",
			Skills:   []string{"vocab.greetings", "vocab.numbers.1_20"},
			Level:    "A1",
			MinPass:  2, // Must recognize basic words to continue
			MaxItems: 3,
		},
		{
			Name:     "basic_grammar",
			Skills:   []string{"grammar.cases.nominative.singular", "grammar.verbs.present.first_conj"},
			Level:    "A1",
			MinPass:  1,
			MaxItems: 3,
		},
		{
			Name:     "elementary",
			Skills:   []string{"grammar.cases.accusative.inanimate", "grammar.cases.prepositional.location", "grammar.verbs.past"},
			Level:    "A1",
			MinPass:  2,
			MaxItems: 3,
		},
		{
			Name:     "pre_intermediate",
			Skills:   []string{"grammar.cases.genitive.singular", "grammar.verbs.aspect.intro", "phonetics.vowels.reduction"},
			Level:    "A2",
			MinPass:  2,
			MaxItems: 3,
		},
		{
			Name:     "intermediate",
			Skills:   []string{"grammar.cases.dative.singular", "grammar.cases.instrumental.singular", "grammar.verbs.aspect.usage"},
			Level:    "B1",
			MinPass:  2,
			MaxItems: 3,
		},
	}

	type PlacementItem struct {
		SkillID   string             `json:"skillId"`
		CEFRLevel string             `json:"cefrLevel"`
		Stage     string             `json:"stage"`
		StageIdx  int                `json:"stageIndex"`
		Content   *model.ContentAtom `json:"content"`
	}

	var allItems []PlacementItem
	stageMinPass := make([]int, 0, len(stages))

	for stageIdx, stage := range stages {
		var stageItems []PlacementItem

		for _, skillID := range stage.Skills {
			if len(stageItems) >= stage.MaxItems {
				break
			}

			atoms, err := h.content.GetBySkillsAny(ctx, []string{skillID}, stage.Level, 3)
			if err != nil || len(atoms) == 0 {
				atoms, err = h.content.GetBySkillsAny(ctx, []string{skillID}, "", 3)
				if err != nil || len(atoms) == 0 {
					continue
				}
			}

			// Pick best quality atom
			best := atoms[0]
			for _, a := range atoms[1:] {
				if a.QualityScore > best.QualityScore {
					best = a
				}
			}

			// For the first stage (letter recognition), prefer exercises that DON'T
			// require reading Russian words — prefer letter-to-sound matching
			if stageIdx == 0 && best.Difficulty > 0.35 && len(atoms) > 1 {
				for _, a := range atoms {
					if a.Difficulty <= 0.35 {
						best = a
						break
					}
				}
			}

			stageItems = append(stageItems, PlacementItem{
				SkillID:   skillID,
				CEFRLevel: stage.Level,
				Stage:     stage.Name,
				StageIdx:  stageIdx,
				Content:   &best,
			})
		}

		allItems = append(allItems, stageItems...)
		stageMinPass = append(stageMinPass, stage.MinPass)
	}

	log.Printf("[Placement] Generated %d items across %d stages for learner %s (segment=%s)",
		len(allItems), len(stages), req.LearnerID, profile.Segment)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"learnerId":    req.LearnerID,
		"items":        allItems,
		"total":        len(allItems),
		"stageMinPass": stageMinPass,
		"stages": []map[string]interface{}{
			{"name": "cyrillic_letters", "label": "Cyrillic Letters", "description": "Can you recognize Russian letters?"},
			{"name": "basic_words", "label": "Basic Words", "description": "Do you know any Russian words?"},
			{"name": "basic_grammar", "label": "Basic Grammar", "description": "Do you know basic Russian sentences?"},
			{"name": "elementary", "label": "Elementary", "description": "Can you use accusative and prepositional cases?"},
			{"name": "pre_intermediate", "label": "Pre-Intermediate", "description": "Can you use genitive case and verb aspect?"},
			{"name": "intermediate", "label": "Intermediate", "description": "Can you use dative and instrumental cases?"},
		},
	})
}

// SubmitPlacement processes placement test results, determines level,
// and updates the learner's profile + skill states accordingly.
func (h *PlacementHandler) SubmitPlacement(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LearnerID    uuid.UUID               `json:"learnerId"`
		Results      []model.SkillTestResult  `json:"results"`
		StoppedStage int                      `json:"stoppedStage"` // Which stage the learner stopped at (failed)
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	ctx := r.Context()

	// Determine level from results
	determinedLevel := engine.DeterminePlacementLevel(req.Results)

	// Also factor in which stage they stopped at for more accurate placement
	// If they couldn't pass stage 0 (letters), they're A1 regardless
	// If they passed stages 0-3 but failed stage 4, they're A2, etc.
	stageLevels := []model.CEFRLevel{
		model.LevelA1, // stage 0: letters
		model.LevelA1, // stage 1: basic words
		model.LevelA1, // stage 2: basic grammar
		model.LevelA2, // stage 3: elementary
		model.LevelA2, // stage 4: pre-intermediate (if passed → B1)
		model.LevelB1, // stage 5: intermediate (if passed → B1+)
	}

	// Use the stage-based level if it's more conservative (lower) than
	// the accuracy-based level — prevents over-placement
	if req.StoppedStage >= 0 && req.StoppedStage < len(stageLevels) {
		stageLevel := stageLevels[req.StoppedStage]
		if levelOrdinal(stageLevel) < levelOrdinal(determinedLevel) {
			determinedLevel = stageLevel
		}
	}

	log.Printf("[Placement] Learner %s: determined level %s (stopped at stage %d) from %d questions",
		req.LearnerID, determinedLevel, req.StoppedStage, len(req.Results))

	// Update profile with determined level
	profile, err := h.profiles.GetByID(ctx, req.LearnerID)
	if err != nil || profile == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "learner profile not found"})
		return
	}

	if err := h.profiles.UpdateLevel(ctx, req.LearnerID, string(determinedLevel)); err != nil {
		log.Printf("Error updating profile level: %v", err)
	}

	// Re-initialize skills for the determined level
	if err := h.skills.InitializeSkills(ctx, req.LearnerID, string(determinedLevel)); err != nil {
		log.Printf("Error re-initializing skills: %v", err)
	}

	// For skills they got correct, set initial confidence so prerequisites are "met"
	var unlockedSkills []string
	for _, result := range req.Results {
		if result.IsCorrect {
			existingSkill, err := h.skills.GetLearnerSkill(ctx, req.LearnerID, result.SkillID)
			if err == nil && existingSkill != nil {
				existingSkill.Confidence = 0.5
				existingSkill.Status = model.SkillLearning
				existingSkill.TotalAttempts = 1
				existingSkill.CorrectStreak = 1
				_ = h.skills.UpsertLearnerSkill(ctx, req.LearnerID, existingSkill)
				unlockedSkills = append(unlockedSkills, result.SkillID)
			}
		}
	}

	totalCorrect := 0
	for _, r := range req.Results {
		if r.IsCorrect {
			totalCorrect++
		}
	}

	result := model.PlacementResult{
		DeterminedLevel: determinedLevel,
		SkillResults:    req.Results,
		TotalCorrect:    totalCorrect,
		TotalQuestions:  len(req.Results),
		UnlockedSkills:  unlockedSkills,
	}

	writeJSON(w, http.StatusOK, result)
}

// levelOrdinal returns a numeric ordering for CEFR levels.
func levelOrdinal(level model.CEFRLevel) int {
	switch level {
	case model.LevelA1:
		return 1
	case model.LevelA2:
		return 2
	case model.LevelB1:
		return 3
	case model.LevelB2:
		return 4
	default:
		return 0
	}
}
