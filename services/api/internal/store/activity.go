package store

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ActivityStore records staff actions (the "who did what, when" feed) so a dean can
// judge which teachers are proactive vs passive.
type ActivityStore struct {
	db *pgxpool.Pool
}

func NewActivityStore(db *pgxpool.Pool) *ActivityStore { return &ActivityStore{db: db} }

// Action constants — kept small and stable so the UI can label + count them.
const (
	ActAssignmentCreated = "assignment_created"
	ActExamAssigned      = "exam_assigned"
	ActCohortCreated     = "cohort_created"
	ActContentCreated    = "content_created"
	ActStaffInvited      = "staff_invited"
	ActStudentEnrolled   = "student_enrolled"
)

// Record logs one action, auto-tagging the actor's institution. Best-effort: an
// error is logged, never returned, so activity logging can never break the action
// that triggered it. Safe on a nil receiver.
func (s *ActivityStore) Record(ctx context.Context, actorID uuid.UUID, action, detail string) {
	if s == nil {
		return
	}
	// Defense-in-depth cap: no matter what a caller passes, never write an oversized row
	// into the (long-retained) activity_log — bounds both storage growth and the feed
	// response size. 256 runes is ample for a name/role/title label.
	if len(detail) > 256 {
		r := []rune(detail)
		if len(r) > 256 {
			detail = string(r[:256])
		}
	}
	if _, err := s.db.Exec(ctx,
		`INSERT INTO activity_log (actor_id, institution_id, action, detail)
		 SELECT $1, (SELECT institution_id FROM users WHERE id=$1), $2, $3`,
		actorID, action, detail); err != nil {
		log.Printf("activity log (%s): %v", action, err)
	}
}

// PurgeOld deletes activity_log rows older than `days` days so the log can't grow
// without bound (the dean feed + counts only look at a trailing window). Returns the
// number of rows removed.
func (s *ActivityStore) PurgeOld(ctx context.Context, days int) (int64, error) {
	tag, err := s.db.Exec(ctx,
		`DELETE FROM activity_log WHERE created_at < now() - make_interval(days => $1)`, days)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

type ActivityEvent struct {
	ID         uuid.UUID `json:"id"`
	ActorID    uuid.UUID `json:"actorId"`
	ActorEmail string    `json:"actorEmail"`
	Action     string    `json:"action"`
	Detail     string    `json:"detail"`
	CreatedAt  time.Time `json:"createdAt"`
}

// FeedForInstitution returns the most recent staff actions in the institution.
func (s *ActivityStore) FeedForInstitution(ctx context.Context, institutionID uuid.UUID, limit int) ([]ActivityEvent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.actor_id, u.email, a.action, COALESCE(a.detail,''), a.created_at
		FROM activity_log a JOIN users u ON u.id=a.actor_id
		WHERE a.institution_id=$1
		ORDER BY a.created_at DESC LIMIT $2`, institutionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ActivityEvent{}
	for rows.Next() {
		var e ActivityEvent
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorEmail, &e.Action, &e.Detail, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

type ActivityCount struct {
	ActorID  uuid.UUID `json:"actorId"`
	Count    int       `json:"count"`
	LastAt   time.Time `json:"lastAt"`
}

// CountsForInstitution returns per-actor action counts over the last `days`, so the
// dean overview can show a proactivity number per teacher.
func (s *ActivityStore) CountsForInstitution(ctx context.Context, institutionID uuid.UUID, days int) ([]ActivityCount, error) {
	rows, err := s.db.Query(ctx, `
		SELECT actor_id, count(*), max(created_at)
		FROM activity_log
		WHERE institution_id=$1 AND created_at >= now() - make_interval(days => $2)
		GROUP BY actor_id`, institutionID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ActivityCount{}
	for rows.Next() {
		var c ActivityCount
		if err := rows.Scan(&c.ActorID, &c.Count, &c.LastAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
