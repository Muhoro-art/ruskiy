package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type LearnerSegment string

const (
	SegmentToddler LearnerSegment = "toddler"
	SegmentKid     LearnerSegment = "kid"
	SegmentTeen    LearnerSegment = "teen"
	SegmentUniPrep LearnerSegment = "uni_prep"
	SegmentMigrant LearnerSegment = "migrant"
	SegmentSenior  LearnerSegment = "senior"
)

type DomainFocus string

const (
	DomainGeneral     DomainFocus = "general"
	DomainMedical     DomainFocus = "medical"
	DomainEngineering DomainFocus = "engineering"
	DomainHumanities  DomainFocus = "humanities"
	DomainBusiness    DomainFocus = "business"
	DomainLaw         DomainFocus = "law"
)

type CEFRLevel string

const (
	LevelA1 CEFRLevel = "A1"
	LevelA2 CEFRLevel = "A2"
	LevelB1 CEFRLevel = "B1"
	LevelB2 CEFRLevel = "B2"
	LevelC1 CEFRLevel = "C1"
	LevelC2 CEFRLevel = "C2"
)

type LearnerProfile struct {
	ID             uuid.UUID       `json:"id"`
	UserID         uuid.UUID       `json:"userId"`
	DisplayName    string          `json:"displayName"`
	Segment        LearnerSegment  `json:"segment"`
	NativeLanguage string          `json:"nativeLanguage"`
	Domain         DomainFocus     `json:"domain"`
	CurrentLevel   CEFRLevel       `json:"currentLevel"`
	TargetLevel    CEFRLevel       `json:"targetLevel"`
	TargetDate     *time.Time      `json:"targetDate"`
	WeeklyHours    float64         `json:"weeklyHours"`
	CreatedAt      time.Time       `json:"createdAt"`
	OnboardingData json.RawMessage `json:"onboardingData,omitempty"`
}

type CreateProfileRequest struct {
	DisplayName string         `json:"displayName"`
	Segment     LearnerSegment `json:"segment"`
	Domain      DomainFocus    `json:"domain,omitempty"`
	TargetLevel CEFRLevel      `json:"targetLevel"`
	TargetDate  *string        `json:"targetDate,omitempty"`
	WeeklyHours float64        `json:"weeklyHours"`
	// Consent carries a parental-consent assertion for the kid segment so it can be
	// persisted server-side as an auditable, deletable record (COPPA) instead of
	// living only in the child's browser localStorage.
	Consent *ConsentInfo `json:"consent,omitempty"`
}

// ConsentInfo is a parental-consent assertion captured at kid-profile creation.
// NOTE: this records THAT consent was asserted (method + consenting email +
// timestamp) — it is not, by itself, *verifiable* parental consent, which requires
// an out-of-band flow (parent account, signed form, nominal charge).
type ConsentInfo struct {
	Method         string `json:"method"`         // e.g. "guardian_checkbox"
	ConsenterEmail string `json:"consenterEmail"` // the consenting adult's email
}
