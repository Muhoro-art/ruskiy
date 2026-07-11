package store

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TeacherStore backs the teacher dashboard (cohorts, assignments) and the
// leaderboard with real data — replacing the hardcoded mock responses.
type TeacherStore struct {
	db *pgxpool.Pool
}

func NewTeacherStore(db *pgxpool.Pool) *TeacherStore {
	return &TeacherStore{db: db}
}

type Cohort struct {
	ID           uuid.UUID `json:"id"`
	TeacherID    uuid.UUID `json:"teacherId"`
	Name         string    `json:"name"`
	StudentCount int       `json:"studentCount"`
	CreatedAt    time.Time `json:"createdAt"`
}

// CreateCohort creates a cohort for a teacher. institutionID tags the tenant (nil
// for an independent teacher), so institution cohorts are isolated per university.
func (s *TeacherStore) CreateCohort(ctx context.Context, teacherID uuid.UUID, name string, institutionID *uuid.UUID) (*Cohort, error) {
	c := &Cohort{TeacherID: teacherID, Name: name}
	err := s.db.QueryRow(ctx,
		`INSERT INTO cohorts (teacher_id, name, institution_id) VALUES ($1, $2, $3) RETURNING id, created_at`,
		teacherID, name, institutionID).Scan(&c.ID, &c.CreatedAt)
	return c, err
}

