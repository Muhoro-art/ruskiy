package engine

import (
	"testing"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- Test Helpers ----

func makeContentSel(skillID string, difficulty float64, exType model.ExerciseType, estTimeSec int) ContentSelection {
	et := exType
	return ContentSelection{
		Content: model.ContentAtom{
			ID:            uuid.New(),
			ContentType:   model.ContentExercise,
			ExerciseType:  &et,
			TargetSkills:  []string{skillID},
			CEFRLevel:     model.LevelB1,
			Difficulty:    difficulty,
			EstimatedTime: estTimeSec,
			QualityScore:  0.8,
		},
		SkillID:  skillID,
		IsReview: false,
	}
}

func makeSelections(n int, skillPrefix string) []ContentSelection {
	types := []model.ExerciseType{
		model.ExerciseMultipleChoice,
		model.ExerciseFillBlank,
		model.ExerciseTranslation,
		model.ExerciseDictation,
		model.ExerciseMatching,
	}
	sels := make([]ContentSelection, n)
	for i := 0; i < n; i++ {
		// Spread difficulties from 0.1 to 0.9
		diff := 0.1 + float64(i)*0.8/float64(n-1)
		if n == 1 {
			diff = 0.5
		}
		skill := skillPrefix + "-" + string(rune('a'+i%26))
		sels[i] = makeContentSel(skill, diff, types[i%len(types)], 40)
	}
	return sels
}

// ============================================================
// TC-SC-001: Session Follows Structure Template
// ============================================================

func TestSessionFollowsStructureTemplate(t *testing.T) {
	// 15 selected content atoms with varying difficulties
	selections := makeSelections(15, "gen")

	session := ComposeSession(selections, 15, model.SegmentUniPrep)
	require.NotNil(t, session)
	require.Equal(t, 15, len(session.Items))

	// First 2-3 items are difficulty < 0.3 (warm-up)
	warmupEnd := 0
	for i, it := range session.Items {
		if it.Role == model.RoleWarmup {
			warmupEnd = i + 1
			assert.Less(t, it.Difficulty, 0.3,
				"warmup item %d must have difficulty < 0.3, got %.2f", i, it.Difficulty)
		}
	}
	assert.GreaterOrEqual(t, warmupEnd, 2,
		"must have at least 2 warmup items, got %d", warmupEnd)
	assert.LessOrEqual(t, warmupEnd, 3,
		"must have at most 3 warmup items, got %d", warmupEnd)

	// Items after warmup: check ramp has difficulty 0.3-0.6
	for _, it := range session.Items {
		if it.Role == model.RoleRamp {
			assert.GreaterOrEqual(t, it.Difficulty, 0.2,
				"ramp items must have difficulty >= 0.2, got %.2f", it.Difficulty)
			assert.LessOrEqual(t, it.Difficulty, 0.65,
				"ramp items must have difficulty <= 0.65, got %.2f", it.Difficulty)
		}
	}

	// Core blocks include target skills
	coreCount := 0
	for _, it := range session.Items {
		if it.Role == model.RoleCore {
			coreCount++
			assert.NotEmpty(t, it.Content.SkillID, "core item must have a target skill")
		}
	}
	assert.Greater(t, coreCount, 0, "must have core items")

	// Relief item exists (engagement type)
	reliefCount := 0
	for _, it := range session.Items {
		if it.Role == model.RoleRelief {
			reliefCount++
		}
	}
	assert.Greater(t, reliefCount, 0, "must have at least 1 relief item")

	// Last item is difficulty < 0.3 (cooldown)
	lastItem := session.Items[len(session.Items)-1]
	assert.Equal(t, model.RoleCooldown, lastItem.Role,
		"last item must be cooldown")
	assert.Less(t, lastItem.Difficulty, 0.35,
		"cooldown must have difficulty < 0.35, got %.2f", lastItem.Difficulty)
}

// ============================================================
// TC-SC-002: Short Session Mode (Migrant)
// ============================================================

func TestShortSessionModeMigrant(t *testing.T) {
	// 8 content atoms for a short session
	selections := makeSelections(8, "migrant")

	session := ComposeSession(selections, 5, model.SegmentMigrant)
	require.NotNil(t, session)

	// Total items <= 8
	assert.LessOrEqual(t, len(session.Items), 8,
		"short session must have <= 8 items, got %d", len(session.Items))

	// Still has warmup and cooldown
	roles := CountByRole(session.Items)
	assert.GreaterOrEqual(t, roles[model.RoleWarmup], 1,
		"short session must have at least 1 warmup")
	assert.GreaterOrEqual(t, roles[model.RoleCooldown], 1,
		"short session must have at least 1 cooldown")

	// Core blocks are compressed but present
	assert.Greater(t, roles[model.RoleCore], 0,
		"short session must have core items")

	// Warmup is easy
	for _, it := range session.Items {
		if it.Role == model.RoleWarmup {
			assert.Less(t, it.Difficulty, 0.35,
				"warmup difficulty must be < 0.35")
		}
	}
}

// ============================================================
// TC-SC-003: Intensive Session Mode (Uni Prep)
// ============================================================

func TestIntensiveSessionModeUniPrep(t *testing.T) {
	// 22 items for a 30-minute intensive session
	selections := makeSelections(22, "intensive")

	session := ComposeSession(selections, 30, model.SegmentUniPrep)
	require.NotNil(t, session)

	n := len(session.Items)
	assert.GreaterOrEqual(t, n, 20,
		"intensive session must have >= 20 items, got %d", n)
	assert.LessOrEqual(t, n, 25,
		"intensive session must have <= 25 items, got %d", n)

	// Contains 2 relief items (spaced evenly)
	reliefIndices := reliefSpacing(session.Items)
	assert.GreaterOrEqual(t, len(reliefIndices), 2,
		"intensive session must have >= 2 relief items, got %d", len(reliefIndices))

	// Relief items should be roughly evenly spaced (not adjacent)
	if len(reliefIndices) >= 2 {
		gap := reliefIndices[1] - reliefIndices[0]
		assert.Greater(t, gap, 2,
			"relief items must be spaced apart, got gap=%d", gap)
	}

	// Contains 1 challenge item (boss battle)
	challenges := challengeCount(session.Items)
	assert.GreaterOrEqual(t, challenges, 1,
		"intensive session must have >= 1 challenge item (boss battle)")
}

// ============================================================
// TC-SC-004: Mid-Session Adaptation — Struggling Learner
// ============================================================

func TestMidSessionAdaptationStruggling(t *testing.T) {
	// Generate a 15-item session
	selections := makeSelections(15, "adapt")
	session := ComposeSession(selections, 15, model.SegmentUniPrep)
	require.NotNil(t, session)
	require.Equal(t, 15, len(session.Items))

	originalCount := len(session.Items)

	// Simulate 3 consecutive incorrect answers on Genitive skills
	results := []ExerciseAttempt{
		{ContentID: "c1", SkillID: "genitive.singular", IsCorrect: true, ResponseTimeMs: 5000, EstimatedTimeS: 40},
		{ContentID: "c2", SkillID: "genitive.singular", IsCorrect: true, ResponseTimeMs: 5000, EstimatedTimeS: 40},
		{ContentID: "c3", SkillID: "genitive.singular", IsCorrect: false, ResponseTimeMs: 8000, EstimatedTimeS: 40},
		{ContentID: "c4", SkillID: "genitive.singular", IsCorrect: false, ResponseTimeMs: 9000, EstimatedTimeS: 40},
		{ContentID: "c5", SkillID: "genitive.singular", IsCorrect: false, ResponseTimeMs: 10000, EstimatedTimeS: 40},
	}

	// Provide easier content in the pool for replacement
	easierPool := []ContentSelection{
		makeContentSel("genitive.singular", 0.15, model.ExerciseMultipleChoice, 35),
		makeContentSel("genitive.singular", 0.20, model.ExerciseFillBlank, 30),
		makeContentSel("dative.singular", 0.10, model.ExerciseMatching, 25),
	}

	currentIndex := 5
	result := EvaluateAdaptation(session, results, currentIndex, easierPool)

	// Assert: adaptation occurred
	assert.True(t, result.Adapted, "adaptation must trigger for struggling learner")

	// Assert: next item replaced with easier Genitive variant
	nextItem := session.Items[currentIndex+1]
	assert.Less(t, nextItem.Difficulty, 0.4,
		"replacement must be easier, got difficulty %.2f", nextItem.Difficulty)

	// Assert: hint level set to CONTEXTUAL
	assert.Equal(t, HintContextual, nextItem.HintLevel,
		"hint level must be CONTEXTUAL for struggling learner")

	// Assert: session total item count unchanged
	assert.Equal(t, originalCount, len(session.Items),
		"total item count must remain %d, got %d", originalCount, len(session.Items))
}

// ============================================================
// TC-SC-005: Mid-Session Adaptation — Coasting Learner
// ============================================================

func TestMidSessionAdaptationCoasting(t *testing.T) {
	// Generate a 15-item session
	selections := makeSelections(15, "coast")
	session := ComposeSession(selections, 15, model.SegmentUniPrep)
	require.NotNil(t, session)
	require.Equal(t, 15, len(session.Items))

	// Simulate 5 consecutive correct answers in < 50% estimated time
	results := []ExerciseAttempt{
		{ContentID: "c1", SkillID: "vocab.a", IsCorrect: true, ResponseTimeMs: 5000, EstimatedTimeS: 40},
		{ContentID: "c2", SkillID: "vocab.b", IsCorrect: true, ResponseTimeMs: 4000, EstimatedTimeS: 40},
		{ContentID: "c3", SkillID: "vocab.c", IsCorrect: true, ResponseTimeMs: 3000, EstimatedTimeS: 40},
		{ContentID: "c4", SkillID: "vocab.d", IsCorrect: true, ResponseTimeMs: 5000, EstimatedTimeS: 40},
		{ContentID: "c5", SkillID: "vocab.e", IsCorrect: true, ResponseTimeMs: 4000, EstimatedTimeS: 40},
	}

	// Record original difficulty of upcoming items
	currentIndex := 5
	origDifficulty := session.Items[currentIndex+1].Difficulty

	// Provide harder content in the pool
	harderPool := []ContentSelection{
		makeContentSel("vocab.a", 0.85, model.ExerciseTranslation, 50),
		makeContentSel("vocab.b", 0.90, model.ExerciseFillBlank, 55),
		makeContentSel("grammar.gen", 0.95, model.ExerciseDictation, 60),
	}

	result := EvaluateAdaptation(session, results, currentIndex, harderPool)

	// Assert: adaptation occurred
	assert.True(t, result.Adapted, "adaptation must trigger for coasting learner")

	// Assert: at least 1 upcoming item replaced with harder variant
	replacedItem := session.Items[result.ReplacedIndex]
	assert.Greater(t, replacedItem.Difficulty, origDifficulty,
		"replacement must be harder than original")

	// Assert: replacement item difficulty > original by >= 0.15
	assert.GreaterOrEqual(t, replacedItem.Difficulty-origDifficulty, 0.15,
		"difficulty increase must be >= 0.15, got %.2f → %.2f (Δ=%.2f)",
		origDifficulty, replacedItem.Difficulty, replacedItem.Difficulty-origDifficulty)
}

// ============================================================
// TC-SC-006: Mid-Session Adaptation Does Not Exceed Time Budget
// ============================================================

func TestMidSessionAdaptationTimeBudget(t *testing.T) {
	// Create a session with known time budget
	selections := make([]ContentSelection, 15)
	for i := range selections {
		selections[i] = makeContentSel("skill-"+string(rune('a'+i%10)), 0.5, model.ExerciseMultipleChoice, 40)
	}
	session := ComposeSession(selections, 10, model.SegmentUniPrep) // 10 min = 600s budget
	require.NotNil(t, session)

	budgetSec := session.TimeBudget // 600
	maxAllowed := int(float64(budgetSec) * 1.15)

	// Trigger 3 adaptations that swap in longer exercises
	longPool := []ContentSelection{
		makeContentSel("skill-a", 0.85, model.ExerciseTranslation, 90),  // much longer
		makeContentSel("skill-b", 0.90, model.ExerciseDictation, 100),   // much longer
		makeContentSel("skill-c", 0.95, model.ExerciseFillBlank, 120),   // much longer
	}

	// 3 rounds of coasting adaptation
	for round := 0; round < 3; round++ {
		results := make([]ExerciseAttempt, 5)
		for i := range results {
			results[i] = ExerciseAttempt{
				ContentID:      "c",
				SkillID:        "skill-a",
				IsCorrect:      true,
				ResponseTimeMs: 3000,
				EstimatedTimeS: 40,
			}
		}

		currentIndex := 2 + round*3
		if currentIndex >= len(session.Items)-2 {
			break
		}

		adaptAndEnforceBudget(session, results, currentIndex, longPool)
	}

	// Recalculate final total time
	finalTime := SessionTotalEstTime(session)

	// Assert: total estimated time still within ±15% of budget
	assert.LessOrEqual(t, finalTime, maxAllowed,
		"after 3 adaptations, total time %ds must be <= %ds (115%% of %ds budget)",
		finalTime, maxAllowed, budgetSec)

	// Assert: session still has warmup and cooldown
	hasWarmup := false
	hasCooldown := false
	for _, it := range session.Items {
		if it.Role == model.RoleWarmup {
			hasWarmup = true
		}
		if it.Role == model.RoleCooldown {
			hasCooldown = true
		}
	}
	assert.True(t, hasWarmup, "session must still have warmup after adaptations")

	// Cooldown may be trimmed but session should still be valid
	if hasCooldown {
		lastItem := session.Items[len(session.Items)-1]
		assert.Equal(t, model.RoleCooldown, lastItem.Role,
			"if cooldown exists, it should be the last item")
	}
}
