package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Command-and-control rollups: a Teacher's view across their own cohorts, and a
// Dean's view across all teachers. "Active" = a learner with activity in the last
// 7 days; "at risk" = low mastery (avg confidence < 0.4 with real attempts) OR no
// activity in 14+ days. Confidence is averaged over attempted skills only.

const activeDays = 7
const inactiveDays = 14
const lowConfidence = 0.4

// ---------------- Teacher command center ----------------

type C2Cohort struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Students      int       `json:"students"`
	Active        int       `json:"active"`
	Started       int       `json:"started"` // members with ANY earned work (lessons or adaptive)
	AvgConfidence float64   `json:"avgConfidence"`
	JoinCode      string    `json:"joinCode,omitempty"`
}

type RiskStudent struct {
	ID            uuid.UUID  `json:"id"`
	Name          string     `json:"name"`
	Cohort        string     `json:"cohort"`
	AvgConfidence float64    `json:"avgConfidence"`
	LastActive    *time.Time `json:"lastActive"`
	Reason        string     `json:"reason"`
}

type TeacherC2 struct {
	TeacherID      uuid.UUID     `json:"teacherId"`
	TeacherName    string        `json:"teacherName"`
	Students       int           `json:"students"`
	ActiveStudents int           `json:"activeStudents"`
	// StartedStudents = members with any EARNED work (attempted lessons/exams or
	// adaptive attempts). AvgConfidence averages over exactly this set, so the UI
	// must present it as "avg of the N who started", never of the whole roster.
	StartedStudents int           `json:"startedStudents"`
	Cohorts         int           `json:"cohorts"`
	Assignments     int           `json:"assignments"`
	AvgConfidence   float64       `json:"avgConfidence"`
	AtRisk          int           `json:"atRisk"`
	CohortRows      []C2Cohort    `json:"cohortRows"`
	RiskStudents    []RiskStudent `json:"riskStudents"`
}