func (s *TeacherStore) ListCohorts(ctx context.Context, teacherID uuid.UUID) ([]Cohort, error) {
	rows, err := s.db.Query(ctx, `
		SELECT c.id, c.teacher_id, c.name, c.created_at, COUNT(cm.learner_id)
		FROM cohorts c
		LEFT JOIN cohort_members cm ON cm.cohort_id = c.id
		WHERE c.teacher_id = $1
		GROUP BY c.id
		ORDER BY c.created_at DESC
	`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Cohort{}
	for rows.Next() {
		var c Cohort
		if err := rows.Scan(&c.ID, &c.TeacherID, &c.Name, &c.CreatedAt, &c.StudentCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// OwnsCohort reports whether a cohort belongs to the teacher (ownership check).
func (s *TeacherStore) OwnsCohort(ctx context.Context, teacherID, cohortID uuid.UUID) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM cohorts WHERE id = $1 AND teacher_id = $2`, cohortID, teacherID).Scan(&n)
	return n > 0, err
}

// AddCohortMember enrols a learner into a cohort (idempotent).
func (s *TeacherStore) AddCohortMember(ctx context.Context, cohortID, learnerID uuid.UUID) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO cohort_members (cohort_id, learner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		cohortID, learnerID)
	return err
}

// RemoveCohortMember removes a learner from a cohort, in one transaction, and
// cleans up so the removal actually sticks: it drops the membership, deletes any
// invite row for this pair (so the teacher can cleanly re-invite later), and clears
// any per-assignment targeting in this cohort. Removing the membership already hides
// the cohort's assignments from the learner (their learner-facing queries JOIN
// cohort_members); the target cleanup just avoids leaving orphan rows. Idempotent —
// removing someone who isn't a member is a no-op.
func (s *TeacherStore) RemoveCohortMember(ctx context.Context, cohortID, learnerID uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM cohort_members WHERE cohort_id = $1 AND learner_id = $2`, cohortID, learnerID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM cohort_invites WHERE cohort_id = $1 AND learner_id = $2`, cohortID, learnerID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM assignment_targets WHERE learner_id = $2 AND assignment_id IN (SELECT id FROM assignments WHERE cohort_id = $1)`,
		cohortID, learnerID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// TeacherCanViewLearner reports whether the learner is in any cohort owned by the teacher.
func (s *TeacherStore) TeacherCanViewLearner(ctx context.Context, teacherID, learnerID uuid.UUID) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM cohort_members cm
		JOIN cohorts c ON c.id = cm.cohort_id
		WHERE c.teacher_id = $1 AND cm.learner_id = $2
	`, teacherID, learnerID).Scan(&n)
	return n > 0, err
}

type Assignment struct {
	ID           uuid.UUID  `json:"id"`
	CohortID     uuid.UUID  `json:"cohortId"`
	CohortName   string     `json:"cohortName,omitempty"`
	TeacherID    uuid.UUID  `json:"teacherId"`
	Title        string     `json:"title"`
	TargetSkills []string   `json:"targetSkills"`
	MinExercises int        `json:"minExercises"`
	Deadline     *time.Time `json:"deadline"`
	CreatedAt    time.Time  `json:"createdAt"`
	// TargetCount narrows the audience: 0 = the whole cohort, N = the N students
	// listed in assignment_targets.
	TargetCount int `json:"targetCount"`
	// ContentCount = attached Студия materials (assignment_content rows).
	ContentCount int `json:"contentCount"`
	// TimePerQuestionSec > 0 puts a countdown on every question (teacher-set).
	TimePerQuestionSec int `json:"timePerQuestionSec"`
}

// AllMembersOfCohort verifies EVERY id in learnerIDs is a member of the cohort —
// the guard that stops an assignment from being targeted at someone outside the
// class (which would leak it via the learner-facing list).
func (s *TeacherStore) AllMembersOfCohort(ctx context.Context, cohortID uuid.UUID, learnerIDs []uuid.UUID) (bool, error) {
	if len(learnerIDs) == 0 {
		return true, nil
	}
	var n int
	err := s.db.QueryRow(ctx, `
		SELECT count(DISTINCT learner_id) FROM cohort_members
		WHERE cohort_id = $1 AND learner_id = ANY($2)
	`, cohortID, learnerIDs).Scan(&n)
	if err != nil {
		return false, err
	}
	// count(DISTINCT) vs len of the deduped input
	uniq := map[uuid.UUID]bool{}
	for _, id := range learnerIDs {
		uniq[id] = true
	}
	return n == len(uniq), nil
}

// CreateAssignment inserts the assignment, its per-student targets and its
// attached Студия materials atomically. Empty targets = the whole cohort;
// empty content = a plain skills assignment (back-compatible).
func (s *TeacherStore) CreateAssignment(ctx context.Context, teacherID, cohortID uuid.UUID, title string, skills []string, minEx int, deadline *time.Time, targets, contentIDs []uuid.UUID, timePerQuestionSec int) (*Assignment, error) {
	a := &Assignment{TeacherID: teacherID, CohortID: cohortID, Title: title, TargetSkills: skills, MinExercises: minEx, Deadline: deadline, TargetCount: len(targets), ContentCount: len(contentIDs), TimePerQuestionSec: timePerQuestionSec}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err := tx.QueryRow(ctx, `
		INSERT INTO assignments (cohort_id, teacher_id, title, target_skills, min_exercises, deadline, time_per_question_sec)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at
	`, cohortID, teacherID, title, skills, minEx, deadline, timePerQuestionSec).Scan(&a.ID, &a.CreatedAt); err != nil {
		return nil, err
	}
	for _, lid := range targets {
		if _, err := tx.Exec(ctx,
			`INSERT INTO assignment_targets (assignment_id, learner_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			a.ID, lid); err != nil {
			return nil, err
		}
	}
	for _, cid := range contentIDs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO assignment_content (assignment_id, content_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			a.ID, cid); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return a, nil
}

func (s *TeacherStore) ListAssignments(ctx context.Context, teacherID uuid.UUID) ([]Assignment, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.cohort_id, COALESCE(c.name, ''), a.teacher_id, a.title, a.target_skills,
		       a.min_exercises, a.deadline, a.created_at, a.time_per_question_sec,
		       (SELECT count(*) FROM assignment_targets t WHERE t.assignment_id = a.id) AS target_count,
		       (SELECT count(*) FROM assignment_content ac WHERE ac.assignment_id = a.id) AS content_count
		FROM assignments a
		LEFT JOIN cohorts c ON c.id = a.cohort_id
		WHERE a.teacher_id = $1 ORDER BY a.created_at DESC
	`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Assignment{}
	for rows.Next() {
		var a Assignment
		if err := rows.Scan(&a.ID, &a.CohortID, &a.CohortName, &a.TeacherID, &a.Title, &a.TargetSkills, &a.MinExercises, &a.Deadline, &a.CreatedAt, &a.TimePerQuestionSec, &a.TargetCount, &a.ContentCount); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// LearnerAssignment is the student-facing view of an assignment.
type LearnerAssignment struct {
	ID           uuid.UUID  `json:"id"`
	Title        string     `json:"title"`
	CohortName   string     `json:"cohortName"`
	TeacherEmail string     `json:"teacherEmail"`
	TargetSkills []string   `json:"targetSkills"`
	MinExercises int        `json:"minExercises"`
	Deadline     *time.Time `json:"deadline"`
	CreatedAt    time.Time  `json:"createdAt"`
	// ContentCount > 0 means the teacher attached playable Студия materials.
	ContentCount int `json:"contentCount"`
	// TimePerQuestionSec > 0 = teacher-set countdown per question.
	TimePerQuestionSec int `json:"timePerQuestionSec"`
	// CompletedAt is set once this learner finished the assignment's materials.
	CompletedAt *time.Time `json:"completedAt"`
	// First-attempt outcome (teacher assignments are single-attempt): the score
	// and per-step results recorded when the learner finished.
	ScoreCorrect int             `json:"scoreCorrect"`
	ScoreTotal   int             `json:"scoreTotal"`
	Results      json.RawMessage `json:"results"`
	// PracticeDone: for practice-skills assignments (no attached materials),
	// how many adaptive exercises the learner has answered since it was set —
	// progress toward min_exercises, at which point it auto-completes.
	PracticeDone int `json:"practiceDone"`
}

// ListAssignmentsForLearner returns the assignments visible to a learner: those
// of cohorts they belong to that are either untargeted (whole cohort) or
// explicitly targeted at them.
func (s *TeacherStore) ListAssignmentsForLearner(ctx context.Context, learnerID uuid.UUID) ([]LearnerAssignment, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.title, c.name, u.email, a.target_skills, a.min_exercises, a.deadline, a.created_at,
		       a.time_per_question_sec,
		       (SELECT count(*) FROM assignment_content ac WHERE ac.assignment_id = a.id) AS content_count,
		       comp.completed_at,
		       COALESCE(comp.score_correct, 0), COALESCE(comp.score_total, 0),
		       COALESCE(comp.results, '[]'::jsonb),
		       CASE WHEN EXISTS (SELECT 1 FROM assignment_content ac2 WHERE ac2.assignment_id = a.id) THEN 0
		            ELSE (SELECT count(*) FROM exercise_results er WHERE er.learner_id = $1 AND er.timestamp >= a.created_at)
		                 + COALESCE((SELECT sum(l.answered_count) FROM curriculum_practice_log l
		                             WHERE l.learner_id = $1 AND l.logged_at >= a.created_at), 0)
		       END AS practice_done
		FROM assignments a
		JOIN cohorts c ON c.id = a.cohort_id
		JOIN cohort_members cm ON cm.cohort_id = c.id AND cm.learner_id = $1
		JOIN users u ON u.id = a.teacher_id
		LEFT JOIN assignment_completions comp ON comp.assignment_id = a.id AND comp.learner_id = $1
		WHERE NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		   OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = $1)
		ORDER BY a.deadline ASC NULLS LAST, a.created_at DESC
	`, learnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LearnerAssignment{}
	for rows.Next() {
		var la LearnerAssignment
		if err := rows.Scan(&la.ID, &la.Title, &la.CohortName, &la.TeacherEmail, &la.TargetSkills, &la.MinExercises, &la.Deadline, &la.CreatedAt, &la.TimePerQuestionSec, &la.ContentCount, &la.CompletedAt, &la.ScoreCorrect, &la.ScoreTotal, &la.Results, &la.PracticeDone); err != nil {
			return nil, err
		}
		out = append(out, la)
	}
	return out, rows.Err()
}

// CompleteAssignment marks the assignment done for this learner — but ONLY if
// the assignment is actually visible to them (member of its cohort and
// untargeted-or-targeted), so a learner can't "complete" someone else's task.
// Single-attempt semantics: the FIRST completion's results and score are kept
// forever (ON CONFLICT DO NOTHING) — replays can never improve or erase them.
// The second return ("newly") is true only when THIS call inserted the
// completion — one-shot side effects (XP, teacher notification) key off it so
// a replayed POST can't double-award.
func (s *TeacherStore) CompleteAssignment(ctx context.Context, learnerID, assignmentID uuid.UUID, resultsJSON []byte, scoreCorrect, scoreTotal int) (completed, newly bool, err error) {
	if len(resultsJSON) == 0 {
		resultsJSON = []byte("[]")
	}
	tag, err := s.db.Exec(ctx, `
		INSERT INTO assignment_completions (assignment_id, learner_id, results, score_correct, score_total)
		SELECT a.id, $1, $3::jsonb, $4, $5
		FROM assignments a
		JOIN cohort_members cm ON cm.cohort_id = a.cohort_id AND cm.learner_id = $1
		WHERE a.id = $2
		  AND (NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		       OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = $1))
		ON CONFLICT (assignment_id, learner_id) DO NOTHING
	`, learnerID, assignmentID, resultsJSON, scoreCorrect, scoreTotal)
	if err != nil {
		return false, false, err
	}
	if tag.RowsAffected() > 0 {
		return true, true, nil
	}
	// 0 rows = either already completed (fine) or not visible (reject). Distinguish:
	var n int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM assignment_completions WHERE assignment_id = $1 AND learner_id = $2`,
		assignmentID, learnerID).Scan(&n); err != nil {
		return false, false, err
	}
	return n > 0, false, nil
}

// AutoCompletePracticeAssignments closes the loop for practice-skills
// assignments (no attached materials): once the learner's work SINCE the
// assignment was set — adaptive exercises PLUS curriculum-Path questions (via
// curriculum_practice_log) — reaches min_exercises, it counts as done
// regardless of how well they scored. The recorded score covers only the
// adaptive exercises (Path answers carry no per-question correctness); 0/0
// renders as "—" rather than fabricating a result. Called after adaptive
// session completion, after every curriculum sync, and when the learner lists
// their assignments (self-heals work done before this feature existed).
// Returns the ids of assignments completed by THIS call (empty when nothing
// crossed the bar) so handlers can push a live notification to the teacher.
func (s *TeacherStore) AutoCompletePracticeAssignments(ctx context.Context, learnerID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := s.db.Query(ctx, `
		INSERT INTO assignment_completions (assignment_id, learner_id, results, score_correct, score_total)
		SELECT a.id, $1, '[]'::jsonb, s.er_correct, s.er_total
		FROM assignments a
		JOIN cohort_members cm ON cm.cohort_id = a.cohort_id AND cm.learner_id = $1
		CROSS JOIN LATERAL (
			SELECT
				(SELECT count(*) FILTER (WHERE er.is_correct) FROM exercise_results er
				  WHERE er.learner_id = $1 AND er.timestamp >= a.created_at) AS er_correct,
				(SELECT count(*) FROM exercise_results er
				  WHERE er.learner_id = $1 AND er.timestamp >= a.created_at) AS er_total,
				COALESCE((SELECT sum(l.answered_count) FROM curriculum_practice_log l
				  WHERE l.learner_id = $1 AND l.logged_at >= a.created_at), 0) AS path_total
		) s
		WHERE NOT EXISTS (SELECT 1 FROM assignment_content ac WHERE ac.assignment_id = a.id)
		  AND (NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		       OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = $1))
		  AND s.er_total + s.path_total >= a.min_exercises
		ON CONFLICT (assignment_id, learner_id) DO NOTHING
		RETURNING assignment_id
	`, learnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// AssignmentNotifyInfo resolves who to tell (the assignment's teacher, by USER
// id) and what to say (title + which student) for a completion push event.
type AssignmentNotifyInfo struct {
	TeacherUserID uuid.UUID
	CohortID      uuid.UUID
	Title         string
	LearnerName   string
}

func (s *TeacherStore) GetAssignmentNotifyInfo(ctx context.Context, assignmentID, learnerID uuid.UUID) (*AssignmentNotifyInfo, error) {
	var info AssignmentNotifyInfo
	err := s.db.QueryRow(ctx, `
		SELECT a.teacher_id, a.cohort_id, a.title, COALESCE(lp.display_name, 'Ученик')
		FROM assignments a
		LEFT JOIN learner_profiles lp ON lp.id = $2
		WHERE a.id = $1
	`, assignmentID, learnerID).Scan(&info.TeacherUserID, &info.CohortID, &info.Title, &info.LearnerName)
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// ---------------- Answer sheet (full-page review) ----------------

// PracticeAnswer is one adaptive exercise the learner answered while working
// on a practice assignment — pulled from exercise_results, which records the
// actual response and verdict for every adaptive question.
type PracticeAnswer struct {
	AnsweredAt    time.Time `json:"answeredAt"`
	Type          string    `json:"type"` // adaptive: exercise type; Path: lesson id
	Prompt        string    `json:"prompt"`
	Response      string    `json:"response"`
	CorrectAnswer string    `json:"correctAnswer"`
	IsCorrect     bool      `json:"isCorrect"`
	// QuestionID is set for Path answers only — lets the review page dedupe
	// recorded answers against the blob's seen-question reconstruction.
	QuestionID string `json:"questionId,omitempty"`
}

// PathAnswerIn is one answered Path question as reported by the client's
// lesson runner (the server has no curriculum content, so the client sends
// prompt + correct answer along with the verdict).
type PathAnswerIn struct {
	QuestionID    string `json:"questionId"`
	LessonID      string `json:"lessonId"`
	Prompt        string `json:"prompt"`
	Response      string `json:"response"`
	CorrectAnswer string `json:"correctAnswer"`
	IsCorrect     bool   `json:"isCorrect"`
}

// RecordPathAnswers appends a batch of answered Path questions. Fire-and-forget
// from the client's perspective; the handler has already capped and sanitized.
func (s *TeacherStore) RecordPathAnswers(ctx context.Context, learnerID uuid.UUID, answers []PathAnswerIn) error {
	for _, a := range answers {
		if _, err := s.db.Exec(ctx, `
			INSERT INTO path_answers (learner_id, question_id, lesson_id, prompt, response, correct_answer, is_correct)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, learnerID, a.QuestionID, a.LessonID, a.Prompt, a.Response, a.CorrectAnswer, a.IsCorrect); err != nil {
			return err
		}
	}
	return nil
}

