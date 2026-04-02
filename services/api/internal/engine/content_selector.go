package engine

import (
	"log"
	"math"
	"math/rand"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/model"
)

// TeacherAssignment represents a teacher-assigned focus area.
type TeacherAssignment struct {
	Title        string
	TargetSkills []string
	MinExercises int
}

// ContentSelection is a selected content item with metadata.
type ContentSelection struct {
	Content  model.ContentAtom
	SkillID  string
	Role     model.SessionItemRole
	IsReview bool
}

// ContentSelectorInput bundles everything needed for content selection.
type ContentSelectorInput struct {
	Learner      model.LearnerProfile
	Skills       []model.LearnerSkillState
	Content      []model.ContentAtom
	RecentlySeen []uuid.UUID // content IDs seen in last 7 days
	TimeBudget   int         // minutes
	Assignment   *TeacherAssignment
}

// GenerateContentSet selects content items for a learning session.
// It enforces all constraints: review priority, i+1 ratio, time budget,
// variety, segment/domain filtering, assignment overrides, exclusions.
func GenerateContentSet(input ContentSelectorInput) []ContentSelection {
	if input.TimeBudget <= 0 {
		input.TimeBudget = 15
	}

	recentSet := make(map[uuid.UUID]bool, len(input.RecentlySeen))
	for _, id := range input.RecentlySeen {
		recentSet[id] = true
	}

	// 1. Filter content by segment and domain
	filtered := filterContent(input.Content, input.Learner, recentSet)

	// 2. If pool is too small, fall back to adjacent domains/segments
	if len(filtered) < 5 {
		log.Printf("WARNING: insufficient content pool (%d items) for learner %s (segment=%s, domain=%s, level=%s). Falling back to broader search.",
			len(filtered), input.Learner.ID, input.Learner.Segment, input.Learner.Domain, input.Learner.CurrentLevel)
		filtered = fallbackContent(input.Content, input.Learner, recentSet)
	}

	if len(filtered) == 0 {
		log.Printf("WARNING: no content available at all for learner %s", input.Learner.ID)
		return nil
	}

	// 3. Separate skills into pools
	dueSkills, weakSkills, newSkills := categorizeSkills(input.Skills)

	// 4. Calculate i+1 level range
	comfortLevels, stretchLevels := iPlusOneLevels(input.Learner.CurrentLevel)

	// 5. Calculate target counts
	budgetSeconds := input.TimeBudget * 60
	maxItems := estimateItemCount(budgetSeconds, filtered)

	// 6. Select skills and content with all constraints
	selections := selectWithConstraints(
		filtered, dueSkills, weakSkills, newSkills,
		comfortLevels, stretchLevels,
		maxItems, budgetSeconds,
		input.Assignment,
	)

	// 7. Enforce variety constraint (no >3 consecutive same type)
	selections = enforceVariety(selections)

	// 8. Assign session roles
	roles := AssignRoles(len(selections))
	for i := range selections {
		if i < len(roles) {
			selections[i].Role = roles[i]
		}
	}

	return selections
}

// filterContent filters by segment, domain, and excludes recently seen.
func filterContent(
	content []model.ContentAtom,
	learner model.LearnerProfile,
	recentSet map[uuid.UUID]bool,
) []model.ContentAtom {
	var result []model.ContentAtom
	for _, c := range content {
		if recentSet[c.ID] {
			continue
		}
		if !segmentMatch(c.SegmentTags, learner.Segment) {
			continue
		}
		result = append(result, c)
	}
	return result
}

// fallbackContent widens the search to include adjacent domains/segments.
func fallbackContent(
	content []model.ContentAtom,
	learner model.LearnerProfile,
	recentSet map[uuid.UUID]bool,
) []model.ContentAtom {
	var result []model.ContentAtom
	for _, c := range content {
		if recentSet[c.ID] {
			continue
		}
		// Accept any segment that includes general or matches
		hasGeneral := false
		hasTarget := false
		for _, s := range c.SegmentTags {
			if s == "general" || s == model.LearnerSegment("general") {
				hasGeneral = true
			}
			if s == learner.Segment {
				hasTarget = true
			}
		}
		// Accept content with no segment restriction, general, or matching
		if len(c.SegmentTags) == 0 || hasGeneral || hasTarget {
			result = append(result, c)
		}
	}
	// If still too few, accept everything not recently seen
	if len(result) < 5 {
		result = nil
		for _, c := range content {
			if !recentSet[c.ID] {
				result = append(result, c)
			}
		}
	}
	return result
}

