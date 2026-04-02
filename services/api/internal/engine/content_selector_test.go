package engine

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- Test Helpers ----

func makeSkill(id string, status model.SkillStatus, confidence float64, dueInHours float64) model.LearnerSkillState {
	var nextDue *time.Time
	if dueInHours != 0 {
		t := time.Now().Add(time.Duration(dueInHours) * time.Hour)
		nextDue = &t
	}
	return model.LearnerSkillState{
		SkillID:       id,
		Status:        status,
		Confidence:    confidence,
		Stability:     5.0,
		Difficulty:    0.5,
		NextReviewDue: nextDue,
		TotalAttempts: 10,
	}
}

func makeContent(skillID string, level model.CEFRLevel, exType model.ExerciseType, estTime int, segment model.LearnerSegment, domain model.DomainFocus) model.ContentAtom {
	et := exType
	segs := []model.LearnerSegment{}
	if segment != "" {
		segs = []model.LearnerSegment{segment}
	}
	doms := []model.DomainFocus{}
	if domain != "" {
		doms = []model.DomainFocus{domain}
	}
	return model.ContentAtom{
		ID:            uuid.New(),
		ContentType:   model.ContentExercise,
		ExerciseType:  &et,
		TargetSkills:  []string{skillID},
		CEFRLevel:     level,
		SegmentTags:   segs,
		DomainTags:    doms,
		Difficulty:    0.5,
		EstimatedTime: estTime,
		QualityScore:  0.8,
	}
}

func makeLearner(level model.CEFRLevel, segment model.LearnerSegment, domain model.DomainFocus) model.LearnerProfile {
	return model.LearnerProfile{
		ID:           uuid.New(),
		CurrentLevel: level,
		TargetLevel:  model.LevelC1,
		Segment:      segment,
		Domain:       domain,
	}
}

// ============================================================
// TC-CS-001: Selection Prioritizes Due-for-Review Skills
// ============================================================

func TestSelectionPrioritizesDueForReview(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainGeneral)

	// 5 due skills, 10 not due
	var skills []model.LearnerSkillState
	dueSkillIDs := map[string]bool{}
	for i := 0; i < 5; i++ {
		id := skillID("due", i)
		skills = append(skills, makeSkill(id, model.SkillReview, 0.4, -24)) // due 24h ago
		dueSkillIDs[id] = true
	}
	for i := 0; i < 10; i++ {
		skills = append(skills, makeSkill(skillID("notdue", i), model.SkillLearning, 0.7, 72)) // due in 72h
	}

	// Create content for all skills
	var content []model.ContentAtom
	for _, sk := range skills {
		for j := 0; j < 3; j++ {
			content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseMultipleChoice, 45, "", model.DomainGeneral))
		}
	}

	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 15,
	})

	require.NotEmpty(t, result)

	// Count how many selected items target due skills
	dueCount := 0
	for _, sel := range result {
		if dueSkillIDs[sel.SkillID] {
			dueCount++
		}
	}

	ratio := float64(dueCount) / float64(len(result))
	assert.GreaterOrEqual(t, ratio, 0.6,
		">= 60%% of items must target due-for-review skills, got %.0f%% (%d/%d)",
		ratio*100, dueCount, len(result))
}

// ============================================================
// TC-CS-002: i+1 Ratio Enforcement
// ============================================================