// PathSeenLesson reconstructs history from the learner's progress blob: WHICH
// questions they saw in a lesson/exam (ids resolve to full question content on
// the client, which bundles the curriculum) plus the lesson's aggregate score.
// This is how pre-recording work (e.g. Anton's prct) still shows its questions
// even though the answers themselves were never captured.
type PathSeenLesson struct {
	LessonID    string   `json:"lessonId"`
	QuestionIDs []string `json:"questionIds"`
	BestScore   float64  `json:"bestScore"`
	Attempts    int      `json:"attempts"`
}

// AnswerSheet is everything the dedicated review page needs for one student ×
// one assignment: for materials tasks the recorded per-question results; for
// practice tasks the adaptive answers + recorded Path answers in the window,
// plus the blob-reconstructed question list for work done before recording.
type AnswerSheet struct {
	AssignmentID       uuid.UUID        `json:"assignmentId"`
	Title              string           `json:"title"`
	LearnerName        string           `json:"learnerName"`
	CreatedAt          time.Time        `json:"createdAt"`
	CompletedAt        *time.Time       `json:"completedAt"`
	ScoreCorrect       int              `json:"scoreCorrect"`
	ScoreTotal         int              `json:"scoreTotal"`
	ContentCount       int              `json:"contentCount"`
	TimePerQuestionSec int              `json:"timePerQuestionSec"`
	Results            json.RawMessage  `json:"results"`
	Practice           []PracticeAnswer `json:"practice"`
	PathAnswers        []PracticeAnswer `json:"pathAnswers"`
	PathSeen           []PathSeenLesson `json:"pathSeen"`
	PathQuestions      int              `json:"pathQuestions"`
}

