package event

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Topic names.
const (
	TopicLearnerActivity    = "learner.activity"
	TopicLearnerActivityDLQ = "learner.activity.dlq"
)

// ActivityEvent is published when a learner completes an exercise.
type ActivityEvent struct {
	EventID         string   `json:"event_id"`
	LearnerID       string   `json:"learner_id"`
	SessionID       string   `json:"session_id"`
	Timestamp       string   `json:"timestamp"`
	EventType       string   `json:"event_type"`
	ContentID       string   `json:"content_id"`
	SkillIDs        []string `json:"skill_ids"`
	IsCorrect       bool     `json:"is_correct"`
	ErrorType       string   `json:"error_type"`
	SessionPosition int      `json:"session_position"`
}

// NewActivityEvent creates a fully-populated activity event.
func NewActivityEvent(learnerID, sessionID, contentID string, skillIDs []string, isCorrect bool, errorType string, position int) *ActivityEvent {
	return &ActivityEvent{
		EventID:         uuid.New().String(),
		LearnerID:       learnerID,
		SessionID:       sessionID,
		Timestamp:       time.Now().UTC().Format(time.RFC3339Nano),
		EventType:       "exercise_completed",
		ContentID:       contentID,
		SkillIDs:        skillIDs,
		IsCorrect:       isCorrect,
		ErrorType:       errorType,
		SessionPosition: position,
	}
}

// Validate checks that all required fields are present.
func (e *ActivityEvent) Validate() error {
	if e.EventID == "" {
		return errors.New("missing event_id")
	}
	if e.LearnerID == "" {
		return errors.New("missing learner_id")
	}
	if e.SessionID == "" {
		return errors.New("missing session_id")
	}
	if e.Timestamp == "" {
		return errors.New("missing timestamp")
	}
	if e.EventType == "" {
		return errors.New("missing event_type")
	}
	if e.ContentID == "" {
		return errors.New("missing content_id")
	}
	if e.SkillIDs == nil {
		return errors.New("missing skill_ids")
	}
	if e.ErrorType == "" {
		return errors.New("missing error_type")
	}
	return nil
}

// Marshal serializes the event to JSON.
func (e *ActivityEvent) Marshal() ([]byte, error) {
	return json.Marshal(e)
}

// DLQEvent wraps a failed event with the error reason.
type DLQEvent struct {
	OriginalPayload json.RawMessage `json:"original_payload"`
	ErrorReason     string          `json:"error_reason"`
	FailedAt        string          `json:"failed_at"`
}

// ValidateJSON checks that a raw JSON payload is a valid ActivityEvent.
func ValidateJSON(data []byte) (*ActivityEvent, error) {
	var evt ActivityEvent
	if err := json.Unmarshal(data, &evt); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if err := evt.Validate(); err != nil {
		return nil, err
	}
	return &evt, nil
}
