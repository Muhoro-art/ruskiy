package engine

import (
	"math"
	"sort"

	"github.com/russkiy/api/internal/model"
)

// HintLevel indicates the amount of scaffolding provided.
const (
	HintNone       = 0
	HintContextual = 1
	HintExplicit   = 2
)

// ComposedItem is a content selection placed in a session with role and position.
type ComposedItem struct {
	Content    ContentSelection
	Role       model.SessionItemRole
	Position   int
	HintLevel  int
	Difficulty float64
}

// ComposedSession is a fully structured session following the arc template.
type ComposedSession struct {
	Items        []ComposedItem
	TimeBudget   int // seconds
	TotalEstTime int // seconds
	Segment      model.LearnerSegment
}

// EngagementTypes are exercise types used for relief items.
var EngagementTypes = map[model.ExerciseType]bool{
	model.ExerciseMatching:    true,
	model.ExerciseOrdering:    true,
	model.ExerciseListening:   true,
	model.ExerciseReadingComp: true,
}

// ComposeSession arranges content selections into a structured session
// following the arc: warmup → ramp → core1 → relief → core2 → cooldown.
// It adapts the template based on segment and time budget.
func ComposeSession(selections []ContentSelection, budgetMinutes int, segment model.LearnerSegment) *ComposedSession {
	if len(selections) == 0 {
		return &ComposedSession{TimeBudget: budgetMinutes * 60, Segment: segment}
	}

	budgetSec := budgetMinutes * 60

	// Sort selections by difficulty for placement
	sorted := make([]ContentSelection, len(selections))
	copy(sorted, selections)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Content.Difficulty < sorted[j].Content.Difficulty
	})

	n := len(sorted)

	// Determine template based on segment and item count
	template := buildTemplate(n, segment, budgetMinutes)

	// Place selections into template slots
	items := placeItems(sorted, template)

	// Calculate total estimated time
	totalTime := 0
	for _, it := range items {
		et := it.Content.Content.EstimatedTime
		if et <= 0 {
			et = 30
		}
		totalTime += et
	}

	return &ComposedSession{
		Items:        items,
		TimeBudget:   budgetSec,
		TotalEstTime: totalTime,
		Segment:      segment,
	}
}

// templateSlot describes a position in the session arc.
type templateSlot struct {
	Role          model.SessionItemRole
	MaxDifficulty float64
	MinDifficulty float64
}

// buildTemplate creates the session arc template based on count and segment.
func buildTemplate(n int, segment model.LearnerSegment, budgetMinutes int) []templateSlot {
	// Short session mode (migrant, ≤5min or ≤8 items)
	if segment == model.SegmentMigrant || budgetMinutes <= 5 {
		return buildShortTemplate(n)
	}

	// Intensive session mode (uni_prep, ≥25min or ≥20 items)
	if (segment == model.SegmentUniPrep && budgetMinutes >= 25) || budgetMinutes >= 30 {
		return buildIntensiveTemplate(n)
	}

	// Standard session
	return buildStandardTemplate(n)
}

