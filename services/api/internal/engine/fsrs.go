package engine

import (
	"math"
	"time"

	"github.com/russkiy/api/internal/model"
)

// FSRS constants (tuned for language learning)
const (
	InitialStability   = 0.4   // initial stability for new skills (days)
	InitialDifficulty  = 0.3   // default difficulty for English→Russian
	LapseFactor        = 0.4   // stability multiplier on lapse
	FossilLapseFactor  = 0.3   // aggressive lapse factor for fossilized errors
	MinStability       = 0.4   // minimum stability in days
	MaxStability       = 365.0 // maximum stability in days
	DesiredRetention   = 0.9   // target recall probability
	StabilityDecayBase = 0.9   // base for retrievability calculation
)

// Predefined grade constants.
var (
	GradeAgain = Grade{Score: 1.0} // complete fail
	GradeHard  = Grade{Score: 2.0} // hard recall
	GradeGood  = Grade{Score: 3.0} // correct with effort
	GradeEasy  = Grade{Score: 4.0} // perfect recall
)

// Grade represents the quality of a learner's response
type Grade struct {
	Score float64 // 1.0 (complete fail) to 4.0 (perfect recall)
}

func (g Grade) IsPass() bool {
	return g.Score >= 2.0
}

// GradeFromResult converts an exercise result to an FSRS grade
func GradeFromResult(result *model.ExerciseResult) Grade {
	if !result.IsCorrect {
		return Grade{Score: 1.0}
	}
	score := 4.0
	if result.HintLevelUsed > 0 {
		score -= float64(result.HintLevelUsed) * 0.5
	}
	if result.ResponseTimeMs > 10000 {
		score -= 0.5
	}
	if score < 2.0 {
		score = 2.0
	}
	return Grade{Score: score}
}

// NewSkillState creates a brand-new skill state with initial FSRS values.
// The skill is immediately reviewable (next_review_due = now).
func NewSkillState(learnerID, skillID string) *model.LearnerSkillState {
	now := time.Now()
	return &model.LearnerSkillState{
		LearnerID:     learnerID,
		SkillID:       skillID,
		Confidence:    0.0,
		Stability:     InitialStability,
		Difficulty:    InitialDifficulty,
		LastReviewed:  nil,
		NextReviewDue: &now,
		TotalAttempts: 0,
		CorrectStreak: 0,
		ErrorCount:    0,
		ErrorTypes:    []string{},
		Status:        model.SkillNew,
		Reps:          0,
		Lapses:        0,
	}
}

// Retrievability calculates the recall probability after elapsedDays
// since last review, given the current stability. Uses the exponential
// forgetting curve: R = exp(-t / S).
func Retrievability(stability float64, elapsedDays float64) float64 {
	if elapsedDays <= 0 {
		return 1.0
	}
	s := math.Max(stability, MinStability)
	return math.Exp(-elapsedDays / s)
}