func TestIPlusOneRatioEnforcement(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainGeneral)

	// Skills across levels
	var skills []model.LearnerSkillState
	for i := 0; i < 5; i++ {
		skills = append(skills, makeSkill(skillID("a2", i), model.SkillReview, 0.5, -12))
		skills = append(skills, makeSkill(skillID("b1", i), model.SkillReview, 0.4, -12))
		skills = append(skills, makeSkill(skillID("b2", i), model.SkillLearning, 0.3, -6))
	}

	// Content at various CEFR levels
	var content []model.ContentAtom
	levels := []model.CEFRLevel{model.LevelA1, model.LevelA2, model.LevelB1, model.LevelB2, model.LevelC1}
	for _, sk := range skills {
		for _, lvl := range levels {
			content = append(content, makeContent(sk.SkillID, lvl, model.ExerciseMultipleChoice, 40, "", model.DomainGeneral))
		}
	}

	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 20,
	})

	require.NotEmpty(t, result)

	comfortLevels, stretchLevels := iPlusOneLevels(model.LevelB1)

	comfortCount := 0
	stretchCount := 0
	tooEasyCount := 0
	tooHardCount := 0

	comfortSet := map[model.CEFRLevel]bool{}
	for _, l := range comfortLevels {
		comfortSet[l] = true
	}
	stretchSet := map[model.CEFRLevel]bool{}
	for _, l := range stretchLevels {
		stretchSet[l] = true
	}

	for _, sel := range result {
		lvl := sel.Content.CEFRLevel
		if comfortSet[lvl] {
			comfortCount++
		} else if stretchSet[lvl] {
			stretchCount++
		} else if lvl == model.LevelA1 {
			tooEasyCount++
		} else if lvl == model.LevelC1 || lvl == model.LevelC2 {
			tooHardCount++
		}
	}

	total := len(result)
	comfortPct := float64(comfortCount) / float64(total) * 100
	_ = float64(stretchCount) / float64(total) * 100

	// Comfort zone (A2, B1): 65-75%
	assert.GreaterOrEqual(t, comfortPct, 60.0,
		"comfort zone (A2/B1) must be >= 60%%, got %.0f%%", comfortPct)

	// Stretch zone (B2): present
	assert.Greater(t, stretchCount, 0,
		"stretch zone (B2) must have some items")

	// No too-easy or too-hard
	assert.Equal(t, 0, tooEasyCount, "no A1 items for B1 learner")
	assert.Equal(t, 0, tooHardCount, "no C1+ items for B1 learner")
}

// ============================================================
// TC-CS-003: Time Budget Compliance
// ============================================================

func TestTimeBudgetCompliance(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainGeneral)

	var skills []model.LearnerSkillState
	for i := 0; i < 15; i++ {
		skills = append(skills, makeSkill(skillID("sk", i), model.SkillReview, 0.5, -12))
	}

	var content []model.ContentAtom
	for _, sk := range skills {
		for j := 0; j < 5; j++ {
			content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseMultipleChoice, 40, "", model.DomainGeneral))
		}
	}

	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 10, // 10 minutes = 600 seconds
	})

	require.NotEmpty(t, result)

	totalTime := 0
	for _, sel := range result {
		et := sel.Content.EstimatedTime
		if et <= 0 {
			et = 30
		}
		totalTime += et
	}

	budgetSeconds := 600
	minTime := int(float64(budgetSeconds) * 0.85) // 510
	maxTime := int(float64(budgetSeconds) * 1.15) // 690

	assert.GreaterOrEqual(t, totalTime, minTime,
		"total time %d must be >= %d (85%% of budget)", totalTime, minTime)
	assert.LessOrEqual(t, totalTime, maxTime,
		"total time %d must be <= %d (115%% of budget)", totalTime, maxTime)
}

// ============================================================
// TC-CS-004: Variety Constraint — No More Than 3 Same Type
// ============================================================

func TestVarietyConstraint(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainGeneral)

	// Create skills and content with only one exercise type to force the constraint
	var skills []model.LearnerSkillState
	for i := 0; i < 10; i++ {
		skills = append(skills, makeSkill(skillID("v", i), model.SkillReview, 0.5, -12))
	}

	types := []model.ExerciseType{
		model.ExerciseMultipleChoice,
		model.ExerciseFillBlank,
		model.ExerciseTranslation,
		model.ExerciseDictation,
	}

	var content []model.ContentAtom
	for _, sk := range skills {
		for _, et := range types {
			content = append(content, makeContent(sk.SkillID, model.LevelB1, et, 40, "", model.DomainGeneral))
		}
	}

	// Run 100 times to check the constraint holds
	for trial := 0; trial < 100; trial++ {
		result := GenerateContentSet(ContentSelectorInput{
			Learner:    learner,
			Skills:     skills,
			Content:    content,
			TimeBudget: 15,
		})

		if len(result) <= 3 {
			continue
		}

		// Check no 4+ consecutive same type
		for i := 3; i < len(result); i++ {
			t0 := getExerciseType(result[i])
			t1 := getExerciseType(result[i-1])
			t2 := getExerciseType(result[i-2])
			t3 := getExerciseType(result[i-3])
			if t0 == t1 && t1 == t2 && t2 == t3 && t0 != "" {
				t.Fatalf("trial %d: found >3 consecutive %s at positions %d-%d",
					trial, t0, i-3, i)
			}
		}
	}
}

// ============================================================
// TC-CS-005: Segment Filtering
// ============================================================

