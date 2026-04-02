package model

import (
	"time"
)

type SkillCategory string

const (
	SkillGrammar    SkillCategory = "grammar"
	SkillVocabulary SkillCategory = "vocabulary"
	SkillPhonetics  SkillCategory = "phonetics"
	SkillPragmatics SkillCategory = "pragmatics"
)

type SkillStatus string

const (
	SkillNew          SkillStatus = "new"
	SkillLearning     SkillStatus = "learning"
	SkillRelearning   SkillStatus = "relearning"
	SkillReview       SkillStatus = "review"
	SkillMastered     SkillStatus = "mastered"
	SkillFossilized   SkillStatus = "fossilized"
)

type Skill struct {
	SkillID       string        `json:"skillId"`       // e.g. 'grammar.cases.genitive.plural'
	Category      SkillCategory `json:"category"`
	Subcategory   string        `json:"subcategory"`
	CEFRLevel     CEFRLevel     `json:"cefrLevel"`
	DisplayNameEn string        `json:"displayNameEn"`
	DisplayNameRu string        `json:"displayNameRu"`
	Prerequisites []string      `json:"prerequisites"` // skill_ids that must be learned first
}

// PlacementQuestion represents a single question in the placement assessment.
type PlacementQuestion struct {
	SkillID       string        `json:"skillId"`
	CEFRLevel     CEFRLevel     `json:"cefrLevel"`
	Category      SkillCategory `json:"category"`
	ContentAtomID string        `json:"contentAtomId"`
	Content       interface{}   `json:"content"`
}

// PlacementResult holds the outcome of a placement assessment.
type PlacementResult struct {
	DeterminedLevel CEFRLevel        `json:"determinedLevel"`
	SkillResults    []SkillTestResult `json:"skillResults"`
	TotalCorrect    int              `json:"totalCorrect"`
	TotalQuestions  int              `json:"totalQuestions"`
	UnlockedSkills  []string         `json:"unlockedSkills"`
}

// SkillTestResult records whether a learner passed a single placement question.
type SkillTestResult struct {
	SkillID   string `json:"skillId"`
	IsCorrect bool   `json:"isCorrect"`
	CEFRLevel string `json:"cefrLevel"`
}

// LearnerSkillState represents a learner's state for a specific skill (FSRS-based)
type LearnerSkillState struct {
	LearnerID        string     `json:"learnerId"`
	SkillID          string     `json:"skillId"`
	Confidence       float64    `json:"confidence"`       // 0.0 to 1.0
	Stability        float64    `json:"stability"`        // days until recall drops
	Difficulty       float64    `json:"difficulty"`        // 0.0 to 1.0
	LastReviewed     *time.Time `json:"lastReviewed"`
	NextReviewDue    *time.Time `json:"nextReviewDue"`
	TotalAttempts    int        `json:"totalAttempts"`
	CorrectStreak    int        `json:"correctStreak"`
	ErrorCount       int        `json:"errorCount"`
	ErrorTypes       []string   `json:"errorTypes"`
	InterferenceWith []string   `json:"interferenceWith"`
	Status           SkillStatus `json:"status"`
	Reps             int        `json:"reps"`
	Lapses           int        `json:"lapses"`
}