// buildShortTemplate: warmup(1) → core(compressed) → cooldown(1)
func buildShortTemplate(n int) []templateSlot {
	if n <= 2 {
		slots := make([]templateSlot, n)
		slots[0] = templateSlot{Role: model.RoleWarmup, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		if n == 2 {
			slots[1] = templateSlot{Role: model.RoleCooldown, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		}
		return slots
	}

	slots := make([]templateSlot, n)
	// Warmup: 1 item
	slots[0] = templateSlot{Role: model.RoleWarmup, MaxDifficulty: 0.3, MinDifficulty: 0.0}
	// Core: middle items (compressed but present)
	for i := 1; i < n-1; i++ {
		slots[i] = templateSlot{Role: model.RoleCore, MaxDifficulty: 0.8, MinDifficulty: 0.3}
	}
	// Cooldown: 1 item
	slots[n-1] = templateSlot{Role: model.RoleCooldown, MaxDifficulty: 0.3, MinDifficulty: 0.0}
	return slots
}

// buildIntensiveTemplate: warmup(2) → ramp(2) → core1(5-7) → relief(1) → core2(5-7) → relief(1) → challenge(1) → cooldown(1)
func buildIntensiveTemplate(n int) []templateSlot {
	slots := make([]templateSlot, n)

	if n <= 5 {
		return buildStandardTemplate(n)
	}

	idx := 0
	// Warmup: 2 items
	warmupCount := 2
	if warmupCount > n {
		warmupCount = n
	}
	for i := 0; i < warmupCount && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleWarmup, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		idx++
	}

	// Ramp: 2 items
	rampCount := 2
	for i := 0; i < rampCount && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleRamp, MaxDifficulty: 0.6, MinDifficulty: 0.3}
		idx++
	}

	// Calculate remaining slots for core1 + relief + core2 + relief + challenge + cooldown
	remaining := n - idx
	if remaining <= 0 {
		return slots[:idx]
	}

	// Reserve: 2 relief + 1 challenge + 1 cooldown = 4 special items
	specialCount := 4
	if remaining < specialCount+2 {
		specialCount = 2 // just 1 relief + 1 cooldown
	}
	coreTotal := remaining - specialCount
	if coreTotal < 2 {
		coreTotal = 2
	}
	core1Count := coreTotal / 2
	core2Count := coreTotal - core1Count

	// Core block 1
	for i := 0; i < core1Count && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleCore, MaxDifficulty: 0.8, MinDifficulty: 0.3}
		idx++
	}

	// Relief 1
	if idx < n-1 {
		slots[idx] = templateSlot{Role: model.RoleRelief, MaxDifficulty: 0.4, MinDifficulty: 0.0}
		idx++
	}

	// Core block 2
	for i := 0; i < core2Count && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleCore, MaxDifficulty: 0.8, MinDifficulty: 0.3}
		idx++
	}

	// Relief 2 (intensive has 2 relief items)
	if specialCount >= 4 && idx < n-2 {
		slots[idx] = templateSlot{Role: model.RoleRelief, MaxDifficulty: 0.4, MinDifficulty: 0.0}
		idx++
	}

	// Challenge (boss battle)
	if specialCount >= 3 && idx < n-1 {
		slots[idx] = templateSlot{Role: model.RoleChallenge, MaxDifficulty: 1.0, MinDifficulty: 0.7}
		idx++
	}

	// Cooldown
	if idx < n {
		slots[idx] = templateSlot{Role: model.RoleCooldown, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		idx++
	}

	return slots[:idx]
}

// buildStandardTemplate: warmup(2-3) → ramp(1-2) → core1(3-5) → relief(1) → core2(3-5) → cooldown(1)
func buildStandardTemplate(n int) []templateSlot {
	slots := make([]templateSlot, n)

	if n <= 3 {
		slots[0] = templateSlot{Role: model.RoleWarmup, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		for i := 1; i < n-1; i++ {
			slots[i] = templateSlot{Role: model.RoleCore, MaxDifficulty: 0.8, MinDifficulty: 0.3}
		}
		if n > 1 {
			slots[n-1] = templateSlot{Role: model.RoleCooldown, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		}
		return slots
	}

	idx := 0

	// Warmup: 2-3 items
	warmupCount := 2
	if n >= 15 {
		warmupCount = 3
	}
	for i := 0; i < warmupCount && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleWarmup, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		idx++
	}

	// Ramp: 1-2 items
	rampCount := 1
	if n >= 12 {
		rampCount = 2
	}
	for i := 0; i < rampCount && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleRamp, MaxDifficulty: 0.6, MinDifficulty: 0.3}
		idx++
	}

	// Calculate remaining for core + relief + cooldown
	remaining := n - idx
	// Reserve: 1 relief + 1 cooldown = 2
	coreTotal := remaining - 2
	if coreTotal < 2 {
		coreTotal = remaining - 1
		if coreTotal < 1 {
			coreTotal = 1
		}
	}

	// Split core into two blocks around relief
	core1Count := coreTotal / 2
	if core1Count < 1 {
		core1Count = 1
	}
	core2Count := coreTotal - core1Count

	// Core block 1
	for i := 0; i < core1Count && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleCore, MaxDifficulty: 0.8, MinDifficulty: 0.3}
		idx++
	}

	// Relief
	if idx < n-1 && remaining > 2 {
		slots[idx] = templateSlot{Role: model.RoleRelief, MaxDifficulty: 0.4, MinDifficulty: 0.0}
		idx++
	}

	// Core block 2
	for i := 0; i < core2Count && idx < n; i++ {
		slots[idx] = templateSlot{Role: model.RoleCore, MaxDifficulty: 0.8, MinDifficulty: 0.3}
		idx++
	}

	// Cooldown
	if idx < n {
		slots[idx] = templateSlot{Role: model.RoleCooldown, MaxDifficulty: 0.3, MinDifficulty: 0.0}
		idx++
	}

	return slots[:idx]
}