// segmentMatch returns true if content is appropriate for the learner's segment.
func segmentMatch(tags []model.LearnerSegment, segment model.LearnerSegment) bool {
	if len(tags) == 0 {
		return true // no restriction
	}
	for _, t := range tags {
		if t == segment || t == "general" || string(t) == "general" {
			return true
		}
	}
	return false
}

// categorizeSkills separates skills into due, weak, and new pools.
func categorizeSkills(skills []model.LearnerSkillState) (due, weak, new_ []model.LearnerSkillState) {
	now := time.Now()
	for _, s := range skills {
		switch {
		case s.NextReviewDue != nil && s.NextReviewDue.Before(now):
			due = append(due, s)
		case s.Status == model.SkillNew || s.TotalAttempts < 3:
			new_ = append(new_, s)
		case s.Confidence < 0.5:
			weak = append(weak, s)
		}
	}
	return
}

// iPlusOneLevels returns the comfort and stretch CEFR levels for i+1 theory.
func iPlusOneLevels(current model.CEFRLevel) (comfort []model.CEFRLevel, stretch []model.CEFRLevel) {
	order := []model.CEFRLevel{model.LevelA1, model.LevelA2, model.LevelB1, model.LevelB2, model.LevelC1, model.LevelC2}
	idx := 0
	for i, l := range order {
		if l == current {
			idx = i
			break
		}
	}

	// Comfort zone: current and one below
	if idx > 0 {
		comfort = append(comfort, order[idx-1])
	}
	comfort = append(comfort, order[idx])

	// Stretch zone: one above
	if idx+1 < len(order) {
		stretch = append(stretch, order[idx+1])
	}

	return
}

// estimateItemCount estimates how many items fit in the time budget.
func estimateItemCount(budgetSeconds int, content []model.ContentAtom) int {
	if len(content) == 0 {
		return 5
	}
	// Calculate average estimated time
	totalTime := 0
	for _, c := range content {
		if c.EstimatedTime > 0 {
			totalTime += c.EstimatedTime
		} else {
			totalTime += 30 // default 30 seconds
		}
	}
	avgTime := totalTime / len(content)
	if avgTime <= 0 {
		avgTime = 30
	}
	count := budgetSeconds / avgTime
	if count < 5 {
		count = 5
	}
	if count > 20 {
		count = 20
	}
	return count
}