// AssignmentAnswers builds the sheet. Scoped hard: the assignment must belong
// to the given cohort AND the learner must be a member of it — the handler has
// already verified the caller owns (or dean-views) the cohort.
func (s *TeacherStore) AssignmentAnswers(ctx context.Context, cohortID, learnerID, assignmentID uuid.UUID) (*AnswerSheet, error) {
	var sheet AnswerSheet
	sheet.AssignmentID = assignmentID
	err := s.db.QueryRow(ctx, `
		SELECT a.title, a.created_at, a.time_per_question_sec,
		       (SELECT count(*) FROM assignment_content ac WHERE ac.assignment_id = a.id),
		       COALESCE(lp.display_name, 'Ученик'),
		       comp.completed_at, COALESCE(comp.score_correct, 0), COALESCE(comp.score_total, 0),
		       COALESCE(comp.results, '[]'::jsonb)
		FROM assignments a
		JOIN cohort_members cm ON cm.cohort_id = a.cohort_id AND cm.learner_id = $2
		JOIN learner_profiles lp ON lp.id = $2
		LEFT JOIN assignment_completions comp ON comp.assignment_id = a.id AND comp.learner_id = $2
		WHERE a.id = $3 AND a.cohort_id = $1
	`, cohortID, learnerID, assignmentID).Scan(
		&sheet.Title, &sheet.CreatedAt, &sheet.TimePerQuestionSec, &sheet.ContentCount,
		&sheet.LearnerName, &sheet.CompletedAt, &sheet.ScoreCorrect, &sheet.ScoreTotal, &sheet.Results)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	sheet.Practice = []PracticeAnswer{}
	// Practice assignments: the adaptive answers in the assignment's window
	// ARE recorded — surface them. (Materials tasks skip this; their record
	// is the results JSONB above.)
	if sheet.ContentCount == 0 {
		end := time.Now()
		if sheet.CompletedAt != nil {
			end = *sheet.CompletedAt
		}
		rows, err := s.db.Query(ctx, `
			SELECT er.timestamp,
			       COALESCE(ca.exercise_type::text, ''),
			       COALESCE(ca.content_data->>'promptEn', ca.content_data->>'promptRu', ca.content_data->>'prompt_en', ''),
			       er.response, er.correct_answer, er.is_correct
			FROM exercise_results er
			LEFT JOIN content_atoms ca ON ca.id = er.content_id
			WHERE er.learner_id = $1 AND er.timestamp >= $2 AND er.timestamp <= $3
			ORDER BY er.timestamp ASC
			LIMIT 300
		`, learnerID, sheet.CreatedAt, end)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var p PracticeAnswer
			if err := rows.Scan(&p.AnsweredAt, &p.Type, &p.Prompt, &p.Response, &p.CorrectAnswer, &p.IsCorrect); err != nil {
				return nil, err
			}
			sheet.Practice = append(sheet.Practice, p)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if err := s.db.QueryRow(ctx, `
			SELECT COALESCE(sum(l.answered_count), 0) FROM curriculum_practice_log l
			WHERE l.learner_id = $1 AND l.logged_at >= $2 AND l.logged_at <= $3
		`, learnerID, sheet.CreatedAt, end).Scan(&sheet.PathQuestions); err != nil {
			return nil, err
		}
		// Recorded Path answers in the window (captured by the lesson runner).
		parows, err := s.db.Query(ctx, `
			SELECT answered_at, lesson_id, question_id, prompt, response, correct_answer, is_correct
			FROM path_answers
			WHERE learner_id = $1 AND answered_at >= $2 AND answered_at <= $3
			ORDER BY answered_at ASC
			LIMIT 300
		`, learnerID, sheet.CreatedAt, end)
		if err != nil {
			return nil, err
		}
		defer parows.Close()
		for parows.Next() {
			var p PracticeAnswer
			if err := parows.Scan(&p.AnsweredAt, &p.Type, &p.QuestionID, &p.Prompt, &p.Response, &p.CorrectAnswer, &p.IsCorrect); err != nil {
				return nil, err
			}
			sheet.PathAnswers = append(sheet.PathAnswers, p)
		}
		if err := parows.Err(); err != nil {
			return nil, err
		}
		// Blob reconstruction: which questions the learner has SEEN in the Path
		// (with the lesson's aggregate score) — the only record for work done
		// before per-answer capture shipped.
		var blob []byte
		err = s.db.QueryRow(ctx, `
			SELECT cp.data FROM curriculum_progress cp
			JOIN learner_profiles lp ON lp.user_id = cp.user_id
			WHERE lp.id = $1
		`, learnerID).Scan(&blob)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		if len(blob) > 0 {
			type item struct {
				BestScore       float64  `json:"bestScore"`
				Attempts        float64  `json:"attempts"`
				SeenQuestionIDs []string `json:"seenQuestionIds"`
			}
			var prog struct {
				Lessons map[string]item `json:"lessons"`
				Exams   map[string]item `json:"exams"`
			}
			if json.Unmarshal(blob, &prog) == nil {
				for _, m := range []map[string]item{prog.Lessons, prog.Exams} {
					for id, it := range m {
						if len(it.SeenQuestionIDs) > 0 {
							sheet.PathSeen = append(sheet.PathSeen, PathSeenLesson{
								LessonID:    id,
								QuestionIDs: it.SeenQuestionIDs,
								BestScore:   it.BestScore,
								Attempts:    int(it.Attempts),
							})
						}
					}
				}
				sort.Slice(sheet.PathSeen, func(i, j int) bool { return sheet.PathSeen[i].LessonID < sheet.PathSeen[j].LessonID })
			}
		}
	}
	if sheet.PathAnswers == nil {
		sheet.PathAnswers = []PracticeAnswer{}
	}
	if sheet.PathSeen == nil {
		sheet.PathSeen = []PathSeenLesson{}
	}
	return &sheet, nil
}

// ---------------- Period report (day / week / month) ----------------

// ReportRow is one student's activity summary for a date range: assignment
// throughput + scores, practice volume, and XP — the teacher's (and dean's)
// end-of-period view.
type ReportRow struct {
	LearnerID     uuid.UUID       `json:"learnerId"`
	Name          string          `json:"name"`
	Completed     int             `json:"completed"`     // assignments finished in range
	AssignedTotal int             `json:"assignedTotal"` // assignments visible to them created up to range end
	ScoreCorrect  int             `json:"scoreCorrect"`  // summed over in-range completions
	ScoreTotal    int             `json:"scoreTotal"`
	Exercises     int             `json:"exercises"` // adaptive exercises answered in range
	ExercisesOK   int             `json:"exercisesOk"`
	PathQuestions int             `json:"pathQuestions"` // curriculum-Path questions in range
	XPEarned      int             `json:"xpEarned"`      // XP attributable to in-range work
	TotalXP       int             `json:"totalXp"`       // lifetime, as of now
	LastActive    *time.Time      `json:"lastActive"`
	Comments      []ReportComment `json:"comments"`
}

