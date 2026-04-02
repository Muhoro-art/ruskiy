package engine

import (
	"math"
	"math/rand"
	"sort"

	"github.com/google/uuid"
	"github.com/russkiy/api/internal/model"
)

// PrerequisiteThreshold is the minimum confidence for a prerequisite to be considered "met".
const PrerequisiteThreshold = 0.3

// SessionConfig controls how sessions are generated.
type SessionConfig struct {
	TimeBudgetMinutes int
	MaxItems          int
	ReviewRatio       float64 // fraction of items that should be review vs new
	DifficultyTarget  float64 // 0.0–1.0, adjusted per learner
}

// DefaultSessionConfig returns sensible defaults for a ~15-minute session.
func DefaultSessionConfig(timeBudget int) SessionConfig {
	if timeBudget <= 0 {
		timeBudget = 15
	}
	maxItems := int(math.Ceil(float64(timeBudget) / 1.5)) // ~1.5 min per item
	if maxItems < 5 {
		maxItems = 5
	}
	if maxItems > 20 {
		maxItems = 20
	}
	return SessionConfig{
		TimeBudgetMinutes: timeBudget,
		MaxItems:          maxItems,
		ReviewRatio:       0.6,
		DifficultyTarget:  0.5,
	}
}

// SkillSelection holds a skill chosen for the session with its priority.
type SkillSelection struct {
	Skill    model.LearnerSkillState
	Priority float64
	IsReview bool
}

// SelectSkills picks skills to practice based on FSRS state, with prerequisite enforcement.
// unlockedSkillIDs is a set of skill IDs whose prerequisites are all met.
// If nil, no prerequisite filtering is applied (backward compatibility).
func SelectSkills(
	dueSkills []model.LearnerSkillState,
	weakSkills []model.LearnerSkillState,
	allSkills []model.LearnerSkillState,
	cfg SessionConfig,
	unlockedSkillIDs map[string]bool,
) []SkillSelection {
	reviewCount := int(math.Ceil(float64(cfg.MaxItems) * cfg.ReviewRatio))
	newCount := cfg.MaxItems - reviewCount

	var selections []SkillSelection

	// 1. Due-for-review skills (highest priority)
	for i := 0; i < len(dueSkills) && len(selections) < reviewCount; i++ {
		sk := dueSkills[i]
		// Allow review of already-practiced skills, but deprioritize locked ones
		priority := 10.0 - sk.Confidence*5.0
		if sk.Status == model.SkillFossilized {
			priority += 3.0
		}
		if unlockedSkillIDs != nil && !unlockedSkillIDs[sk.SkillID] {
			// Skill is locked — deprioritize heavily, skip if never practiced
			if sk.TotalAttempts == 0 {
				continue
			}
			priority -= 4.0
		}
		selections = append(selections, SkillSelection{
			Skill:    sk,
			Priority: priority,
			IsReview: true,
		})
	}

	// 2. Weak skills that aren't already selected — only unlocked
	selectedIDs := make(map[string]bool)
	for _, s := range selections {
		selectedIDs[s.Skill.SkillID] = true
	}
	for i := 0; i < len(weakSkills) && len(selections) < reviewCount; i++ {
		if selectedIDs[weakSkills[i].SkillID] {
			continue
		}
		if unlockedSkillIDs != nil && !unlockedSkillIDs[weakSkills[i].SkillID] {
			continue
		}
		selections = append(selections, SkillSelection{
			Skill:    weakSkills[i],
			Priority: 7.0 - weakSkills[i].Confidence*3.0,
			IsReview: true,
		})
		selectedIDs[weakSkills[i].SkillID] = true
	}

	// 3. New skills — STRICTLY only unlocked (prerequisites met)
	for i := 0; i < len(allSkills) && newCount > 0; i++ {
		sk := allSkills[i]
		if selectedIDs[sk.SkillID] {
			continue
		}
		if unlockedSkillIDs != nil && !unlockedSkillIDs[sk.SkillID] {
			continue
		}
		if sk.Status == model.SkillNew || sk.TotalAttempts < 3 {
			selections = append(selections, SkillSelection{
				Skill:    sk,
				Priority: 5.0,
				IsReview: false,
			})
			selectedIDs[sk.SkillID] = true
			newCount--
		}
	}

	// Sort by priority descending
	sort.Slice(selections, func(i, j int) bool {
		return selections[i].Priority > selections[j].Priority
	})

	// Cap at max items
	if len(selections) > cfg.MaxItems {
		selections = selections[:cfg.MaxItems]
	}

	return selections
}

