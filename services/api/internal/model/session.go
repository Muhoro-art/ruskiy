package model

import (
	"time"

	"github.com/google/uuid"
)

type SessionStatus string

const (
	SessionGenerating SessionStatus = "generating"
	SessionActive     SessionStatus = "active"
	SessionPaused     SessionStatus = "paused"
	SessionCompleted  SessionStatus = "completed"
	SessionAbandoned  SessionStatus = "abandoned"
)

type ErrorType string

const (
	ErrorTransfer          ErrorType = "transfer"
	ErrorOvergeneralization ErrorType = "overgeneralization"
	ErrorAvoidance         ErrorType = "avoidance"
	ErrorFossilization     ErrorType = "fossilization"
	ErrorGeneral           ErrorType = "general"
)

type Session struct {
	ID           uuid.UUID     `json:"id"`
	LearnerID    uuid.UUID     `json:"learnerId"`
	Status       SessionStatus `json:"status"`
	CurrentIndex int           `json:"currentIndex"`
	TotalXP      int           `json:"totalXp"`
	StartedAt    time.Time     `json:"startedAt"`
	CompletedAt  *time.Time    `json:"completedAt"`
	Duration     int           `json:"duration"` // seconds
	AccuracyRate float64       `json:"accuracyRate"`
}

type SessionItemRole string

const (
	RoleWarmup    SessionItemRole = "warmup"
	RoleRamp      SessionItemRole = "ramp"
	RoleCore      SessionItemRole = "core"
	RoleRelief    SessionItemRole = "relief"
	RoleChallenge SessionItemRole = "challenge"
	RoleCooldown  SessionItemRole = "cooldown"
)

type SessionItem struct {
	ID          uuid.UUID       `json:"id"`
	SessionID   uuid.UUID       `json:"sessionId"`
	Position    int             `json:"position"`
	ContentID   uuid.UUID       `json:"contentId"`
	SkillID     string          `json:"skillId"`
	Role        SessionItemRole `json:"role"`
	Completed   bool            `json:"completed"`
}

// SessionWithItems is a session plus its ordered exercise items with content.
type SessionWithItems struct {
	Session
	Items []SessionItemWithContent `json:"items"`
}

// SessionItemWithContent is a session item enriched with its content atom data.
type SessionItemWithContent struct {
	SessionItem
	Content *ContentAtom `json:"content,omitempty"`
}

type ExerciseResult struct {
	ID                 uuid.UUID  `json:"id"`
	SessionID          uuid.UUID  `json:"sessionId"`
	ContentID          uuid.UUID  `json:"contentId"`
	LearnerID          uuid.UUID  `json:"learnerId"`
	Response           string     `json:"response"`
	CorrectAnswer      string     `json:"correctAnswer"`
	IsCorrect          bool       `json:"isCorrect"`
	ErrorType          *ErrorType `json:"errorType"`
	ResponseTimeMs     int        `json:"responseTimeMs"`
	HintLevelUsed      int        `json:"hintLevelUsed"`
	PronunciationScore *float64   `json:"pronunciationScore"`
	XPEarned           int        `json:"xpEarned"`
	Timestamp          time.Time  `json:"timestamp"`
}

type GenerateSessionRequest struct {
	LearnerID         uuid.UUID `json:"learnerId"`
	TimeBudgetMinutes int       `json:"timeBudgetMinutes"`
	AssignmentID      *uuid.UUID `json:"assignmentId,omitempty"`
}

type SessionSummary struct {
	SessionID      uuid.UUID `json:"sessionId"`
	TotalExercises int       `json:"totalExercises"`
	CorrectCount   int       `json:"correctCount"`
	AccuracyRate   float64   `json:"accuracyRate"`
	TotalXP        int       `json:"totalXp"`
	SkillsPracticed []string `json:"skillsPracticed"`
	Duration       int       `json:"duration"`
	StreakDays     int       `json:"streakDays"`
}