type ReportComment struct {
	ID           uuid.UUID `json:"id"`
	LearnerID    uuid.UUID `json:"learnerId"`
	TeacherEmail string    `json:"teacherEmail"`
	Comment      string    `json:"comment"`
	CreatedAt    time.Time `json:"createdAt"`
}

// CohortReport aggregates per-student activity between from (inclusive) and
// to (exclusive). XPEarned mirrors how XP is actually awarded: session XP +
// 2/path question + assignment deltas (+10 correct / −5 miss, +20 practice).
func (s *TeacherStore) CohortReport(ctx context.Context, cohortID uuid.UUID, from, to time.Time) ([]ReportRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT lp.id, lp.display_name,
		       comp.done, comp.sc, comp.st, comp.materials_done, comp.practice_done,
		       (SELECT count(*) FROM assignments a
		         WHERE a.cohort_id = $1 AND a.created_at < $3
		           AND (NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		                OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = lp.id))
		       ) AS assigned_total,
		       er.total, er.ok,
		       COALESCE((SELECT sum(l.answered_count) FROM curriculum_practice_log l
		                 WHERE l.learner_id = lp.id AND l.logged_at >= $2 AND l.logged_at < $3), 0) AS path_q,
		       COALESCE((SELECT sum(se.total_xp) FROM sessions se
		                 WHERE se.learner_id = lp.id AND se.completed_at >= $2 AND se.completed_at < $3), 0) AS session_xp,
		       COALESCE(ls.total_xp, 0), ls.last_active
		FROM cohort_members cm
		JOIN learner_profiles lp ON lp.id = cm.learner_id
		LEFT JOIN learner_streaks ls ON ls.learner_id = lp.id
		CROSS JOIN LATERAL (
			SELECT count(*) AS done,
			       COALESCE(sum(c.score_correct), 0) AS sc,
			       COALESCE(sum(c.score_total), 0) AS st,
			       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM assignment_content ac WHERE ac.assignment_id = c.assignment_id)) AS materials_done,
			       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM assignment_content ac WHERE ac.assignment_id = c.assignment_id)) AS practice_done
			FROM assignment_completions c
			JOIN assignments a2 ON a2.id = c.assignment_id
			WHERE c.learner_id = lp.id AND a2.cohort_id = $1
			  AND c.completed_at >= $2 AND c.completed_at < $3
		) comp
		CROSS JOIN LATERAL (
			SELECT count(*) AS total, count(*) FILTER (WHERE e.is_correct) AS ok
			FROM exercise_results e
			WHERE e.learner_id = lp.id AND e.timestamp >= $2 AND e.timestamp < $3
		) er
		WHERE cm.cohort_id = $1
		ORDER BY lp.display_name
	`, cohortID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReportRow{}
	for rows.Next() {
		var r ReportRow
		var materialsDone, practiceDone, sessionXP int
		if err := rows.Scan(&r.LearnerID, &r.Name, &r.Completed, &r.ScoreCorrect, &r.ScoreTotal,
			&materialsDone, &practiceDone, &r.AssignedTotal, &r.Exercises, &r.ExercisesOK,
			&r.PathQuestions, &sessionXP, &r.TotalXP, &r.LastActive); err != nil {
			return nil, err
		}
		// Same formula the award paths use — the report explains the balance.
		assignmentXP := 10*r.ScoreCorrect - 5*(r.ScoreTotal-r.ScoreCorrect) + 20*practiceDone
		r.XPEarned = sessionXP + 2*r.PathQuestions + assignmentXP
		r.Comments = []ReportComment{}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ReportComments returns every teacher note for this cohort and exact period,
// grouped by learner by the caller.
func (s *TeacherStore) ReportComments(ctx context.Context, cohortID uuid.UUID, from, to time.Time) ([]ReportComment, error) {
	rows, err := s.db.Query(ctx, `
		SELECT rc.id, rc.learner_id, u.email, rc.comment, rc.created_at
		FROM report_comments rc
		JOIN users u ON u.id = rc.teacher_id
		WHERE rc.cohort_id = $1 AND rc.period_start = $2::date AND rc.period_end = $3::date
		ORDER BY rc.created_at ASC
	`, cohortID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReportComment{}
	for rows.Next() {
		var c ReportComment
		if err := rows.Scan(&c.ID, &c.LearnerID, &c.TeacherEmail, &c.Comment, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AddReportComment stores a teacher's note on one student's period report.
// The learner must be a member of the cohort (blocks probing arbitrary ids).
func (s *TeacherStore) AddReportComment(ctx context.Context, cohortID, learnerID, teacherID uuid.UUID, from, to time.Time, comment string) (bool, error) {
	tag, err := s.db.Exec(ctx, `
		INSERT INTO report_comments (cohort_id, learner_id, teacher_id, period_start, period_end, comment)
		SELECT $1, $2, $3, $4::date, $5::date, $6
		WHERE EXISTS (SELECT 1 FROM cohort_members cm WHERE cm.cohort_id = $1 AND cm.learner_id = $2)
	`, cohortID, learnerID, teacherID, from, to, comment)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// RecipientUserIDs maps an assignment's audience (specific learners, or the
// whole cohort when none are given) to USER ids for push notification.
func (s *TeacherStore) RecipientUserIDs(ctx context.Context, cohortID uuid.UUID, learnerIDs []uuid.UUID) ([]uuid.UUID, error) {
	var rows pgx.Rows
	var err error
	if len(learnerIDs) > 0 {
		rows, err = s.db.Query(ctx, `SELECT DISTINCT user_id FROM learner_profiles WHERE id = ANY($1)`, learnerIDs)
	} else {
		rows, err = s.db.Query(ctx, `
			SELECT DISTINCT lp.user_id FROM cohort_members cm
			JOIN learner_profiles lp ON lp.id = cm.learner_id
			WHERE cm.cohort_id = $1`, cohortID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// AssignmentStatus is the teacher's per-student view of ONE assignment: did
// this learner finish it, when, with what score, and the per-step results of
// their single recorded attempt.
type AssignmentStatus struct {
	ID                 uuid.UUID       `json:"id"`
	Title              string          `json:"title"`
	Deadline           *time.Time      `json:"deadline"`
	CreatedAt          time.Time       `json:"createdAt"`
	ContentCount       int             `json:"contentCount"`
	TimePerQuestionSec int             `json:"timePerQuestionSec"`
	CompletedAt        *time.Time      `json:"completedAt"`
	ScoreCorrect       int             `json:"scoreCorrect"`
	ScoreTotal         int             `json:"scoreTotal"`
	Results            json.RawMessage `json:"results"`
}

// StudentAssignments lists every assignment visible to ONE learner in ONE
// cohort, with completion state + first-attempt results. The handler checks
// cohort ownership; this additionally requires the learner to be a member so
// a valid cohort id can't be used to probe an arbitrary learner's work.
func (s *TeacherStore) StudentAssignments(ctx context.Context, cohortID, learnerID uuid.UUID) ([]AssignmentStatus, error) {
	rows, err := s.db.Query(ctx, `
		SELECT a.id, a.title, a.deadline, a.created_at,
		       (SELECT count(*) FROM assignment_content ac WHERE ac.assignment_id = a.id),
		       a.time_per_question_sec,
		       comp.completed_at,
		       COALESCE(comp.score_correct, 0), COALESCE(comp.score_total, 0),
		       COALESCE(comp.results, '[]'::jsonb)
		FROM assignments a
		JOIN cohort_members cm ON cm.cohort_id = a.cohort_id AND cm.learner_id = $2
		LEFT JOIN assignment_completions comp
		       ON comp.assignment_id = a.id AND comp.learner_id = $2
		WHERE a.cohort_id = $1
		  AND (NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		       OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = $2))
		ORDER BY (comp.completed_at IS NULL) DESC, a.deadline ASC NULLS LAST, a.created_at DESC
	`, cohortID, learnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AssignmentStatus{}
	for rows.Next() {
		var st AssignmentStatus
		if err := rows.Scan(&st.ID, &st.Title, &st.Deadline, &st.CreatedAt, &st.ContentCount, &st.TimePerQuestionSec,
			&st.CompletedAt, &st.ScoreCorrect, &st.ScoreTotal, &st.Results); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

type LeaderboardRow struct {
	Rank       int    `json:"rank"`
	Name       string `json:"name"`
	XP         int    `json:"xp"`
	StreakDays int    `json:"streakDays"`
	Level      string `json:"level"`
}

// ---------------- Learner search (for enrolment) ----------------

type LearnerBrief struct {
	ID      uuid.UUID `json:"id"`
	Name    string    `json:"name"`
	Segment string    `json:"segment"`
	Level   string    `json:"level"`
}

// SearchLearners is the INDEPENDENT-teacher search: it finds learner profiles by
// display-name substring (case-insensitive) but returns ONLY unaffiliated learners
// (the consumer marketplace). Students enrolled at an institution are invisible here
// so an independent teacher can't enumerate another tenant's roster; institution
// teachers pick from their own pool via InstitutionStore.ListStudents instead.
func (s *TeacherStore) SearchLearners(ctx context.Context, query string, limit int) ([]LearnerBrief, error) {
	rows, err := s.db.Query(ctx, `
		SELECT lp.id, lp.display_name, lp.segment::text, lp.current_level::text
		FROM learner_profiles lp JOIN users u ON u.id = lp.user_id
		WHERE u.institution_id IS NULL AND lp.display_name ILIKE '%' || $1 || '%'
		ORDER BY lp.display_name LIMIT $2
	`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LearnerBrief{}
	for rows.Next() {
		var b LearnerBrief
		if err := rows.Scan(&b.ID, &b.Name, &b.Segment, &b.Level); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// ---------------- Cohort heatmap (real, from learner_skills) ----------------

type HeatmapSkill struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type HeatmapStudent struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Scores []float64 `json:"scores"`
	// Attempted[i] distinguishes "measured at Scores[i]" from "never tried this
	// skill/topic" — the UI renders the latter as a grey dash, never a red 0%.
	// Without it, catalogue seeding (0-confidence rows for every skill) painted
	// students who simply hadn't used adaptive mode as failing everything.
	Attempted []bool `json:"attempted"`
}
type Heatmap struct {
	CohortID uuid.UUID `json:"cohortId"`
	// JoinCode is the cohort's CURRENT join code ("" if none generated yet) so the
	// cohort page can show it instead of offering to (silently) rotate a live code.
	JoinCode string           `json:"joinCode"`
	Skills   []HeatmapSkill   `json:"skills"`
	Students []HeatmapStudent `json:"students"`
	// Curriculum-Path topic accuracy (from the synced progress blobs) — the truth
	// for students who learn via the Path rather than adaptive sessions.
	Topics    []HeatmapSkill   `json:"topics"`
	TopicRows []HeatmapStudent `json:"topicRows"`
}

// CohortHeatmap builds the cohort's weakness grids.
//
// HONESTY RULES (the old version failed both): (1) a skill column exists only if
// at least one member has ACTUALLY ATTEMPTED it — catalogue seeding creates a
// 0-confidence row for every skill, so "most tracked" used to select arbitrary
// seeded skills and paint everyone 0%; (2) each cell carries an attempted flag so
// "never tried" renders as a dash, never as a failing red 0. A second grid maps
// curriculum-Path TOPIC accuracy from the synced blobs, so Path-only learners
// (who never touch adaptive sessions) still show their real strengths/weaknesses.
func (s *TeacherStore) CohortHeatmap(ctx context.Context, cohortID uuid.UUID) (*Heatmap, error) {
	out := &Heatmap{CohortID: cohortID, Skills: []HeatmapSkill{}, Students: []HeatmapStudent{}, Topics: []HeatmapSkill{}, TopicRows: []HeatmapStudent{}}

	// current join code (may be empty)
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(join_code, '') FROM cohorts WHERE id = $1`, cohortID).Scan(&out.JoinCode)

	// members
	mrows, err := s.db.Query(ctx, `
		SELECT lp.id, lp.display_name FROM cohort_members cm
		JOIN learner_profiles lp ON lp.id = cm.learner_id
		WHERE cm.cohort_id = $1 ORDER BY lp.display_name
	`, cohortID)
	if err != nil {
		return nil, err
	}
	memberIDs := []uuid.UUID{}
	names := map[uuid.UUID]string{}
	for mrows.Next() {
		var id uuid.UUID
		var name string
		if err := mrows.Scan(&id, &name); err != nil {
			mrows.Close()
			return nil, err
		}
		memberIDs = append(memberIDs, id)
		names[id] = name
	}
	mrows.Close()
	if err := mrows.Err(); err != nil {
		return nil, err
	}
	if len(memberIDs) == 0 {
		return out, nil
	}

	// ---- Adaptive-skill grid: columns = most-ATTEMPTED skills ----
	// The OUTER ORDER BY matters: a subquery's ORDER BY only decides which rows
	// survive its LIMIT — the join would otherwise emit columns in the skills
	// table's physical order, reshuffling the grid between refreshes.
	skillIDs := []string{}
	srows, err := s.db.Query(ctx, `
		SELECT s.skill_id, s.display_name_en
		FROM skills s
		JOIN (
			SELECT skill_id, COUNT(*) c FROM learner_skills
			WHERE learner_id = ANY($1) AND total_attempts > 0
			GROUP BY skill_id ORDER BY c DESC, skill_id LIMIT 8
		) t ON t.skill_id = s.skill_id
		ORDER BY t.c DESC, s.skill_id
	`, memberIDs)
	if err != nil {
		return nil, err
	}
	for srows.Next() {
		var hs HeatmapSkill
		if err := srows.Scan(&hs.ID, &hs.Name); err != nil {
			srows.Close()
			return nil, err
		}
		out.Skills = append(out.Skills, hs)
		skillIDs = append(skillIDs, hs.ID)
	}
	srows.Close()
	if err := srows.Err(); err != nil {
		// A mid-stream failure would silently truncate columns — surface it rather
		// than presenting a partial grid as the complete truth.
		return nil, err
	}
	// No catalogue fallback: an all-seeded wall of fake zeros is worse than an
	// empty grid with an honest "no adaptive data yet" message.

	type cell struct {
		score     float64
		attempted bool
	}
	conf := map[uuid.UUID]map[string]cell{}
	if len(skillIDs) > 0 {
		crows, err := s.db.Query(ctx, `
			SELECT learner_id, skill_id, confidence::float8, total_attempts > 0
			FROM learner_skills WHERE learner_id = ANY($1) AND skill_id = ANY($2)
		`, memberIDs, skillIDs)
		if err != nil {
			return nil, err
		}
		for crows.Next() {
			var lid uuid.UUID
			var sid string
			var c float64
			var att bool
			if err := crows.Scan(&lid, &sid, &c, &att); err != nil {
				crows.Close()
				return nil, err
			}
			if conf[lid] == nil {
				conf[lid] = map[string]cell{}
			}
			conf[lid][sid] = cell{score: c, attempted: att}
		}
		crows.Close()
		if err := crows.Err(); err != nil {
			// Truncated cells would render as grey "never attempted" dashes for
			// students who DO have measurements — the exact lie this grid forbids.
			return nil, err
		}
	}
	for _, id := range memberIDs {
		scores := make([]float64, len(skillIDs))
		att := make([]bool, len(skillIDs))
		for i, sid := range skillIDs {
			if m := conf[id]; m != nil {
				scores[i] = m[sid].score
				att[i] = m[sid].attempted
			}
		}
		out.Students = append(out.Students, HeatmapStudent{ID: id, Name: names[id], Scores: scores, Attempted: att})
	}

	// ---- Curriculum-Path topic grid: rolling per-topic accuracy from the blobs ----
	// Defensive casts mirror migration 019 — the blob is client-written JSON.
	trows, err := s.db.Query(ctx, `
		SELECT lp.id, t.key,
		       CASE WHEN t.value->>'correct' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (t.value->>'correct')::float8 ELSE 0 END,
		       CASE WHEN t.value->>'total'   ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (t.value->>'total')::float8   ELSE 0 END
		FROM learner_profiles lp
		JOIN curriculum_progress cp ON cp.user_id = lp.user_id
		CROSS JOIN LATERAL jsonb_each(cp.data::jsonb->'topics') AS t(key, value)
		WHERE lp.id = ANY($1)
		  AND jsonb_typeof(cp.data::jsonb->'topics') = 'object'
		  AND jsonb_typeof(t.value) = 'object'
	`, memberIDs)
	if err != nil {
		return nil, err
	}
	type topicCell struct {
		correct, total float64
	}
	perLearner := map[uuid.UUID]map[string]topicCell{}
	topicWeight := map[string]float64{} // how much real activity a topic has, across the cohort
	for trows.Next() {
		var lid uuid.UUID
		var topic string
		var correct, total float64
		if err := trows.Scan(&lid, &topic, &correct, &total); err != nil {
			trows.Close()
			return nil, err
		}
		if total <= 0 {
			continue
		}
		if perLearner[lid] == nil {
			perLearner[lid] = map[string]topicCell{}
		}
		perLearner[lid][topic] = topicCell{correct: correct, total: total}
		topicWeight[topic] += total
	}
	trows.Close()
	if err := trows.Err(); err != nil {
		return nil, err
	}

	// Top 8 topics by cohort-wide activity, stable order.
	type tw struct {
		topic  string
		weight float64
	}
	weights := make([]tw, 0, len(topicWeight))
	for k, v := range topicWeight {
		weights = append(weights, tw{k, v})
	}
	sort.Slice(weights, func(i, j int) bool {
		if weights[i].weight != weights[j].weight {
			return weights[i].weight > weights[j].weight
		}
		return weights[i].topic < weights[j].topic
	})
	if len(weights) > 8 {
		weights = weights[:8]
	}
	topicIDs := make([]string, 0, len(weights))
	for _, w := range weights {
		out.Topics = append(out.Topics, HeatmapSkill{ID: w.topic, Name: w.topic})
		topicIDs = append(topicIDs, w.topic)
	}
	if len(topicIDs) > 0 {
		for _, id := range memberIDs {
			scores := make([]float64, len(topicIDs))
			att := make([]bool, len(topicIDs))
			for i, topic := range topicIDs {
				if m := perLearner[id]; m != nil {
					if c, ok := m[topic]; ok && c.total > 0 {
						acc := c.correct / c.total
						if acc < 0 {
							acc = 0
						} else if acc > 1 {
							acc = 1
						}
						scores[i] = acc
						att[i] = true
					}
				}
			}
			out.TopicRows = append(out.TopicRows, HeatmapStudent{ID: id, Name: names[id], Scores: scores, Attempted: att})
		}
	}
	return out, nil
}

