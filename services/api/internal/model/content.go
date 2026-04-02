package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type ContentType string

const (
	ContentExercise ContentType = "exercise"
	ContentDialogue ContentType = "dialogue"
	ContentStory    ContentType = "story"
	ContentMedia    ContentType = "media"
	ContentScenario ContentType = "scenario"
)

type ExerciseType string

const (
	ExerciseMultipleChoice ExerciseType = "multiple_choice"
	ExerciseFillBlank      ExerciseType = "fill_blank"
	ExerciseTranslation    ExerciseType = "translation"
	ExerciseDictation      ExerciseType = "dictation"
	ExerciseSpeaking       ExerciseType = "speaking"
	ExerciseMatching       ExerciseType = "matching"
	ExerciseOrdering       ExerciseType = "ordering"
	ExerciseRolePlay       ExerciseType = "role_play"
	ExerciseListening      ExerciseType = "listening"
	ExerciseReadingComp    ExerciseType = "reading_comp"
)

type ContentAtom struct {
	ID            uuid.UUID       `json:"id"`
	ContentType   ContentType     `json:"contentType"`
	ExerciseType  *ExerciseType   `json:"exerciseType"`
	TargetSkills  []string        `json:"targetSkills"`
	CEFRLevel     CEFRLevel       `json:"cefrLevel"`
	SegmentTags   []LearnerSegment `json:"segmentTags"`
	DomainTags    []DomainFocus   `json:"domainTags"`
	Difficulty    float64         `json:"difficulty"`
	EstimatedTime int             `json:"estimatedTime"` // seconds
	ContentData   json.RawMessage `json:"contentData"`
	MediaRefs     []string        `json:"mediaRefs"`
	CreatedAt     time.Time       `json:"createdAt"`
	QualityScore  float64         `json:"qualityScore"`
	UsageCount    int             `json:"usageCount"`
}
