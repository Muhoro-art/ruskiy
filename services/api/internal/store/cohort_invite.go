package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Secure cohort joining — replaces the old force-add (a teacher could enrol any
// searchable learner without consent). Two learner-consented paths:
//
//  1. JOIN CODE: the teacher generates a short code for a cohort and shares it
//     out-of-band; the STUDENT redeems it (entering the code is the consent).
//  2. INVITATION: the teacher invites a specific learner; the STUDENT accepts or
//     declines from their Join page. Nothing is enrolled until they accept.
//
// Tenant checks (institution student ↔ institution cohort; unaffiliated learner ↔
// independent cohort) run in the handler at redeem/accept time via InstitutionStore.

var (
	ErrCohortCodeInvalid   = errors.New("invalid cohort code")
	ErrInviteNotFound      = errors.New("invite not found")
	ErrInviteAlreadyMember = errors.New("already accepted")
)

type CohortInvite struct {
	ID          uuid.UUID `json:"id"`
	CohortID    uuid.UUID `json:"cohortId"`
	CohortName  string    `json:"cohortName"`
	LearnerID   uuid.UUID `json:"learnerId"`
	LearnerName string    `json:"learnerName,omitempty"`
	TeacherName string    `json:"teacherName,omitempty"` // inviter email (staff have no profile)
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}

// RotateCohortJoinCode generates (or replaces) the cohort's join code.
func (s *TeacherStore) RotateCohortJoinCode(ctx context.Context, cohortID uuid.UUID) (string, error) {
	code := randCode(8)
	_, err := s.db.Exec(ctx, `UPDATE cohorts SET join_code = $2 WHERE id = $1`, cohortID, code)
	return code, err
}

// CohortByJoinCode resolves a join code to (cohortID, institutionID) for the
// tenant check. institutionID is nil for an independent teacher's cohort.
func (s *TeacherStore) CohortByJoinCode(ctx context.Context, code string) (uuid.UUID, *uuid.UUID, string, error) {
	var cohortID uuid.UUID
	var instID *uuid.UUID
	var name string
	err := s.db.QueryRow(ctx,
		`SELECT id, institution_id, name FROM cohorts WHERE join_code = $1`,
		strings.ToUpper(strings.TrimSpace(code))).Scan(&cohortID, &instID, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil, "", ErrCohortCodeInvalid
	}
	return cohortID, instID, name, err
}

// CreateCohortInvite records a pending invite (idempotent per cohort+learner).
// Re-inviting after a decline re-opens the invite; an accepted invite stays
// accepted (the learner is already a member).
func (s *TeacherStore) CreateCohortInvite(ctx context.Context, cohortID, learnerID, invitedBy uuid.UUID) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO cohort_invites (cohort_id, learner_id, invited_by)
		VALUES ($1, $2, $3)
		ON CONFLICT (cohort_id, learner_id) DO UPDATE SET
			status = 'pending', invited_by = EXCLUDED.invited_by,
			created_at = NOW(), responded_at = NULL
		WHERE cohort_invites.status = 'declined'
	`, cohortID, learnerID, invitedBy)
	return err
}

// ListCohortInvites returns a cohort's pending invites (teacher view).
func (s *TeacherStore) ListCohortInvites(ctx context.Context, cohortID uuid.UUID) ([]CohortInvite, error) {
	rows, err := s.db.Query(ctx, `
		SELECT ci.id, ci.cohort_id, c.name, ci.learner_id, lp.display_name, ci.status, ci.created_at
		FROM cohort_invites ci
		JOIN cohorts c ON c.id = ci.cohort_id
		JOIN learner_profiles lp ON lp.id = ci.learner_id
		WHERE ci.cohort_id = $1 AND ci.status = 'pending'
		ORDER BY ci.created_at DESC`, cohortID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CohortInvite{}
	for rows.Next() {
		var iv CohortInvite
		if err := rows.Scan(&iv.ID, &iv.CohortID, &iv.CohortName, &iv.LearnerID, &iv.LearnerName, &iv.Status, &iv.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, iv)
	}
	return out, rows.Err()
}

// ListLearnerInvites returns a learner's pending invites (student view).
func (s *TeacherStore) ListLearnerInvites(ctx context.Context, learnerID uuid.UUID) ([]CohortInvite, error) {
	rows, err := s.db.Query(ctx, `
		SELECT ci.id, ci.cohort_id, c.name, ci.learner_id, u.email, ci.status, ci.created_at
		FROM cohort_invites ci
		JOIN cohorts c ON c.id = ci.cohort_id
		JOIN users u ON u.id = ci.invited_by
		WHERE ci.learner_id = $1 AND ci.status = 'pending'
		ORDER BY ci.created_at DESC`, learnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CohortInvite{}
	for rows.Next() {
		var iv CohortInvite
		if err := rows.Scan(&iv.ID, &iv.CohortID, &iv.CohortName, &iv.LearnerID, &iv.TeacherName, &iv.Status, &iv.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, iv)
	}
	return out, rows.Err()
}

// InviteForLearner loads a pending invite ONLY if it belongs to this learner —
// the ownership check for the respond endpoint (a learner can never act on
// someone else's invite).
func (s *TeacherStore) InviteForLearner(ctx context.Context, inviteID, learnerID uuid.UUID) (*CohortInvite, error) {
	iv := &CohortInvite{}
	err := s.db.QueryRow(ctx, `
		SELECT ci.id, ci.cohort_id, c.name, ci.learner_id, ci.status, ci.created_at
		FROM cohort_invites ci JOIN cohorts c ON c.id = ci.cohort_id
		WHERE ci.id = $1 AND ci.learner_id = $2 AND ci.status = 'pending'
	`, inviteID, learnerID).Scan(&iv.ID, &iv.CohortID, &iv.CohortName, &iv.LearnerID, &iv.Status, &iv.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInviteNotFound
	}
	if err != nil {
		return nil, err
	}
	return iv, nil
}

// AcceptInviteTx marks the invite accepted and enrols the learner atomically.
func (s *TeacherStore) AcceptInviteTx(ctx context.Context, inviteID, cohortID, learnerID uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx,
		`UPDATE cohort_invites SET status = 'accepted', responded_at = NOW() WHERE id = $1 AND status = 'pending'`, inviteID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrInviteNotFound // raced: already responded
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO cohort_members (cohort_id, learner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, cohortID, learnerID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeclineInvite marks the invite declined (no enrolment).
func (s *TeacherStore) DeclineInvite(ctx context.Context, inviteID uuid.UUID) error {
	_, err := s.db.Exec(ctx,
		`UPDATE cohort_invites SET status = 'declined', responded_at = NOW() WHERE id = $1 AND status = 'pending'`, inviteID)
	return err
}

// InstitutionOfCohort returns the cohort's tenant (nil = independent teacher's).
func (s *TeacherStore) InstitutionOfCohort(ctx context.Context, cohortID uuid.UUID) (*uuid.UUID, error) {
	var instID *uuid.UUID
	err := s.db.QueryRow(ctx, `SELECT institution_id FROM cohorts WHERE id = $1`, cohortID).Scan(&instID)
	return instID, err
}