// ---------------- Cohort roster (classroom view) ----------------

// RosterStudent is one desk in the classroom view: identity + the same honest
// per-student signals the command center uses (earned mastery, started, activity).
type RosterStudent struct {
	ID                uuid.UUID  `json:"id"`
	Name              string     `json:"name"`
	Level             string     `json:"level"`
	EffMastery        float64    `json:"effMastery"`
	HasWork           bool       `json:"hasWork"`
	LastActive        *time.Time `json:"lastActive"`
	CurriculumLessons int        `json:"curriculumLessons"`
	TotalXP           int        `json:"totalXp"`
	// Assignment progress within THIS cohort: how many assignments are visible to
	// this student, how many they completed, and when they last completed one.
	AssignedCount   int        `json:"assignedCount"`
	CompletedCount  int        `json:"completedCount"`
	LastCompletedAt *time.Time `json:"lastCompletedAt"`
}

// CohortRoster lists a cohort's members with per-student stats for the
// classroom view. Same eff-mastery blend as TeacherC2 so the desk badge never
// disagrees with the command center.
func (s *TeacherStore) CohortRoster(ctx context.Context, cohortID uuid.UUID) ([]RosterStudent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT lp.id, lp.display_name, lp.current_level::text,
		       GREATEST(COALESCE(x.avg_conf, 0), COALESCE(st.curriculum_mastery, 0))::float8 AS eff,
		       (COALESCE(x.att, 0) > 0 OR COALESCE(st.curriculum_lessons, 0) > 0) AS has_work,
		       st.last_active,
		       COALESCE(st.curriculum_lessons, 0),
		       COALESCE(st.total_xp, 0),
		       -- Assignments in this cohort VISIBLE to this student (untargeted or
		       -- targeted at them) — the same predicate the learner's own list uses.
		       (SELECT count(*) FROM assignments a WHERE a.cohort_id = $1
		         AND (NOT EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id)
		              OR EXISTS (SELECT 1 FROM assignment_targets t WHERE t.assignment_id = a.id AND t.learner_id = lp.id))) AS assigned,
		       (SELECT count(*) FROM assignment_completions co
		         JOIN assignments a2 ON a2.id = co.assignment_id
		         WHERE co.learner_id = lp.id AND a2.cohort_id = $1) AS completed,
		       (SELECT max(co.completed_at) FROM assignment_completions co
		         JOIN assignments a3 ON a3.id = co.assignment_id
		         WHERE co.learner_id = lp.id AND a3.cohort_id = $1) AS last_completed
		FROM cohort_members cm
		JOIN learner_profiles lp ON lp.id = cm.learner_id
		LEFT JOIN learner_streaks st ON st.learner_id = lp.id
		LEFT JOIN (
			SELECT learner_id, avg(confidence)::float8 avg_conf, sum(total_attempts) att
			FROM learner_skills WHERE total_attempts > 0 GROUP BY learner_id
		) x ON x.learner_id = lp.id
		WHERE cm.cohort_id = $1
		ORDER BY lp.display_name`, cohortID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RosterStudent{}
	for rows.Next() {
		var r RosterStudent
		if err := rows.Scan(&r.ID, &r.Name, &r.Level, &r.EffMastery, &r.HasWork, &r.LastActive, &r.CurriculumLessons, &r.TotalXP,
			&r.AssignedCount, &r.CompletedCount, &r.LastCompletedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ---------------- Student report (real aggregation) ----------------

type WeakSkill struct {
	Name       string  `json:"name"`
	Confidence float64 `json:"confidence"`
}
type StudentReport struct {
	StudentID     uuid.UUID `json:"studentId"`
	Name          string    `json:"name"`
	Level         string    `json:"level"`
	AvgConfidence float64   `json:"avgConfidence"`
	SkillsTracked int       `json:"skillsTracked"`
	MasteredCount int       `json:"masteredCount"`
	TotalSessions int       `json:"totalSessions"`
	TotalXP       int       `json:"totalXp"`
	// CurriculumLessons = Path lessons/exams the student actually attempted
	// (earned work — placement "tested out" entries don't count).
	CurriculumLessons int         `json:"curriculumLessons"`
	WeakSkills        []WeakSkill `json:"weakSkills"`
}

// StudentReport aggregates a learner's real skill, streak and XP data.
func (s *TeacherStore) StudentReport(ctx context.Context, learnerID uuid.UUID) (*StudentReport, error) {
	rep := &StudentReport{StudentID: learnerID, WeakSkills: []WeakSkill{}}

	err := s.db.QueryRow(ctx,
		`SELECT display_name, current_level::text FROM learner_profiles WHERE id = $1`, learnerID).
		Scan(&rep.Name, &rep.Level)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // not found
	}
	if err != nil {
		return nil, err
	}

	// streaks (may not exist yet) — also read the curriculum-Path mastery bridge so
	// a student who learns via the Path (not adaptive sessions) isn't shown as 0%.
	var curMastery float64
	if err := s.db.QueryRow(ctx,
		`SELECT COALESCE(total_sessions,0), COALESCE(total_xp,0), COALESCE(curriculum_mastery,0)::float8, COALESCE(curriculum_lessons,0)
		 FROM learner_streaks WHERE learner_id = $1`, learnerID).
		Scan(&rep.TotalSessions, &rep.TotalXP, &curMastery, &rep.CurriculumLessons); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// Skill aggregate — ATTEMPTED skills only, matching the command-center
	// eff_mast definition exactly. InitializeSkills seeds a 0-confidence row for
	// every catalogue skill at/below the learner's level, so an unfiltered AVG
	// divides earned confidence by the whole catalogue and the drill-down would
	// contradict the C2 number the teacher just clicked (85% there, ~11% here).
	if err := s.db.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE total_attempts > 0),
		       COALESCE(AVG(confidence) FILTER (WHERE total_attempts > 0), 0)::float8,
		       COUNT(*) FILTER (WHERE confidence >= 0.8 OR status = 'mastered')
		FROM learner_skills WHERE learner_id = $1
	`, learnerID).Scan(&rep.SkillsTracked, &rep.AvgConfidence, &rep.MasteredCount); err != nil {
		return nil, err
	}
	// Headline mastery blends adaptive-skill confidence with curriculum-Path mastery.
	if curMastery > rep.AvgConfidence {
		rep.AvgConfidence = curMastery
	}

	// weakest attempted skills
	wrows, err := s.db.Query(ctx, `
		SELECT s.display_name_en, ls.confidence::float8
		FROM learner_skills ls JOIN skills s ON s.skill_id = ls.skill_id
		WHERE ls.learner_id = $1 AND ls.total_attempts > 0
		ORDER BY ls.confidence ASC LIMIT 5
	`, learnerID)
	if err != nil {
		return nil, err
	}
	defer wrows.Close()
	for wrows.Next() {
		var ws WeakSkill
		if err := wrows.Scan(&ws.Name, &ws.Confidence); err != nil {
			return nil, err
		}
		rep.WeakSkills = append(rep.WeakSkills, ws)
	}
	return rep, wrows.Err()
}

// Leaderboard returns the top learners by XP, joined to their display names.
func (s *TeacherStore) Leaderboard(ctx context.Context, limit int) ([]LeaderboardRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT lp.display_name, ls.total_xp, ls.current_streak, lp.current_level::text
		FROM learner_streaks ls
		JOIN learner_profiles lp ON lp.id = ls.learner_id
		ORDER BY ls.total_xp DESC, ls.current_streak DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LeaderboardRow{}
	rank := 1
	for rows.Next() {
		var r LeaderboardRow
		if err := rows.Scan(&r.Name, &r.XP, &r.StreakDays, &r.Level); err != nil {
			return nil, err
		}
		r.Rank = rank
		rank++
		out = append(out, r)
	}
	return out, rows.Err()
}