// TeacherC2 rolls up one teacher's cohorts, students, engagement, and at-risk list.
func (s *TeacherStore) TeacherC2(ctx context.Context, teacherID uuid.UUID) (*TeacherC2, error) {
	out := &TeacherC2{TeacherID: teacherID, CohortRows: []C2Cohort{}, RiskStudents: []RiskStudent{}}

	// Teacher label (staff email — teachers have no learner profile).
	_ = s.db.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, teacherID).Scan(&out.TeacherName)

	// Top-line KPIs (all derived from one member set for internal consistency).
	if err := s.db.QueryRow(ctx, `
		WITH members AS (
			SELECT DISTINCT cm.learner_id
			FROM cohorts c JOIN cohort_members cm ON cm.cohort_id = c.id
			WHERE c.teacher_id = $1
		),
		perlearner AS (
			SELECT m.learner_id,
			       -- Effective mastery blends adaptive skill confidence with the
			       -- curriculum-Path signal so students who learn either way count.
			       GREATEST(COALESCE(x.avg_conf, 0), COALESCE(s.curriculum_mastery, 0))::float8 AS eff_mast,
			       (COALESCE(x.att, 0) > 0 OR COALESCE(s.curriculum_lessons, 0) > 0) AS has_work,
			       s.last_active AS last_active
			FROM members m
			LEFT JOIN (
				SELECT learner_id, avg(confidence)::float8 avg_conf, sum(total_attempts) att
				FROM learner_skills WHERE total_attempts > 0 GROUP BY learner_id
			) x ON x.learner_id = m.learner_id
			LEFT JOIN learner_streaks s ON s.learner_id = m.learner_id
		)
		SELECT
			(SELECT count(*) FROM members),
			(SELECT count(*) FROM perlearner WHERE last_active >= current_date - $2::int),
			(SELECT count(*) FROM perlearner WHERE has_work),
			(SELECT count(*) FROM cohorts WHERE teacher_id = $1),
			(SELECT count(*) FROM assignments WHERE teacher_id = $1),
			COALESCE((SELECT avg(eff_mast) FROM perlearner WHERE has_work), 0)::float8,
			(SELECT count(*) FROM perlearner
			 WHERE NOT has_work OR eff_mast < $4 OR last_active IS NULL OR last_active < current_date - $3::int)
	`, teacherID, activeDays, inactiveDays, lowConfidence).Scan(
		&out.Students, &out.ActiveStudents, &out.StartedStudents, &out.Cohorts, &out.Assignments, &out.AvgConfidence, &out.AtRisk); err != nil {
		return nil, err
	}

	// Per-cohort summary.
	crows, err := s.db.Query(ctx, `
		SELECT c.id, c.name, COALESCE(c.join_code, '') AS join_code,
		       count(DISTINCT cm.learner_id) AS students,
		       count(DISTINCT cm.learner_id) FILTER (WHERE st.last_active >= current_date - $2::int) AS active,
		       count(DISTINCT cm.learner_id) FILTER (WHERE COALESCE(lc.att, 0) > 0 OR COALESCE(st.curriculum_lessons, 0) > 0) AS started,
		       COALESCE(avg(GREATEST(COALESCE(lc.avg_conf, 0), COALESCE(st.curriculum_mastery, 0)))
		                FILTER (WHERE COALESCE(lc.att, 0) > 0 OR COALESCE(st.curriculum_lessons, 0) > 0), 0)::float8 AS avg_conf
		FROM cohorts c
		LEFT JOIN cohort_members cm ON cm.cohort_id = c.id
		LEFT JOIN learner_streaks st ON st.learner_id = cm.learner_id
		LEFT JOIN (
			SELECT learner_id, avg(confidence)::float8 avg_conf, sum(total_attempts) att FROM learner_skills WHERE total_attempts > 0 GROUP BY learner_id
		) lc ON lc.learner_id = cm.learner_id
		WHERE c.teacher_id = $1
		GROUP BY c.id, c.name, c.join_code, c.created_at
		ORDER BY c.created_at DESC`, teacherID, activeDays)
	if err != nil {
		return nil, err
	}
	for crows.Next() {
		var c C2Cohort
		if err := crows.Scan(&c.ID, &c.Name, &c.JoinCode, &c.Students, &c.Active, &c.Started, &c.AvgConfidence); err != nil {
			crows.Close()
			return nil, err
		}
		out.CohortRows = append(out.CohortRows, c)
	}
	crows.Close()
	if err := crows.Err(); err != nil {
		return nil, err
	}

	// At-risk students (deduped across the teacher's cohorts, worst first).
	rrows, err := s.db.Query(ctx, `
		SELECT id, name, cohort, eff_mast, last_active, has_work,
		       (last_active IS NULL OR last_active < current_date - $2::int) AS inactive FROM (
			SELECT DISTINCT ON (lp.id) lp.id, lp.display_name AS name, c.name AS cohort,
			       GREATEST(COALESCE(x.avg_conf, 0), COALESCE(st.curriculum_mastery, 0))::float8 AS eff_mast,
			       st.last_active,
			       (COALESCE(x.att, 0) > 0 OR COALESCE(st.curriculum_lessons, 0) > 0) AS has_work
			FROM cohorts c
			JOIN cohort_members cm ON cm.cohort_id = c.id
			JOIN learner_profiles lp ON lp.id = cm.learner_id
			LEFT JOIN learner_streaks st ON st.learner_id = lp.id
			LEFT JOIN (
				SELECT learner_id, avg(confidence)::float8 avg_conf, sum(total_attempts) att FROM learner_skills WHERE total_attempts > 0 GROUP BY learner_id
			) x ON x.learner_id = lp.id
			WHERE c.teacher_id = $1
			-- Deterministic tiebreaker: a student in several of the teacher's
			-- cohorts always shows the same (newest) cohort label across refreshes.
			ORDER BY lp.id, c.created_at DESC
		) d
		WHERE NOT has_work OR eff_mast < $3 OR last_active IS NULL OR last_active < current_date - $2::int
		ORDER BY has_work ASC, eff_mast ASC, last_active ASC NULLS FIRST
		LIMIT 25`, teacherID, inactiveDays, lowConfidence)
	if err != nil {
		return nil, err
	}
	defer rrows.Close()
	for rrows.Next() {
		var rs RiskStudent
		var hasWork, inactive bool
		if err := rrows.Scan(&rs.ID, &rs.Name, &rs.Cohort, &rs.AvgConfidence, &rs.LastActive, &hasWork, &inactive); err != nil {
			return nil, err
		}
		rs.Reason = riskReason(rs.AvgConfidence, hasWork, inactive)
		out.RiskStudents = append(out.RiskStudents, rs)
	}
	return out, rrows.Err()
}

// riskReason labels a flagged student with a STABLE machine key (the client maps
// it to display copy/locale). `inactive` comes from the SAME SQL predicate that
// selected the row, so the badge never disagrees with the selection at a
// day/timezone boundary. Keys: not_started | low_mastery | inactive |
// low_mastery_inactive.
func riskReason(avgConf float64, hasWork, inactive bool) string {
	if !hasWork {
		return "not_started" // never touched a lesson/exercise — the most urgent signal
	}
	lowM := avgConf < lowConfidence
	switch {
	case lowM && inactive:
		return "low_mastery_inactive"
	case lowM:
		return "low_mastery"
	default:
		return "inactive"
	}
}

// ---------------- Dean overview (across all teachers) ----------------

type TeacherPerf struct {
	TeacherID      uuid.UUID `json:"teacherId"`
	Name           string    `json:"name"`
	Cohorts        int       `json:"cohorts"`
	Students       int       `json:"students"`
	ActiveStudents int       `json:"activeStudents"`
	// Started = cohort members with any earned work; AvgConfidence averages over
	// exactly this set (the dean UI must show the denominator, like TeacherC2View).
	Started       int     `json:"started"`
	AvgConfidence float64 `json:"avgConfidence"`
	Assignments   int     `json:"assignments"`
}

