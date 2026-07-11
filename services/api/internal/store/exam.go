package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ExamStore backs dean/teacher-assigned exams: a scheduled CEFR-level assessment
// given to a cohort, with per-student results, plus the roll-ups a dean uses to
// score teachers on their students' exam performance.
type ExamStore struct {
	db *pgxpool.Pool
}

func NewExamStore(db *pgxpool.Pool) *ExamStore { return &ExamStore{db: db} }

// AssignedExam is one exam assigned to a cohort, with completion aggregates.
type AssignedExam struct {
	ID            uuid.UUID  `json:"id"`
	CohortID      uuid.UUID  `json:"cohortId"`
	CohortName    string     `json:"cohortName,omitempty"`
	TeacherEmail  string     `json:"teacherEmail,omitempty"`
	Level         string     `json:"level"`
	Title         string     `json:"title"`
	PassThreshold float64    `json:"passThreshold"`
	DueAt         *time.Time `json:"dueAt"`
	CreatedAt     time.Time  `json:"createdAt"`
	Assigned      int        `json:"assigned"`  // cohort size
	Completed     int        `json:"completed"` // results recorded
	Passed        int        `json:"passed"`
	AvgScore      float64    `json:"avgScore"` // mean correct/total over results (0..1)
}

// Create records a new assigned exam for a cohort.
func (s *ExamStore) Create(ctx context.Context, cohortID uuid.UUID, level, title string, passThreshold float64, dueAt *time.Time, createdBy uuid.UUID) (*AssignedExam, error) {
	e := &AssignedExam{CohortID: cohortID, Level: level, Title: title, PassThreshold: passThreshold, DueAt: dueAt}
	err := s.db.QueryRow(ctx,
		`INSERT INTO assigned_exams (cohort_id, level, title, pass_threshold, due_at, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
		cohortID, level, title, passThreshold, dueAt, createdBy).Scan(&e.ID, &e.CreatedAt)
	return e, err
}

// Delete removes an assigned exam (results cascade).
func (s *ExamStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.db.Exec(ctx, `DELETE FROM assigned_exams WHERE id=$1`, id)
	return err
}

// CohortInstitution returns the institution a cohort belongs to (nil if none) — used
// to scope dean actions on an exam's cohort.
func (s *ExamStore) ExamCohortInstitution(ctx context.Context, examID uuid.UUID) (*uuid.UUID, error) {
	var inst *uuid.UUID
	err := s.db.QueryRow(ctx,
		`SELECT c.institution_id FROM assigned_exams ae JOIN cohorts c ON c.id=ae.cohort_id WHERE ae.id=$1`,
		examID).Scan(&inst)
	return inst, err
}

const examAggCols = `
	ae.id, ae.cohort_id, c.name, u.email, ae.level, ae.title, ae.pass_threshold, ae.due_at, ae.created_at,
	(SELECT count(*) FROM cohort_members cm WHERE cm.cohort_id=ae.cohort_id) AS assigned,
	(SELECT count(*) FROM assigned_exam_results r WHERE r.assigned_exam_id=ae.id) AS completed,
	(SELECT count(*) FROM assigned_exam_results r WHERE r.assigned_exam_id=ae.id AND r.passed) AS passed,
	COALESCE((SELECT avg(r.correct::float/NULLIF(r.total,0)) FROM assigned_exam_results r WHERE r.assigned_exam_id=ae.id),0) AS avg_score`

func scanAssignedExams(rows interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
	Close()
}) ([]AssignedExam, error) {
	defer rows.Close()
	out := []AssignedExam{}
	for rows.Next() {
		var e AssignedExam
		if err := rows.Scan(&e.ID, &e.CohortID, &e.CohortName, &e.TeacherEmail, &e.Level, &e.Title,
			&e.PassThreshold, &e.DueAt, &e.CreatedAt, &e.Assigned, &e.Completed, &e.Passed, &e.AvgScore); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ListForInstitution returns every assigned exam in the institution with stats.
func (s *ExamStore) ListForInstitution(ctx context.Context, institutionID uuid.UUID) ([]AssignedExam, error) {
	rows, err := s.db.Query(ctx,
		`SELECT `+examAggCols+`
		 FROM assigned_exams ae
		 JOIN cohorts c ON c.id=ae.cohort_id
		 JOIN users u ON u.id=c.teacher_id
		 WHERE c.institution_id=$1
		 ORDER BY ae.created_at DESC`, institutionID)
	if err != nil {
		return nil, err
	}
	return scanAssignedExams(rows)
}

// ExamResultRow is one student's outcome on an assigned exam (null if not taken yet).
type ExamResultRow struct {
	LearnerID   uuid.UUID  `json:"learnerId"`
	Name        string     `json:"name"`
	Correct     *int       `json:"correct"`
	Total       *int       `json:"total"`
	Passed      *bool      `json:"passed"`
	CompletedAt *time.Time `json:"completedAt"`
}

// Results returns every cohort member's outcome for one exam (taken or not).
func (s *ExamStore) Results(ctx context.Context, examID uuid.UUID) ([]ExamResultRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT lp.id, lp.display_name, r.correct, r.total, r.passed, r.completed_at
		FROM assigned_exams ae
		JOIN cohort_members cm ON cm.cohort_id=ae.cohort_id
		JOIN learner_profiles lp ON lp.id=cm.learner_id
		LEFT JOIN assigned_exam_results r ON r.assigned_exam_id=ae.id AND r.learner_id=lp.id
		WHERE ae.id=$1
		ORDER BY lp.display_name`, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ExamResultRow{}
	for rows.Next() {
		var rr ExamResultRow
		if err := rows.Scan(&rr.LearnerID, &rr.Name, &rr.Correct, &rr.Total, &rr.Passed, &rr.CompletedAt); err != nil {
			return nil, err
		}
		out = append(out, rr)
	}
	return out, rows.Err()
}

// TeacherExamPerf is a teacher's roll-up over their cohorts' assigned-exam results.
type TeacherExamPerf struct {
	TeacherID uuid.UUID `json:"teacherId"`
	Exams     int       `json:"exams"`    // assigned exams across their cohorts
	Results   int       `json:"results"`  // student results recorded
	Passed    int       `json:"passed"`
	AvgScore  float64   `json:"avgScore"` // mean correct/total (0..1)
	PassRate  float64   `json:"passRate"` // passed / results (0..1)
}

// TeacherExamPerf returns exam performance keyed by teacher for the whole institution.
func (s *ExamStore) TeacherExamPerf(ctx context.Context, institutionID uuid.UUID) ([]TeacherExamPerf, error) {
	rows, err := s.db.Query(ctx, `
		SELECT c.teacher_id,
		  count(DISTINCT ae.id) AS exams,
		  count(r.*) AS results,
		  count(r.*) FILTER (WHERE r.passed) AS passed,
		  COALESCE(avg(r.correct::float/NULLIF(r.total,0)),0) AS avg_score
		FROM cohorts c
		JOIN assigned_exams ae ON ae.cohort_id=c.id
		LEFT JOIN assigned_exam_results r ON r.assigned_exam_id=ae.id
		WHERE c.institution_id=$1
		GROUP BY c.teacher_id`, institutionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeacherExamPerf{}
	for rows.Next() {
		var p TeacherExamPerf
		if err := rows.Scan(&p.TeacherID, &p.Exams, &p.Results, &p.Passed, &p.AvgScore); err != nil {
			return nil, err
		}
		if p.Results > 0 {
			p.PassRate = float64(p.Passed) / float64(p.Results)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// LearnerExam is one assigned exam as the learner sees it (with their own result).
type LearnerExam struct {
	ID            uuid.UUID  `json:"id"`
	Title         string     `json:"title"`
	Level         string     `json:"level"`
	CohortName    string     `json:"cohortName"`
	PassThreshold float64    `json:"passThreshold"`
	DueAt         *time.Time `json:"dueAt"`
	CompletedAt   *time.Time `json:"completedAt"`
	Correct       *int       `json:"correct"`
	Total         *int       `json:"total"`
	Passed        *bool      `json:"passed"`
}

// ListForLearner returns the exams assigned to the learner's cohorts + their result.
func (s *ExamStore) ListForLearner(ctx context.Context, learnerID uuid.UUID) ([]LearnerExam, error) {
	rows, err := s.db.Query(ctx, `
		SELECT ae.id, ae.title, ae.level, c.name, ae.pass_threshold, ae.due_at,
		       r.completed_at, r.correct, r.total, r.passed
		FROM assigned_exams ae
		JOIN cohorts c ON c.id=ae.cohort_id
		JOIN cohort_members cm ON cm.cohort_id=ae.cohort_id AND cm.learner_id=$1
		LEFT JOIN assigned_exam_results r ON r.assigned_exam_id=ae.id AND r.learner_id=$1
		ORDER BY (r.completed_at IS NOT NULL), ae.due_at NULLS LAST, ae.created_at DESC`, learnerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LearnerExam{}
	for rows.Next() {
		var e LearnerExam
		if err := rows.Scan(&e.ID, &e.Title, &e.Level, &e.CohortName, &e.PassThreshold, &e.DueAt,
			&e.CompletedAt, &e.Correct, &e.Total, &e.Passed); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// GetForLearner returns one assigned exam IF the learner is in its cohort (else nil).
func (s *ExamStore) GetForLearner(ctx context.Context, learnerID, examID uuid.UUID) (*LearnerExam, error) {
	e := &LearnerExam{}
	err := s.db.QueryRow(ctx, `
		SELECT ae.id, ae.title, ae.level, c.name, ae.pass_threshold, ae.due_at,
		       r.completed_at, r.correct, r.total, r.passed
		FROM assigned_exams ae
		JOIN cohorts c ON c.id=ae.cohort_id
		JOIN cohort_members cm ON cm.cohort_id=ae.cohort_id AND cm.learner_id=$1
		LEFT JOIN assigned_exam_results r ON r.assigned_exam_id=ae.id AND r.learner_id=$1
		WHERE ae.id=$2`, learnerID, examID).
		Scan(&e.ID, &e.Title, &e.Level, &e.CohortName, &e.PassThreshold, &e.DueAt,
			&e.CompletedAt, &e.Correct, &e.Total, &e.Passed)
	if err != nil {
		return nil, err
	}
	return e, nil
}

// RecordResult records the learner's outcome — but only if they're a member of the
// exam's cohort, and only the FIRST time (single attempt). Returns true if it stored.
//
// pass/fail is derived SERVER-SIDE from the score vs the exam's pass_threshold (a
// client-supplied `passed` is never trusted — otherwise a learner could POST
// passed=true regardless of their answers). A guard clause (total 0 ⇒ never passed)
// avoids a divide-by-zero and stops an empty submission from counting as a pass.
func (s *ExamStore) RecordResult(ctx context.Context, examID, learnerID uuid.UUID, correct, total int) (bool, error) {
	tag, err := s.db.Exec(ctx, `
		INSERT INTO assigned_exam_results (assigned_exam_id, learner_id, correct, total, passed)
		SELECT ae.id, $2, $3, $4,
		       ($4 > 0 AND ($3::float / $4) >= ae.pass_threshold)
		FROM assigned_exams ae
		JOIN cohort_members cm ON cm.cohort_id=ae.cohort_id
		WHERE ae.id=$1 AND cm.learner_id=$2
		ON CONFLICT (assigned_exam_id, learner_id) DO NOTHING`,
		examID, learnerID, correct, total)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