// placeItems assigns content selections to template slots based on difficulty.
func placeItems(sortedByDifficulty []ContentSelection, template []templateSlot) []ComposedItem {
	n := len(template)
	if n == 0 {
		return nil
	}

	// Build pools by difficulty range
	var easy, medium, hard, veryHard []ContentSelection
	for _, s := range sortedByDifficulty {
		d := s.Content.Difficulty
		switch {
		case d < 0.3:
			easy = append(easy, s)
		case d < 0.6:
			medium = append(medium, s)
		case d < 0.8:
			hard = append(hard, s)
		default:
			veryHard = append(veryHard, s)
		}
	}

	items := make([]ComposedItem, n)
	used := make(map[int]bool) // index in sortedByDifficulty

	// First pass: place items matching role difficulty
	for i, slot := range template {
		var pool *[]ContentSelection
		switch slot.Role {
		case model.RoleWarmup, model.RoleCooldown:
			pool = &easy
		case model.RoleRamp, model.RoleRelief:
			pool = &medium
			if len(medium) == 0 {
				pool = &easy
			}
		case model.RoleCore:
			pool = &hard
			if len(hard) == 0 {
				pool = &medium
			}
		case model.RoleChallenge:
			pool = &veryHard
			if len(veryHard) == 0 {
				pool = &hard
			}
		}

		picked := false
		if pool != nil && len(*pool) > 0 {
			sel := (*pool)[0]
			*pool = (*pool)[1:]
			items[i] = ComposedItem{
				Content:    sel,
				Role:       slot.Role,
				Position:   i,
				HintLevel:  HintNone,
				Difficulty: sel.Content.Difficulty,
			}
			picked = true
			// Mark as used
			for j, s := range sortedByDifficulty {
				if s.Content.ID == sel.Content.ID && !used[j] {
					used[j] = true
					break
				}
			}
		}
		if !picked {
			items[i] = ComposedItem{
				Role:     slot.Role,
				Position: i,
			}
		}
	}

	// Second pass: fill any empty slots with remaining items
	remaining := make([]ContentSelection, 0)
	for j, s := range sortedByDifficulty {
		if !used[j] {
			remaining = append(remaining, s)
		}
	}

	remIdx := 0
	for i := range items {
		if items[i].Content.Content.ID.String() == "00000000-0000-0000-0000-000000000000" && remIdx < len(remaining) {
			items[i].Content = remaining[remIdx]
			items[i].Difficulty = remaining[remIdx].Content.Difficulty
			remIdx++
		}
	}

	return items
}

// AdaptationResult describes the outcome of mid-session adaptation.
type AdaptationResult struct {
	Adapted       bool
	ReplacedIndex int
	Reason        string
}

// EvaluateAdaptation checks recent results and adapts the remaining session.
// It handles two scenarios:
// 1. Struggling learner: 3+ consecutive wrong → swap in easier content + hints
// 2. Coasting learner: 5+ consecutive correct in < 50% est. time → swap in harder content
func EvaluateAdaptation(
	session *ComposedSession,
	results []ExerciseAttempt,
	currentIndex int,
	contentPool []ContentSelection,
) *AdaptationResult {
	if len(results) == 0 || currentIndex >= len(session.Items)-1 {
		return &AdaptationResult{Adapted: false}
	}

	// Check for struggling pattern: 3+ consecutive incorrect
	if isStruggling(results) {
		return adaptForStruggling(session, results, currentIndex, contentPool)
	}

	// Check for coasting pattern: 5+ consecutive correct in fast time
	if isCoasting(results) {
		return adaptForCoasting(session, currentIndex, contentPool)
	}

	return &AdaptationResult{Adapted: false}
}