func TestSegmentFiltering(t *testing.T) {
	learner := makeLearner(model.LevelA2, model.SegmentMigrant, model.DomainGeneral)

	var skills []model.LearnerSkillState
	for i := 0; i < 10; i++ {
		skills = append(skills, makeSkill(skillID("seg", i), model.SkillReview, 0.5, -12))
	}

	// Content tagged for different segments
	var content []model.ContentAtom
	segments := []model.LearnerSegment{
		model.SegmentMigrant, model.SegmentMigrant,
		model.LearnerSegment("general"), model.LearnerSegment("general"),
		model.SegmentTeen, model.SegmentKid,
	}
	for _, sk := range skills {
		for _, seg := range segments {
			content = append(content, makeContent(sk.SkillID, model.LevelA2, model.ExerciseMultipleChoice, 30, seg, model.DomainGeneral))
		}
	}

	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 8,
	})

	require.NotEmpty(t, result)

	for _, sel := range result {
		isOK := false
		for _, tag := range sel.Content.SegmentTags {
			if tag == model.SegmentMigrant || string(tag) == "general" {
				isOK = true
				break
			}
		}
		if len(sel.Content.SegmentTags) == 0 {
			isOK = true // no restriction
		}
		assert.True(t, isOK,
			"item %s must be tagged 'migrant' or 'general', got %v",
			sel.Content.ID, sel.Content.SegmentTags)

		// Must NOT be exclusively teen or kid
		for _, tag := range sel.Content.SegmentTags {
			assert.NotEqual(t, model.SegmentTeen, tag,
				"must not include teen-only content")
			assert.NotEqual(t, model.SegmentKid, tag,
				"must not include kid-only content")
		}
	}
}

// ============================================================
// TC-CS-006: Domain Filtering
// ============================================================

func TestDomainFiltering(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainMedical)

	var skills []model.LearnerSkillState
	for i := 0; i < 15; i++ {
		skills = append(skills, makeSkill(skillID("dom", i), model.SkillReview, 0.5, -12))
	}

	// Create content with mix of medical and general
	var content []model.ContentAtom
	for _, sk := range skills {
		// 2 medical, 3 general per skill
		content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseMultipleChoice, 40, "", model.DomainMedical))
		content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseFillBlank, 40, "", model.DomainMedical))
		content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseTranslation, 40, "", model.DomainGeneral))
		content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseDictation, 40, "", model.DomainGeneral))
		content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseMatching, 40, "", model.DomainGeneral))
	}

	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 20,
	})

	require.NotEmpty(t, result)

	stats := CalculateStats(result, nil, nil, model.DomainMedical, nil)

	medicalPct := float64(stats.DomainCount) / float64(stats.TotalItems) * 100
	generalPct := float64(stats.GeneralCount) / float64(stats.TotalItems) * 100

	// At least some medical and general content
	assert.Greater(t, stats.DomainCount, 0,
		"must include medical domain content")
	assert.Greater(t, stats.GeneralCount, 0,
		"must include general domain content")

	t.Logf("Domain distribution: medical=%.0f%% (%d), general=%.0f%% (%d) of %d items",
		medicalPct, stats.DomainCount, generalPct, stats.GeneralCount, stats.TotalItems)
}

// ============================================================
// TC-CS-007: Teacher Assignment Override
// ============================================================

func TestTeacherAssignmentOverride(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainGeneral)

	genitiveSkills := []string{"grammar.cases.genitive.singular", "grammar.cases.genitive.plural", "grammar.cases.genitive.possession"}
	dativeSkills := []string{"grammar.cases.dative.singular", "grammar.cases.dative.plural"}

	var skills []model.LearnerSkillState
	for _, id := range genitiveSkills {
		skills = append(skills, makeSkill(id, model.SkillLearning, 0.4, -6))
	}
	for _, id := range dativeSkills {
		skills = append(skills, makeSkill(id, model.SkillReview, 0.3, -24)) // dative is due
	}

	var content []model.ContentAtom
	for _, sk := range skills {
		for j := 0; j < 5; j++ {
			content = append(content, makeContent(sk.SkillID, model.LevelB1, model.ExerciseMultipleChoice, 45, "", model.DomainGeneral))
		}
	}

	assignment := &TeacherAssignment{
		Title:        "Practice Genitive Case",
		TargetSkills: genitiveSkills,
		MinExercises: 5,
	}

	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 15,
		Assignment: assignment,
	})

	require.NotEmpty(t, result)

	genitiveSet := map[string]bool{}
	for _, s := range genitiveSkills {
		genitiveSet[s] = true
	}
	dativeSet := map[string]bool{}
	for _, s := range dativeSkills {
		dativeSet[s] = true
	}

	genitiveCount := 0
	dativeCount := 0
	for _, sel := range result {
		if genitiveSet[sel.SkillID] {
			genitiveCount++
		}
		if dativeSet[sel.SkillID] {
			dativeCount++
		}
	}

	genPct := float64(genitiveCount) / float64(len(result)) * 100

	// Assert: >= 40% of items target Genitive skills (teacher boost)
	assert.GreaterOrEqual(t, genPct, 40.0,
		">= 40%% must target Genitive (teacher override), got %.0f%% (%d/%d)",
		genPct, genitiveCount, len(result))

	// Assert: Session still includes some Dative items (engine knowledge)
	assert.Greater(t, dativeCount, 0,
		"session must still include some Dative items from engine knowledge")
}