// UpdateSkillState applies the FSRS algorithm after a review.
func UpdateSkillState(skill *model.LearnerSkillState, grade Grade, errorType *model.ErrorType) {
	now := time.Now()

	// Calculate elapsed days since last review
	var elapsedDays float64
	if skill.LastReviewed != nil {
		elapsedDays = now.Sub(*skill.LastReviewed).Hours() / 24.0
	}

	// Calculate current retrievability
	retrievability := Retrievability(skill.Stability, elapsedDays)

	// Determine the effective error type
	var et model.ErrorType
	hasError := false
	if errorType != nil {
		et = *errorType
		hasError = true
	}

	// Save old confidence for avoidance check
	oldConfidence := skill.Confidence

	// --- Difficulty update ---
	newDifficulty := skill.Difficulty - 0.1*(grade.Score-3.0)
	if hasError {
		newDifficulty += errorTypeModifier(et)
	}
	skill.Difficulty = constrain(newDifficulty, 0.0, 1.0)

	// --- Stability & status update ---
	isAvoidance := hasError && et == model.ErrorAvoidance
	isFossilization := hasError && et == model.ErrorFossilization

	if grade.IsPass() {
		if isAvoidance {
			// Avoidance: confidence does NOT increase, sooner review
			skill.CorrectStreak++
			stabilityFactor := stabilityIncreaseFactor(skill.Difficulty, retrievability, grade.Score)
			dampenedFactor := 1.0 + (stabilityFactor-1.0)*0.5
			skill.Stability = math.Min(skill.Stability*dampenedFactor, MaxStability)
			// Keep confidence unchanged (avoidance != mastery)
			skill.Confidence = oldConfidence
			if skill.Status == model.SkillNew {
				skill.Status = model.SkillLearning
			}
		} else {
			// Normal success
			stabilityFactor := stabilityIncreaseFactor(skill.Difficulty, retrievability, grade.Score)
			skill.Stability = math.Min(skill.Stability*stabilityFactor, MaxStability)
			skill.CorrectStreak++
			skill.Confidence = constrain(retrievability*grade.Score/4.0, 0.0, 1.0)
			if skill.Confidence >= 0.9 && skill.CorrectStreak >= 5 {
				skill.Status = model.SkillMastered
			} else if skill.Status == model.SkillNew {
				skill.Status = model.SkillLearning
			} else if skill.Confidence >= 0.7 {
				skill.Status = model.SkillReview
			}
		}
	} else {
		// Failed recall: lapse
		skill.Lapses++
		skill.CorrectStreak = 0
		if isFossilization {
			skill.Stability = math.Max(skill.Stability*FossilLapseFactor, MinStability)
		} else {
			skill.Stability = math.Max(skill.Stability*LapseFactor, MinStability)
		}
		skill.Confidence = constrain(retrievability*grade.Score/4.0, 0.0, 1.0)
		if skill.Lapses >= 5 && skill.ErrorCount >= 10 {
			skill.Status = model.SkillFossilized
		} else {
			skill.Status = model.SkillRelearning
		}
	}

	// --- Schedule next review ---
	if !grade.IsPass() || isFossilization {
		nextReview := now
		skill.NextReviewDue = &nextReview
	} else if isAvoidance {
		optimalInterval := skill.Stability * math.Log(DesiredRetention) / math.Log(StabilityDecayBase)
		shortenedInterval := optimalInterval * 0.5
		nextReview := now.Add(time.Duration(shortenedInterval*24) * time.Hour)
		skill.NextReviewDue = &nextReview
	} else {
		optimalInterval := skill.Stability * math.Log(DesiredRetention) / math.Log(StabilityDecayBase)
		nextReview := now.Add(time.Duration(optimalInterval*24) * time.Hour)
		skill.NextReviewDue = &nextReview
	}

	// --- Update counters ---
	skill.TotalAttempts++
	skill.Reps++
	if !grade.IsPass() {
		skill.ErrorCount++
		if hasError {
			skill.ErrorTypes = appendUnique(skill.ErrorTypes, string(et))
		}
	}

	skill.LastReviewed = &now
}

// errorTypeModifier returns the difficulty bump for each error type.
func errorTypeModifier(et model.ErrorType) float64 {
	switch et {
	case model.ErrorTransfer:
		return 0.05
	case model.ErrorOvergeneralization:
		return 0.03
	case model.ErrorAvoidance:
		return 0.08
	case model.ErrorFossilization:
		return 0.10
	default:
		return 0.0
	}
}

// stabilityIncreaseFactor calculates how much to increase stability after success.
func stabilityIncreaseFactor(difficulty, retrievability, gradeScore float64) float64 {
	difficultyFactor := 1.0 + (1.0-difficulty)*0.5
	retrievabilityFactor := 1.0 + (1.0-retrievability)*1.5
	gradeFactor := 0.5 + gradeScore/4.0
	return difficultyFactor * retrievabilityFactor * gradeFactor
}

func constrain(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func appendUnique(slice []string, item string) []string {
	for _, s := range slice {
		if s == item {
			return slice
		}
	}
	return append(slice, item)
}