// ExerciseAttempt records a learner's attempt at an exercise.
type ExerciseAttempt struct {
	ContentID      string
	SkillID        string
	IsCorrect      bool
	ResponseTimeMs int
	EstimatedTimeS int // how long the exercise was expected to take
}

// isStruggling returns true if the last 3+ attempts are all incorrect.
func isStruggling(results []ExerciseAttempt) bool {
	if len(results) < 3 {
		return false
	}
	for i := len(results) - 3; i < len(results); i++ {
		if results[i].IsCorrect {
			return false
		}
	}
	return true
}

// isCoasting returns true if the last 5+ attempts are all correct
// and each was completed in < 50% of estimated time.
func isCoasting(results []ExerciseAttempt) bool {
	if len(results) < 5 {
		return false
	}
	for i := len(results) - 5; i < len(results); i++ {
		if !results[i].IsCorrect {
			return false
		}
		estMs := results[i].EstimatedTimeS * 1000
		if estMs > 0 && results[i].ResponseTimeMs >= estMs/2 {
			return false
		}
	}
	return true
}

// adaptForStruggling replaces the next item with an easier variant
// targeting the same skill, and sets contextual hints.
func adaptForStruggling(
	session *ComposedSession,
	results []ExerciseAttempt,
	currentIndex int,
	contentPool []ContentSelection,
) *AdaptationResult {
	nextIdx := currentIndex + 1
	if nextIdx >= len(session.Items) {
		return &AdaptationResult{Adapted: false}
	}

	// Find the struggling skill (from the last wrong answer)
	strugglingSkill := results[len(results)-1].SkillID
	currentDiff := session.Items[nextIdx].Difficulty

	// Find easier content for the same skill
	var bestMatch *ContentSelection
	for _, cs := range contentPool {
		if cs.Content.Difficulty < currentDiff && cs.Content.Difficulty < 0.4 {
			for _, sk := range cs.Content.TargetSkills {
				if sk == strugglingSkill {
					if bestMatch == nil || cs.Content.Difficulty > bestMatch.Content.Difficulty {
						cc := cs
						bestMatch = &cc
					}
					break
				}
			}
		}
	}

	if bestMatch == nil {
		// No easier variant found; just add hints to the existing item
		session.Items[nextIdx].HintLevel = HintContextual
		return &AdaptationResult{
			Adapted:       true,
			ReplacedIndex: nextIdx,
			Reason:        "hint_added_no_easier_variant",
		}
	}

	// Replace the item, preserving total count
	oldEst := session.Items[nextIdx].Content.Content.EstimatedTime
	if oldEst <= 0 {
		oldEst = 30
	}
	newEst := bestMatch.Content.EstimatedTime
	if newEst <= 0 {
		newEst = 30
	}

	session.Items[nextIdx] = ComposedItem{
		Content:    *bestMatch,
		Role:       session.Items[nextIdx].Role,
		Position:   nextIdx,
		HintLevel:  HintContextual,
		Difficulty: bestMatch.Content.Difficulty,
	}

	// Adjust total estimated time
	session.TotalEstTime += (newEst - oldEst)

	return &AdaptationResult{
		Adapted:       true,
		ReplacedIndex: nextIdx,
		Reason:        "easier_variant_with_hints",
	}
}