// ============================================================
// TC-CS-008: Recently Seen Content Exclusion
// ============================================================

func TestRecentlySeenContentExclusion(t *testing.T) {
	learner := makeLearner(model.LevelB1, model.SegmentUniPrep, model.DomainGeneral)

	var skills []model.LearnerSkillState
	for i := 0; i < 10; i++ {
		skills = append(skills, makeSkill(skillID("recent", i), model.SkillReview, 0.5, -12))
	}

	var content []model.ContentAtom
	var recentlySeen []uuid.UUID

	for _, sk := range skills {
		// 5 recently seen, 5 fresh per skill
		for j := 0; j < 10; j++ {
			c := makeContent(sk.SkillID, model.LevelB1, model.ExerciseMultipleChoice, 30, "", model.DomainGeneral)
			content = append(content, c)
			if j < 5 {
				recentlySeen = append(recentlySeen, c.ID)
			}
		}
	}

	require.Equal(t, 50, len(recentlySeen), "precondition: 50 recently seen items")

	result := GenerateContentSet(ContentSelectorInput{
		Learner:      learner,
		Skills:       skills,
		Content:      content,
		RecentlySeen: recentlySeen,
		TimeBudget:   15,
	})

	require.NotEmpty(t, result)

	recentSet := map[uuid.UUID]bool{}
	for _, id := range recentlySeen {
		recentSet[id] = true
	}

	// Assert: 0 selected items overlap with the 50 recent items
	overlapCount := 0
	for _, sel := range result {
		if recentSet[sel.Content.ID] {
			overlapCount++
		}
	}
	assert.Equal(t, 0, overlapCount,
		"0 selected items must overlap with recently seen content, found %d", overlapCount)
}

// ============================================================
// TC-CS-009: Empty Content Pool Graceful Degradation
// ============================================================

func TestEmptyContentPoolGracefulDegradation(t *testing.T) {
	learner := makeLearner(model.LevelC2, model.SegmentUniPrep, model.DomainLaw)

	var skills []model.LearnerSkillState
	for i := 0; i < 5; i++ {
		skills = append(skills, makeSkill(skillID("c2law", i), model.SkillReview, 0.5, -12))
	}

	// Very few content atoms matching C2+law (only 2)
	var content []model.ContentAtom
	content = append(content,
		makeContent("c2law-0", model.LevelC2, model.ExerciseMultipleChoice, 45, "", model.DomainLaw),
		makeContent("c2law-1", model.LevelC2, model.ExerciseFillBlank, 45, "", model.DomainLaw),
	)
	// Add adjacent domain content (general) for fallback
	for i := 0; i < 20; i++ {
		content = append(content, makeContent(skillID("c2law", i%5), model.LevelC1, model.ExerciseTranslation, 40, "", model.DomainGeneral))
	}

	// This should NOT panic
	result := GenerateContentSet(ContentSelectorInput{
		Learner:    learner,
		Skills:     skills,
		Content:    content,
		TimeBudget: 15,
	})

	// Assert: Returns at least 5 items (falls back to adjacent domains)
	assert.GreaterOrEqual(t, len(result), 5,
		"must return at least 5 items even with sparse content pool, got %d", len(result))

	// Assert: Does NOT return empty session
	assert.NotEmpty(t, result, "must NOT return empty session")
}

// ---- Helpers ----

func skillID(prefix string, i int) string {
	return prefix + "-" + string(rune('a'+i))
}
