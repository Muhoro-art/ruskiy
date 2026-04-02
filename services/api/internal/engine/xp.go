package engine

import (
	"math"

	"github.com/russkiy/api/internal/model"
)

// CalculateXP computes XP earned for an exercise result
// Formula incentivizes tackling weak skills and harder content
func CalculateXP(result *model.ExerciseResult, difficulty float64, skillConfidence float64, streakDays int) int {
	baseXP := 10.0

	// Difficulty multiplier: 1.0x to 2.5x
	difficultyMultiplier := 1.0 + difficulty*1.5

	// Accuracy bonus: full XP for correct, partial for attempts
	accuracyBonus := 0.3
	if result.IsCorrect {
		accuracyBonus = 1.0
	}

	// Weakness bonus: 50% bonus for practicing weak skills
	weaknessBonus := 1.0
	if skillConfidence < 0.5 {
		weaknessBonus = 1.5
	}

	// Streak bonus: up to 2x for consistent practice
	streakBonus := math.Min(1.0+float64(streakDays)*0.05, 2.0)

	totalXP := baseXP * difficultyMultiplier * accuracyBonus * weaknessBonus * streakBonus

	return int(math.Round(totalXP))
}

// XPForLevel calculates the total XP needed to reach a given level
// Logarithmic curve: early levels feel fast, later ones require more effort
func XPForLevel(level int) int {
	if level <= 1 {
		return 100
	}
	n := float64(level)
	return int(math.Round(100 * n * math.Log(n+1)))
}

// LevelFromXP returns the current level for a given XP total
func LevelFromXP(totalXP int) int {
	level := 1
	for XPForLevel(level+1) <= totalXP {
		level++
	}
	return level
}