type DeanOverview struct {
	Teachers        int           `json:"teachers"`
	Students        int           `json:"students"`
	Cohorts         int           `json:"cohorts"`
	ActiveStudents  int           `json:"activeStudents"`
	StartedStudents int           `json:"startedStudents"`
	AvgConfidence   float64       `json:"avgConfidence"`
	TeacherRows     []TeacherPerf `json:"teacherRows"`
}

// DeanOverview rolls up ONE institution's totals + per-teacher performance table
// (scoped by institution_id so a dean only ever sees their own tenant's teachers).
func (s *TeacherStore) DeanOverview(ctx context.Context, institutionID uuid.UUID) (*DeanOverview, error) {
	out := &DeanOverview{TeacherRows: []TeacherPerf{}}

	if err := s.db.QueryRow(ctx, `
		WITH allstud AS (
			-- The institution's ENROLLED student body (the pool), whether or not they
			-- are in a cohort yet. Per-teacher rows below still count cohort members.
			SELECT lp.id AS learner_id FROM learner_profiles lp
			JOIN users u ON u.id = lp.user_id WHERE u.institution_id = $2
		),
		lc AS (SELECT learner_id, avg(confidence)::float8 avg_conf, sum(total_attempts) att
		       FROM learner_skills WHERE total_attempts > 0 GROUP BY learner_id),
		em AS (
			-- Effective mastery per student: adaptive confidence blended with EARNED
			-- curriculum mastery. has_work = attempted anything at all ("started").
			SELECT a.learner_id,
			       GREATEST(COALESCE(lc.avg_conf, 0), COALESCE(st.curriculum_mastery, 0))::float8 AS eff,
			       (COALESCE(lc.att, 0) > 0 OR COALESCE(st.curriculum_lessons, 0) > 0) AS has_work
			FROM allstud a
			LEFT JOIN lc ON lc.learner_id = a.learner_id
			LEFT JOIN learner_streaks st ON st.learner_id = a.learner_id
		)
		SELECT
			(SELECT count(*) FROM users WHERE role = 'teacher' AND institution_id = $2),
			(SELECT count(*) FROM allstud),
			(SELECT count(*) FROM cohorts WHERE institution_id = $2),
			(SELECT count(*) FROM allstud a JOIN learner_streaks s ON s.learner_id = a.learner_id WHERE s.last_active >= current_date - $1::int),
			(SELECT count(*) FROM em WHERE has_work),
			COALESCE((SELECT avg(eff) FROM em WHERE has_work), 0)::float8
	`, activeDays, institutionID).Scan(&out.Teachers, &out.Students, &out.Cohorts, &out.ActiveStudents, &out.StartedStudents, &out.AvgConfidence); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		WITH tl AS (
			SELECT DISTINCT c.teacher_id, cm.learner_id
			FROM cohorts c JOIN cohort_members cm ON cm.cohort_id = c.id
			WHERE c.institution_id = $2
		),
		lc AS (SELECT learner_id, avg(confidence)::float8 avg_conf FROM learner_skills WHERE total_attempts > 0 GROUP BY learner_id)
		SELECT u.id, u.email,
		       (SELECT count(*) FROM cohorts c WHERE c.teacher_id = u.id AND c.institution_id = $2) AS cohorts,
		       count(tl.learner_id)                                                 AS students,
		       count(tl.learner_id) FILTER (WHERE st.last_active >= current_date - $1::int) AS active,
		       count(tl.learner_id) FILTER (WHERE lc.avg_conf IS NOT NULL OR COALESCE(st.curriculum_lessons, 0) > 0) AS started,
		       COALESCE(avg(GREATEST(COALESCE(lc.avg_conf, 0), COALESCE(st.curriculum_mastery, 0)))
		                FILTER (WHERE lc.avg_conf IS NOT NULL OR COALESCE(st.curriculum_lessons, 0) > 0), 0)::float8 AS avg_conf,
		       (SELECT count(*) FROM assignments a WHERE a.teacher_id = u.id)       AS assignments
		FROM users u
		LEFT JOIN tl ON tl.teacher_id = u.id
		LEFT JOIN learner_streaks st ON st.learner_id = tl.learner_id
		LEFT JOIN lc ON lc.learner_id = tl.learner_id
		WHERE u.role = 'teacher' AND u.institution_id = $2
		GROUP BY u.id, u.email
		ORDER BY students DESC, u.email`, activeDays, institutionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t TeacherPerf
		if err := rows.Scan(&t.TeacherID, &t.Name, &t.Cohorts, &t.Students, &t.ActiveStudents, &t.Started, &t.AvgConfidence, &t.Assignments); err != nil {
			return nil, err
		}
		out.TeacherRows = append(out.TeacherRows, t)
	}
	return out, rows.Err()
}
