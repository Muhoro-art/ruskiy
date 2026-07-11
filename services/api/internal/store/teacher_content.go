package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Студия Phase A — persistence for teacher-authored content.
// Every accessor is AUTHOR-SCOPED: a teacher can only ever read or mutate their
// own items (WHERE author_id = $author on every statement), so there is no path
// to another teacher's drafts regardless of what id the client sends.

var (
	ErrContentNotFound = errors.New("content not found")
	// ErrContentQuota — per-author caps hit. The velocity rate-limiter bounds
	// requests/minute; these bound TOTALS, so one compromised or malicious
	// teacher/dean account can't exhaust storage or flood the moderation queue.
	ErrContentQuota = errors.New("content quota exceeded")
)

const (
	maxItemsPerAuthor   = 500 // total authored items one account may hold
	maxPendingPerAuthor = 25  // items simultaneously awaiting moderation
)

type TeacherContent struct {
	ID           uuid.UUID       `json:"id"`
	AuthorID     uuid.UUID       `json:"authorId"`
	Title        string          `json:"title"`
	ExerciseType string          `json:"exerciseType"`
	ContentData  json.RawMessage `json:"contentData"`
	CEFRLevel    string          `json:"cefrLevel"`
	Topic        string          `json:"topic"`
	TargetSkills []string        `json:"targetSkills"`
	Status       string          `json:"status"`
	SubmittedAt  *time.Time      `json:"submittedAt"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
	// ReviewFeedback carries the moderator's note from the LATEST resolved review
	// (author-facing; empty until a review resolves).
	ReviewFeedback string `json:"reviewFeedback,omitempty"`
	// AuthorName attributes the material to its creator (staff email) on
	// learner-facing and global surfaces.
	AuthorName string `json:"authorName,omitempty"`
}

const teacherContentCols = `id, author_id, title, exercise_type, content_data, cefr_level::text, topic, target_skills, status, submitted_at, created_at, updated_at`

func scanTeacherContent(row pgx.Row) (*TeacherContent, error) {
	c := &TeacherContent{}
	err := row.Scan(&c.ID, &c.AuthorID, &c.Title, &c.ExerciseType, &c.ContentData, &c.CEFRLevel,
		&c.Topic, &c.TargetSkills, &c.Status, &c.SubmittedAt, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrContentNotFound
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

// CreateContent inserts a new draft owned by the author, subject to the
// per-author total quota (a soft guard — a small race past the cap is harmless,
// the point is preventing unbounded accumulation).
func (s *TeacherStore) CreateContent(ctx context.Context, authorID uuid.UUID, title, exerciseType string, data json.RawMessage, cefr, topic string, skills []string) (*TeacherContent, error) {
	if skills == nil {
		skills = []string{}
	}
	var n int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM teacher_content WHERE author_id = $1`, authorID).Scan(&n); err != nil {
		return nil, err
	}
	if n >= maxItemsPerAuthor {
		return nil, ErrContentQuota
	}
	return scanTeacherContent(s.db.QueryRow(ctx, `
		INSERT INTO teacher_content (author_id, title, exercise_type, content_data, cefr_level, topic, target_skills)
		VALUES ($1, $2, $3, $4, $5::cefr_level, $6, $7)
		RETURNING `+teacherContentCols,
		authorID, title, exerciseType, []byte(data), cefr, topic, skills))
}