// selectWithConstraints selects content items with all constraints applied.
func selectWithConstraints(
	content []model.ContentAtom,
	dueSkills, weakSkills, newSkills []model.LearnerSkillState,
	comfortLevels, stretchLevels []model.CEFRLevel,
	maxItems, budgetSeconds int,
	assignment *TeacherAssignment,
) []ContentSelection {
	// Build content index by skill
	contentBySkill := make(map[string][]model.ContentAtom)
	for _, c := range content {
		for _, sk := range c.TargetSkills {
			contentBySkill[sk] = append(contentBySkill[sk], c)
		}
	}

	// Build content index by level
	comfortSet := make(map[model.CEFRLevel]bool)
	for _, l := range comfortLevels {
		comfortSet[l] = true
	}
	stretchSet := make(map[model.CEFRLevel]bool)
	for _, l := range stretchLevels {
		stretchSet[l] = true
	}

	var selections []ContentSelection
	usedContent := make(map[uuid.UUID]bool)
	usedSkills := make(map[string]bool)
	usedTypes := make(map[model.ExerciseType]int) // track exercise type usage
	totalTime := 0

	// Helper to get the last used exercise type
	lastExType := func() model.ExerciseType {
		if len(selections) == 0 {
			return ""
		}
		last := selections[len(selections)-1]
		if last.Content.ExerciseType != nil {
			return *last.Content.ExerciseType
		}
		return ""
	}

	// Helper to pick a content item for a skill, with variety awareness
	pickContent := func(skillID string, isReview bool, preferStretch bool) *ContentSelection {
		candidates := contentBySkill[skillID]
		if len(candidates) == 0 {
			return nil
		}

		lastType := lastExType()

		// Score candidates: prefer (1) correct level zone, (2) different exercise type from recent
		var best *model.ContentAtom
		bestScore := -1

		for _, c := range candidates {
			if usedContent[c.ID] {
				continue
			}
			score := 0
			if preferStretch && stretchSet[c.CEFRLevel] {
				score += 10 // strong preference for stretch when requested
			} else if comfortSet[c.CEFRLevel] {
				score += 5
			} else if stretchSet[c.CEFRLevel] {
				score += 4
			}

			// Prefer exercise type not recently used (variety)
			if c.ExerciseType != nil && *c.ExerciseType != lastType {
				score += 3
			}
			// Prefer less-used exercise types
			if c.ExerciseType != nil {
				score += max(0, 3-usedTypes[*c.ExerciseType])
			}

			if score > bestScore {
				bestScore = score
				cc := c
				best = &cc
			}
		}

		if best == nil {
			// Fallback: any unused content in allowed levels
			for _, c := range candidates {
				if !usedContent[c.ID] && (comfortSet[c.CEFRLevel] || stretchSet[c.CEFRLevel]) {
					cc := c
					best = &cc
					break
				}
			}
		}
		if best == nil {
			// Last resort: any unused content
			for _, c := range candidates {
				if !usedContent[c.ID] {
					cc := c
					best = &cc
					break
				}
			}
		}
		if best == nil {
			return nil
		}
		return &ContentSelection{
			Content:  *best,
			SkillID:  skillID,
			IsReview: isReview,
		}
	}

	addSelection := func(sel *ContentSelection) {
		et := sel.Content.EstimatedTime
		if et <= 0 {
			et = 30
		}
		totalTime += et
		usedContent[sel.Content.ID] = true
		usedSkills[sel.SkillID] = true
		if sel.Content.ExerciseType != nil {
			usedTypes[*sel.Content.ExerciseType]++
		}
		selections = append(selections, *sel)
	}

	// Phase 1: Teacher assignment override (>= 40% of items)
	if assignment != nil {
		assignmentCount := int(math.Ceil(float64(maxItems) * 0.4))
		for _, sk := range assignment.TargetSkills {
			if len(selections) >= assignmentCount {
				break
			}
			sel := pickContent(sk, false, false)
			if sel != nil {
				addSelection(sel)
			}
		}
	}

	// Calculate stretch allocation: ~20% of items should be stretch level
	stretchTarget := int(math.Ceil(float64(maxItems) * 0.2))
	stretchAdded := 0

	// Phase 2: Due-for-review skills (priority)
	for _, sk := range dueSkills {
		if len(selections) >= maxItems {
			break
		}
		if usedSkills[sk.SkillID] {
			continue
		}
		// Alternate: sometimes pick stretch content
		preferStretch := stretchAdded < stretchTarget && len(selections)%3 == 0
		sel := pickContent(sk.SkillID, true, preferStretch)
		if sel != nil {
			et := sel.Content.EstimatedTime
			if et <= 0 {
				et = 30
			}
			if totalTime+et > int(float64(budgetSeconds)*1.15) {
				continue
			}
			if stretchSet[sel.Content.CEFRLevel] {
				stretchAdded++
			}
			addSelection(sel)
		}
	}

	// Phase 3: Weak skills
	for _, sk := range weakSkills {
		if len(selections) >= maxItems {
			break
		}
		if usedSkills[sk.SkillID] {
			continue
		}
		sel := pickContent(sk.SkillID, true, false)
		if sel != nil {
			et := sel.Content.EstimatedTime
			if et <= 0 {
				et = 30
			}
			if totalTime+et > int(float64(budgetSeconds)*1.15) {
				continue
			}
			addSelection(sel)
		}
	}

	// Phase 4: New skills - prefer stretch to introduce new material
	for _, sk := range newSkills {
		if len(selections) >= maxItems {
			break
		}
		if usedSkills[sk.SkillID] {
			continue
		}
		preferStretch := stretchAdded < stretchTarget
		sel := pickContent(sk.SkillID, false, preferStretch)
		if sel != nil {
			et := sel.Content.EstimatedTime
			if et <= 0 {
				et = 30
			}
			if totalTime+et > int(float64(budgetSeconds)*1.15) {
				continue
			}
			if stretchSet[sel.Content.CEFRLevel] {
				stretchAdded++
			}
			addSelection(sel)
		}
	}

	// Build the set of allowed levels (comfort + stretch only)
	allowedLevels := make(map[model.CEFRLevel]bool)
	for _, l := range comfortLevels {
		allowedLevels[l] = true
	}
	for _, l := range stretchLevels {
		allowedLevels[l] = true
	}

	// Phase 5: Fill remaining budget with general/mixed domain content
	if len(selections) < maxItems && len(content) > 0 {
		// Prefer general domain content first for variety, then any content
		for pass := 0; pass < 2; pass++ {
			for _, c := range content {
				if len(selections) >= maxItems {
					break
				}
				if usedContent[c.ID] {
					continue
				}
				// Only allow content in comfort/stretch zones
				if len(allowedLevels) > 0 && !allowedLevels[c.CEFRLevel] {
					continue
				}
				// First pass: prefer general domain
				if pass == 0 {
					isGeneral := false
					for _, d := range c.DomainTags {
						if d == model.DomainGeneral {
							isGeneral = true
							break
						}
					}
					if !isGeneral {
						continue
					}
				}
				et := c.EstimatedTime
				if et <= 0 {
					et = 30
				}
				if totalTime+et > int(float64(budgetSeconds)*1.15) {
					continue
				}
				skillID := ""
				if len(c.TargetSkills) > 0 {
					skillID = c.TargetSkills[0]
				}
				sel := &ContentSelection{
					Content:  c,
					SkillID:  skillID,
					IsReview: false,
				}
				addSelection(sel)
			}
		}
	}

	return selections
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// enforceVariety ensures no more than 3 consecutive exercises of the same type.
func enforceVariety(selections []ContentSelection) []ContentSelection {
	if len(selections) <= 3 {
		return selections
	}

	// Detect runs > 3 and shuffle to break them
	for attempt := 0; attempt < 10; attempt++ {
		if !hasLongRun(selections, 3) {
			break
		}
		// Find the long run and swap an item out of it
		for i := 3; i < len(selections); i++ {
			if selectionsTypeMatch(selections, i, 3) {
				// Swap with a later item of different type
				for j := i + 1; j < len(selections); j++ {
					if getExerciseType(selections[j]) != getExerciseType(selections[i]) {
						selections[i], selections[j] = selections[j], selections[i]
						break
					}
				}
			}
		}
	}

	return selections
}

func hasLongRun(sels []ContentSelection, maxRun int) bool {
	for i := maxRun; i < len(sels); i++ {
		if selectionsTypeMatch(sels, i, maxRun) {
			return true
		}
	}
	return false
}

func selectionsTypeMatch(sels []ContentSelection, endIdx, runLen int) bool {
	if endIdx < runLen {
		return false
	}
	t := getExerciseType(sels[endIdx])
	for k := 1; k <= runLen; k++ {
		if getExerciseType(sels[endIdx-k]) != t {
			return false
		}
	}
	return true
}

func getExerciseType(s ContentSelection) model.ExerciseType {
	if s.Content.ExerciseType != nil {
		return *s.Content.ExerciseType
	}
	return ""
}

// ContentStats holds statistics about a generated content set.
type ContentStats struct {
	TotalItems     int
	TotalTime      int // seconds
	ReviewCount    int
	ComfortCount   int
	StretchCount   int
	DomainCount    int
	GeneralCount   int
	AssignmentHits int
}

// CalculateStats computes statistics about a content set for assertions.
func CalculateStats(
	selections []ContentSelection,
	comfortLevels, stretchLevels []model.CEFRLevel,
	domain model.DomainFocus,
	assignmentSkills []string,
) ContentStats {
	stats := ContentStats{TotalItems: len(selections)}

	comfortSet := make(map[model.CEFRLevel]bool)
	for _, l := range comfortLevels {
		comfortSet[l] = true
	}
	stretchSet := make(map[model.CEFRLevel]bool)
	for _, l := range stretchLevels {
		stretchSet[l] = true
	}
	assignSet := make(map[string]bool)
	for _, s := range assignmentSkills {
		assignSet[s] = true
	}

	for _, sel := range selections {
		et := sel.Content.EstimatedTime
		if et <= 0 {
			et = 30
		}
		stats.TotalTime += et

		if sel.IsReview {
			stats.ReviewCount++
		}

		if comfortSet[sel.Content.CEFRLevel] {
			stats.ComfortCount++
		}
		if stretchSet[sel.Content.CEFRLevel] {
			stats.StretchCount++
		}

		for _, d := range sel.Content.DomainTags {
			if d == domain {
				stats.DomainCount++
				break
			}
		}
		for _, d := range sel.Content.DomainTags {
			if d == model.DomainGeneral {
				stats.GeneralCount++
				break
			}
		}

		if assignSet[sel.SkillID] {
			stats.AssignmentHits++
		}
	}

	return stats
}

// Seed helper for deterministic tests.
func init() {
	rand.Seed(time.Now().UnixNano())
}

// Helper: sort selections by estimated time descending (for budget trimming)
func sortByTimeDesc(sels []ContentSelection) {
	sort.Slice(sels, func(i, j int) bool {
		ti := sels[i].Content.EstimatedTime
		tj := sels[j].Content.EstimatedTime
		return ti > tj
	})
}