// AssignRoles distributes session items across the 6-role arc.
// Pattern: warmup(1-2) → ramp(1-2) → core(3-5) → relief(1) → challenge(1-2) → cooldown(1)
func AssignRoles(count int) []model.SessionItemRole {
	if count <= 0 {
		return nil
	}

	roles := make([]model.SessionItemRole, count)

	switch {
	case count <= 3:
		roles[0] = model.RoleWarmup
		for i := 1; i < count-1; i++ {
			roles[i] = model.RoleCore
		}
		if count > 1 {
			roles[count-1] = model.RoleCooldown
		}
	case count <= 5:
		roles[0] = model.RoleWarmup
		roles[1] = model.RoleRamp
		for i := 2; i < count-1; i++ {
			roles[i] = model.RoleCore
		}
		roles[count-1] = model.RoleCooldown
	default:
		// Full arc
		roles[0] = model.RoleWarmup
		roles[1] = model.RoleRamp
		reliefIdx := count/2 + 1
		challengeStart := reliefIdx + 1
		for i := 2; i < reliefIdx; i++ {
			roles[i] = model.RoleCore
		}
		roles[reliefIdx] = model.RoleRelief
		for i := challengeStart; i < count-1; i++ {
			roles[i] = model.RoleChallenge
		}
		roles[count-1] = model.RoleCooldown
	}

	return roles
}

// MatchContent picks a content atom for a skill from available content.
// It prefers content matching the role's difficulty and avoids recently used items.
func MatchContent(
	skillID string,
	role model.SessionItemRole,
	available []model.ContentAtom,
	recentlyUsed map[uuid.UUID]bool,
) *model.ContentAtom {
	// Filter to content targeting this skill
	var candidates []model.ContentAtom
	for _, c := range available {
		for _, ts := range c.TargetSkills {
			if ts == skillID {
				candidates = append(candidates, c)
				break
			}
		}
	}

	if len(candidates) == 0 {
		// Fall back: any available content
		candidates = available
	}

	// Prefer unused content
	var fresh []model.ContentAtom
	for _, c := range candidates {
		if !recentlyUsed[c.ID] {
			fresh = append(fresh, c)
		}
	}
	if len(fresh) > 0 {
		candidates = fresh
	}

	if len(candidates) == 0 {
		return nil
	}

	// Sort by role suitability
	targetDifficulty := roleDifficulty(role)
	sort.Slice(candidates, func(i, j int) bool {
		di := math.Abs(candidates[i].Difficulty - targetDifficulty)
		dj := math.Abs(candidates[j].Difficulty - targetDifficulty)
		if di != dj {
			return di < dj // closer to target difficulty first
		}
		return candidates[i].QualityScore > candidates[j].QualityScore
	})

	// Add some randomness to avoid always picking the same top item
	topN := 3
	if topN > len(candidates) {
		topN = len(candidates)
	}
	return &candidates[rand.Intn(topN)]
}

func roleDifficulty(role model.SessionItemRole) float64 {
	switch role {
	case model.RoleWarmup:
		return 0.2
	case model.RoleRamp:
		return 0.4
	case model.RoleCore:
		return 0.6
	case model.RoleRelief:
		return 0.3
	case model.RoleChallenge:
		return 0.85
	case model.RoleCooldown:
		return 0.3
	default:
		return 0.5
	}
}

// BuildSession creates session items from skill selections and available content.
func BuildSession(
	sessionID uuid.UUID,
	selections []SkillSelection,
	content []model.ContentAtom,
	recentlyUsed []uuid.UUID,
) []model.SessionItem {
	usedMap := make(map[uuid.UUID]bool)
	for _, id := range recentlyUsed {
		usedMap[id] = true
	}

	count := len(selections)
	roles := AssignRoles(count)
	items := make([]model.SessionItem, 0, count)

	for i, sel := range selections {
		role := model.RoleCore
		if i < len(roles) {
			role = roles[i]
		}

		matched := MatchContent(sel.Skill.SkillID, role, content, usedMap)
		if matched == nil {
			continue
		}

		usedMap[matched.ID] = true
		items = append(items, model.SessionItem{
			ID:        uuid.New(),
			SessionID: sessionID,
			Position:  i,
			ContentID: matched.ID,
			SkillID:   sel.Skill.SkillID,
			Role:      role,
			Completed: false,
		})
	}

	return items
}

// DeterminePlacementLevel analyzes placement test results and returns the appropriate CEFR level.
func DeterminePlacementLevel(results []model.SkillTestResult) model.CEFRLevel {
	levelCorrect := map[string]int{}
	levelTotal := map[string]int{}

	for _, r := range results {
		levelTotal[r.CEFRLevel]++
		if r.IsCorrect {
			levelCorrect[r.CEFRLevel]++
		}
	}

	// Check from highest to lowest: if accuracy >= 70% at a level, learner has mastered it
	levels := []string{"C2", "C1", "B2", "B1", "A2", "A1"}
	highestPassed := "A1"

	for i := len(levels) - 1; i >= 0; i-- {
		lvl := levels[i]
		total := levelTotal[lvl]
		if total == 0 {
			continue
		}
		accuracy := float64(levelCorrect[lvl]) / float64(total)
		if accuracy >= 0.7 {
			highestPassed = lvl
		} else {
			break // If they fail a level, don't check higher
		}
	}

	return model.CEFRLevel(highestPassed)
}