// ListContentByAuthor returns the author's items, newest first, each carrying
// the latest resolved review feedback (so a rejected author sees WHY).
func (s *TeacherStore) ListContentByAuthor(ctx context.Context, authorID uuid.UUID) ([]TeacherContent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT tc.id, tc.author_id, tc.title, tc.exercise_type, tc.content_data, tc.cefr_level::text,
		       tc.topic, tc.target_skills, tc.status, tc.submitted_at, tc.created_at, tc.updated_at,
		       COALESCE(r.feedback, '')
		FROM teacher_content tc
		LEFT JOIN LATERAL (
			SELECT feedback FROM content_reviews cr
			WHERE cr.content_id = tc.id AND cr.verdict IS NOT NULL
			ORDER BY cr.resolved_at DESC LIMIT 1
		) r ON true
		WHERE tc.author_id = $1 ORDER BY tc.updated_at DESC`, authorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeacherContent{}
	for rows.Next() {
		var c TeacherContent
		if err := rows.Scan(&c.ID, &c.AuthorID, &c.Title, &c.ExerciseType, &c.ContentData, &c.CEFRLevel,
			&c.Topic, &c.TargetSkills, &c.Status, &c.SubmittedAt, &c.CreatedAt, &c.UpdatedAt, &c.ReviewFeedback); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AllContentAttachable verifies every id is either the caller's OWN material or
// an APPROVED (moderated, platform-wide) one — the guard for attaching content
// to an assignment. Own drafts are fine (the author is the authority for their
// class); other teachers' unapproved material is not attachable, or a leaked id
// would exfiltrate it to this teacher's students.
func (s *TeacherStore) AllContentAttachable(ctx context.Context, authorID uuid.UUID, ids []uuid.UUID) (bool, error) {
	if len(ids) == 0 {
		return true, nil
	}
	uniq := map[uuid.UUID]bool{}
	for _, id := range ids {
		uniq[id] = true
	}
	var n int
	err := s.db.QueryRow(ctx,
		`SELECT count(DISTINCT id) FROM teacher_content
		 WHERE (author_id = $1 OR status = 'approved') AND id = ANY($2)`,
		authorID, ids).Scan(&n)
	if err != nil {
		return false, err
	}
	return n == len(uniq), nil
}

// ListAssignmentContentForLearner returns the authored materials attached to an
// assignment, ONLY if the calling learner can see that assignment (member of its
// cohort and untargeted-or-targeted-at-them) — the learner delivery path.
func (s *TeacherStore) ListAssignmentContentForLearner(ctx context.Context, learnerID, assignmentID uuid.UUID) ([]TeacherContent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT tc.id, tc.author_id, tc.title, tc.exercise_type, tc.content_data, tc.cefr_level::text,
		       tc.topic, tc.target_skills, tc.status, tc.submitted_at, tc.created_at, tc.updated_at, u.email
		FROM assignment_content ac
		JOIN teacher_content tc ON tc.id = ac.content_id
		JOIN users u ON u.id = tc.author_id
		JOIN assignments a ON a.id = ac.assignment_id
		JOIN cohort_members cm ON cm.cohort_id = a.cohort_id AND cm.learner_id = $1
		WHERE ac.assignment_id = $2
		  AND (NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		       OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = $1))
		ORDER BY tc.created_at`, learnerID, assignmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeacherContent{}
	for rows.Next() {
		var c TeacherContent
		if err := rows.Scan(&c.ID, &c.AuthorID, &c.Title, &c.ExerciseType, &c.ContentData, &c.CEFRLevel,
			&c.Topic, &c.TargetSkills, &c.Status, &c.SubmittedAt, &c.CreatedAt, &c.UpdatedAt, &c.AuthorName); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------------- Moderation (Phase C) ----------------

type PendingReview struct {
	ReviewID    uuid.UUID      `json:"reviewId"`
	AuthorEmail string         `json:"authorEmail"`
	Content     TeacherContent `json:"content"`
}

// ListPendingReviews returns the moderation queue, oldest first, BOUNDED — each
// row carries up to 64 KiB of content_data, so an unbounded select would let a
// queue-spammer balloon the admin response.
func (s *TeacherStore) ListPendingReviews(ctx context.Context) ([]PendingReview, error) {
	rows, err := s.db.Query(ctx, `
		SELECT cr.id, u.email,
		       tc.id, tc.author_id, tc.title, tc.exercise_type, tc.content_data, tc.cefr_level::text,
		       tc.topic, tc.target_skills, tc.status, tc.submitted_at, tc.created_at, tc.updated_at
		FROM content_reviews cr
		JOIN teacher_content tc ON tc.id = cr.content_id
		JOIN users u ON u.id = tc.author_id
		WHERE cr.verdict IS NULL AND tc.status = 'submitted'
		ORDER BY cr.created_at ASC, cr.id
		LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PendingReview{}
	for rows.Next() {
		var p PendingReview
		c := &p.Content
		if err := rows.Scan(&p.ReviewID, &p.AuthorEmail,
			&c.ID, &c.AuthorID, &c.Title, &c.ExerciseType, &c.ContentData, &c.CEFRLevel,
			&c.Topic, &c.TargetSkills, &c.Status, &c.SubmittedAt, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ResolveContentReview approves or rejects a submitted item atomically: flips
// the content status and closes the pending review row with the verdict,
// reviewer and feedback (the audit trail).
func (s *TeacherStore) ResolveContentReview(ctx context.Context, contentID, reviewerID uuid.UUID, approve bool, feedback string) error {
	newStatus := "rejected"
	verdict := "rejected"
	if approve {
		newStatus = "approved"
		verdict = "approved"
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx,
		`UPDATE teacher_content SET status = $2, updated_at = NOW() WHERE id = $1 AND status = 'submitted'`,
		contentID, newStatus)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrContentNotFound // not submitted (already resolved, or bogus id)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE content_reviews SET reviewer_id = $2, verdict = $3, feedback = $4, resolved_at = NOW()
		WHERE content_id = $1 AND verdict IS NULL`, contentID, reviewerID, verdict, feedback); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListGlobalContent returns APPROVED items — the platform-wide pool (Phase C).
func (s *TeacherStore) ListGlobalContent(ctx context.Context, level string, limit int) ([]TeacherContent, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.Query(ctx, `
		SELECT tc.id, tc.author_id, tc.title, tc.exercise_type, tc.content_data, tc.cefr_level::text,
		       tc.topic, tc.target_skills, tc.status, tc.submitted_at, tc.created_at, tc.updated_at, u.email
		FROM teacher_content tc
		JOIN users u ON u.id = tc.author_id
		WHERE tc.status = 'approved' AND ($1 = '' OR tc.cefr_level::text = $1)
		ORDER BY tc.updated_at DESC LIMIT $2`, level, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeacherContent{}
	for rows.Next() {
		var c TeacherContent
		if err := rows.Scan(&c.ID, &c.AuthorID, &c.Title, &c.ExerciseType, &c.ContentData, &c.CEFRLevel,
			&c.Topic, &c.TargetSkills, &c.Status, &c.SubmittedAt, &c.CreatedAt, &c.UpdatedAt, &c.AuthorName); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpdateContent edits an item the author owns. Only draft/rejected items are
// editable; editing a rejected item re-opens it as a draft (fresh review later).
// Submitted/approved items are frozen — an edit would bypass moderation.
func (s *TeacherStore) UpdateContent(ctx context.Context, authorID, id uuid.UUID, title, exerciseType string, data json.RawMessage, cefr, topic string, skills []string) (*TeacherContent, error) {
	if skills == nil {
		skills = []string{}
	}
	return scanTeacherContent(s.db.QueryRow(ctx, `
		UPDATE teacher_content SET
			title = $3, exercise_type = $4, content_data = $5, cefr_level = $6::cefr_level,
			topic = $7, target_skills = $8, status = 'draft', submitted_at = NULL, updated_at = NOW()
		WHERE id = $2 AND author_id = $1 AND status IN ('draft', 'rejected')
		RETURNING `+teacherContentCols,
		authorID, id, title, exerciseType, []byte(data), cefr, topic, skills))
}

// DeleteContent removes an item the author owns (any status — the author may
// always withdraw their material; assignment_content rows cascade).
func (s *TeacherStore) DeleteContent(ctx context.Context, authorID, id uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM teacher_content WHERE id = $2 AND author_id = $1`, authorID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrContentNotFound
	}
	return nil
}

// SubmitContent moves the author's draft into the moderation queue atomically
// (status flip + pending review row). Capped per author so one account can't
// flood the queue.
func (s *TeacherStore) SubmitContent(ctx context.Context, authorID, id uuid.UUID) (*TeacherContent, error) {
	var pending int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM teacher_content WHERE author_id = $1 AND status = 'submitted'`, authorID).Scan(&pending); err != nil {
		return nil, err
	}
	if pending >= maxPendingPerAuthor {
		return nil, ErrContentQuota
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	c, err := scanTeacherContent(tx.QueryRow(ctx, `
		UPDATE teacher_content SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
		WHERE id = $2 AND author_id = $1 AND status = 'draft'
		RETURNING `+teacherContentCols, authorID, id))
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO content_reviews (content_id) VALUES ($1)`, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return c, nil
}