// adaptForCoasting replaces at least one upcoming item with a harder variant.
func adaptForCoasting(
	session *ComposedSession,
	currentIndex int,
	contentPool []ContentSelection,
) *AdaptationResult {
	replacedIdx := -1

	// Look for upcoming core/ramp items to make harder
	for i := currentIndex + 1; i < len(session.Items); i++ {
		role := session.Items[i].Role
		if role == model.RoleCooldown {
			continue // don't replace cooldown
		}

		origDiff := session.Items[i].Difficulty

		// Find harder content (difficulty > original + 0.15)
		var hardest *ContentSelection
		for _, cs := range contentPool {
			if cs.Content.Difficulty >= origDiff+0.15 {
				if hardest == nil || cs.Content.Difficulty > hardest.Content.Difficulty {
					cc := cs
					hardest = &cc
				}
			}
		}

		if hardest != nil {
			oldEst := session.Items[i].Content.Content.EstimatedTime
			if oldEst <= 0 {
				oldEst = 30
			}
			newEst := hardest.Content.EstimatedTime
			if newEst <= 0 {
				newEst = 30
			}

			session.Items[i] = ComposedItem{
				Content:    *hardest,
				Role:       session.Items[i].Role,
				Position:   i,
				HintLevel:  HintNone,
				Difficulty: hardest.Content.Difficulty,
			}
			session.TotalEstTime += (newEst - oldEst)
			replacedIdx = i
			break
		}
	}

	if replacedIdx < 0 {
		return &AdaptationResult{Adapted: false}
	}

	return &AdaptationResult{
		Adapted:       true,
		ReplacedIndex: replacedIdx,
		Reason:        "harder_variant_for_coasting",
	}
}

// EnforceTimeBudget trims the session if total time exceeds budget ±15%.
// It preferentially trims cooldown items first, then removes from end.
func EnforceTimeBudget(session *ComposedSession) {
	maxTime := int(float64(session.TimeBudget) * 1.15)

	for session.TotalEstTime > maxTime && len(session.Items) > 2 {
		// Try trimming cooldown duration first (replace with shorter item)
		lastIdx := len(session.Items) - 1
		if session.Items[lastIdx].Role == model.RoleCooldown {
			et := session.Items[lastIdx].Content.Content.EstimatedTime
			if et <= 0 {
				et = 30
			}
			if et > 15 {
				// Shorten cooldown to 15s
				diff := et - 15
				session.Items[lastIdx].Content.Content.EstimatedTime = 15
				session.TotalEstTime -= diff
				continue
			}
		}

		// Remove the last non-warmup item
		removeIdx := -1
		for i := lastIdx; i >= 1; i-- {
			if session.Items[i].Role != model.RoleWarmup {
				removeIdx = i
				break
			}
		}
		if removeIdx < 0 {
			break
		}

		et := session.Items[removeIdx].Content.Content.EstimatedTime
		if et <= 0 {
			et = 30
		}
		session.TotalEstTime -= et
		session.Items = append(session.Items[:removeIdx], session.Items[removeIdx+1:]...)

		// Re-index positions
		for i := range session.Items {
			session.Items[i].Position = i
		}
	}
}

// SessionTotalEstTime recalculates the total estimated time for a session.
func SessionTotalEstTime(session *ComposedSession) int {
	total := 0
	for _, it := range session.Items {
		et := it.Content.Content.EstimatedTime
		if et <= 0 {
			et = 30
		}
		total += et
	}
	return total
}

// reliefSpacing checks if relief items are evenly spaced.
func reliefSpacing(items []ComposedItem) (indices []int) {
	for i, it := range items {
		if it.Role == model.RoleRelief {
			indices = append(indices, i)
		}
	}
	return
}

// CountByRole counts items per role in the session.
func CountByRole(items []ComposedItem) map[model.SessionItemRole]int {
	counts := make(map[model.SessionItemRole]int)
	for _, it := range items {
		counts[it.Role]++
	}
	return counts
}

// challengeCount returns the number of challenge items.
func challengeCount(items []ComposedItem) int {
	count := 0
	for _, it := range items {
		if it.Role == model.RoleChallenge {
			count++
		}
	}
	return count
}

// adaptAndEnforceBudget runs an adaptation then ensures budget compliance.
func adaptAndEnforceBudget(
	session *ComposedSession,
	results []ExerciseAttempt,
	currentIndex int,
	contentPool []ContentSelection,
) *AdaptationResult {
	result := EvaluateAdaptation(session, results, currentIndex, contentPool)
	if result.Adapted {
		// Recalculate total time
		session.TotalEstTime = SessionTotalEstTime(session)
		// Enforce budget
		EnforceTimeBudget(session)
	}
	return result
}

// Unused import guard
var _ = math.Max
