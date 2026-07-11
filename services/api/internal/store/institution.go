package store

import (
	"context"
	"crypto/rand"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InstitutionStore backs multi-tenant provisioning: creating institutions, joining
// by code, teacher/dean invites, the enrolled-student pool, and tenant-isolation
// checks. A user's institution_id (on users) is the tenant boundary.
type InstitutionStore struct {
	db *pgxpool.Pool
}

func NewInstitutionStore(db *pgxpool.Pool) *InstitutionStore {
	return &InstitutionStore{db: db}
}

var (
	ErrInviteInvalid           = errors.New("invite invalid or expired")
	ErrInviteEmailMismatch     = errors.New("invite is for a different email")
	ErrTeacherNotInInstitution = errors.New("teacher is not in this institution")
	ErrCodeInvalid             = errors.New("invalid join code")
	ErrJoinNotAllowed          = errors.New("only unaffiliated learners can join with a code")
	ErrAlreadyInInstitution    = errors.New("already a member of another institution")
	ErrNotInInstitution        = errors.New("that member is not in your institution")
	ErrNotStaff                = errors.New("that member is not staff (only teacher/dean roles can be changed)")
	ErrLastDean                = errors.New("an institution must keep at least one dean")
	ErrCohortNotInInstitution  = errors.New("that cohort is not in your institution")
)

type Institution struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	JoinCode  string    `json:"joinCode"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

// Unambiguous alphabet (no I/L/O/0/1) for human-typed codes.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func randCode(n int) string {
	out := make([]byte, n)
	// Rejection sampling: reject bytes at or above the largest multiple of the
	// alphabet size so every symbol is equally likely (plain byte%31 is biased
	// toward the first 256%31 symbols).
	limit := 256 - (256 % len(codeAlphabet))
	var b [1]byte
	for i := 0; i < n; {
		if _, err := rand.Read(b[:]); err != nil {
			continue
		}
		if int(b[0]) >= limit {
			continue
		}
		out[i] = codeAlphabet[int(b[0])%len(codeAlphabet)]
		i++
	}
	return string(out)
}

func slugify(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
		case r == ' ' || r == '-':
			b.WriteRune('-')
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		s = "inst"
	}
	return s
}

func scanInstitution(row pgx.Row) (*Institution, error) {
	inst := &Institution{}
	err := row.Scan(&inst.ID, &inst.Name, &inst.Slug, &inst.JoinCode, &inst.Status, &inst.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return inst, nil
}

const instCols = `id, name, slug, join_code, status, created_at`

// Create makes a new institution with a unique slug + student join code.
func (s *InstitutionStore) Create(ctx context.Context, name string) (*Institution, error) {
	slug := slugify(name) + "-" + strings.ToLower(randCode(4))
	code := randCode(8)
	return scanInstitution(s.db.QueryRow(ctx,
		`INSERT INTO institutions (name, slug, join_code) VALUES ($1,$2,$3) RETURNING `+instCols,
		name, slug, code))
}

func (s *InstitutionStore) Get(ctx context.Context, id uuid.UUID) (*Institution, error) {
	return scanInstitution(s.db.QueryRow(ctx, `SELECT `+instCols+` FROM institutions WHERE id=$1`, id))
}

func (s *InstitutionStore) GetByJoinCode(ctx context.Context, code string) (*Institution, error) {
	return scanInstitution(s.db.QueryRow(ctx,
		`SELECT `+instCols+` FROM institutions WHERE join_code=$1 AND status='active'`,
		strings.ToUpper(strings.TrimSpace(code))))
}

// OfUser returns the user's institution, or (nil, nil) if they're independent.
func (s *InstitutionStore) OfUser(ctx context.Context, userID uuid.UUID) (*Institution, error) {
	return scanInstitution(s.db.QueryRow(ctx,
		`SELECT i.id, i.name, i.slug, i.join_code, i.status, i.created_at
		 FROM users u JOIN institutions i ON i.id = u.institution_id WHERE u.id=$1`,
		userID))
}

// SetMemberByEmail attaches a user (by email) to an institution with a role — the
// platform's onboarding path for appointing an institution's first dean.
func (s *InstitutionStore) SetMemberByEmail(ctx context.Context, institutionID uuid.UUID, email, role string) (int64, error) {
	tag, err := s.db.Exec(ctx, `UPDATE users SET institution_id=$1, role=$2 WHERE lower(email)=lower($3)`, institutionID, role, email)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// JoinByCode enrols a learner into an institution's student pool (role stays learner).
// Only currently-unaffiliated learners may self-join: a teacher/dean cannot use a code
// to re-home themselves into another tenant, and an already-enrolled student cannot
// silently switch institutions (both are tenant-isolation bypasses). Transfers require
// an explicit admin/dean action, not a self-service code.
func (s *InstitutionStore) JoinByCode(ctx context.Context, userID uuid.UUID, code string) (*Institution, error) {
	inst, err := s.GetByJoinCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if inst == nil {
		return nil, ErrCodeInvalid
	}
	tag, err := s.db.Exec(ctx,
		`UPDATE users SET institution_id=$1 WHERE id=$2 AND role='learner' AND institution_id IS NULL`,
		inst.ID, userID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrJoinNotAllowed
	}
	return inst, nil
}

// LearnerIsUnaffiliated reports whether a learner profile belongs to a user with no
// institution — the tenant-boundary check for the independent-teacher enrolment path.
func (s *InstitutionStore) LearnerIsUnaffiliated(ctx context.Context, learnerProfileID uuid.UUID) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM learner_profiles lp JOIN users u ON u.id=lp.user_id
		 WHERE lp.id=$1 AND u.institution_id IS NULL`,
		learnerProfileID).Scan(&n)
	return n > 0, err
}

// CreateInvite issues a single-use token to provision a teacher or dean by email.
func (s *InstitutionStore) CreateInvite(ctx context.Context, institutionID uuid.UUID, email, role string) (string, error) {
	token := randCode(24)
	_, err := s.db.Exec(ctx,
		`INSERT INTO institution_invites (institution_id, email, role, token) VALUES ($1, lower($2), $3, $4)`,
		institutionID, strings.TrimSpace(email), role, token)
	return token, err
}

// AcceptInvite binds the signed-in user to the invite's institution + role. The
// user's email must match the invite (an invite is for a specific person).
func (s *InstitutionStore) AcceptInvite(ctx context.Context, userID uuid.UUID, userEmail, token string) (*Institution, string, error) {
	var instID uuid.UUID
	var role, email string
	err := s.db.QueryRow(ctx, `
		SELECT institution_id, role, email FROM institution_invites
		WHERE token=$1 AND accepted_at IS NULL AND expires_at > now()`, strings.TrimSpace(token)).
		Scan(&instID, &role, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrInviteInvalid
	}
	if err != nil {
		return nil, "", err
	}
	if !strings.EqualFold(email, strings.TrimSpace(userEmail)) {
		return nil, "", ErrInviteEmailMismatch
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback(ctx)

	// Enforce the same last-dean invariant the other role mutations do: a sole dean who
	// accepts a self-addressed teacher invite must not silently drop the institution to
	// zero deans (which would 403 every dean route for the whole tenant, recoverable only
	// via the out-of-band admin key). Only relevant when the accepting user is already a
	// dean of THIS institution and the invite wouldn't keep them one.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1::text))`, instID.String()); err != nil {
		return nil, "", err
	}
	var curInst *uuid.UUID
	var curRole string
	if err := tx.QueryRow(ctx, `SELECT institution_id, role FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&curInst, &curRole); err != nil {
		return nil, "", err
	}
	if curRole == "dean" && role != "dean" && curInst != nil && *curInst == instID {
		n, err := deanCount(ctx, tx, instID)
		if err != nil {
			return nil, "", err
		}
		if n <= 1 {
			return nil, "", ErrLastDean
		}
	}

	// Only bind users who are currently unaffiliated or already in THIS institution.
	// Refusing to rebind a member of another tenant stops institution A from pulling
	// institution B's staff/students across the boundary via an accepted invite (the
	// invite stays unaccepted because the tx rolls back).
	tag, err := tx.Exec(ctx,
		`UPDATE users SET institution_id=$1, role=$2 WHERE id=$3 AND (institution_id IS NULL OR institution_id=$1)`,
		instID, role, userID)
	if err != nil {
		return nil, "", err
	}
	if tag.RowsAffected() == 0 {
		return nil, "", ErrAlreadyInInstitution
	}
	if _, err := tx.Exec(ctx, `UPDATE institution_invites SET accepted_by=$1, accepted_at=now() WHERE token=$2`, userID, token); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, "", err
	}
	inst, err := s.Get(ctx, instID)
	return inst, role, err
}

// ListStudents returns the institution's enrolled-student pool (name-filtered) —
// what an institution teacher can pick from.
func (s *InstitutionStore) ListStudents(ctx context.Context, institutionID uuid.UUID, q string, limit int) ([]LearnerBrief, error) {
	rows, err := s.db.Query(ctx, `
		SELECT lp.id, lp.display_name, lp.segment::text, lp.current_level::text
		FROM learner_profiles lp JOIN users u ON u.id = lp.user_id
		WHERE u.institution_id = $1 AND lp.display_name ILIKE '%' || $2 || '%'
		ORDER BY lp.display_name LIMIT $3`, institutionID, q, limit)
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

type InstTeacher struct {
	ID    uuid.UUID `json:"id"`
	Email string    `json:"email"`
	Role  string    `json:"role"`
}

// ListTeachers returns the institution's teachers + deans (for the assign dropdown).
func (s *InstitutionStore) ListTeachers(ctx context.Context, institutionID uuid.UUID) ([]InstTeacher, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, email, role FROM users WHERE institution_id=$1 AND role IN ('teacher','dean') ORDER BY role, email`,
		institutionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InstTeacher{}
	for rows.Next() {
		var t InstTeacher
		if err := rows.Scan(&t.ID, &t.Email, &t.Role); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *InstitutionStore) LearnerInInstitution(ctx context.Context, institutionID, learnerProfileID uuid.UUID) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM learner_profiles lp JOIN users u ON u.id=lp.user_id WHERE lp.id=$1 AND u.institution_id=$2`,
		learnerProfileID, institutionID).Scan(&n)
	return n > 0, err
}

func (s *InstitutionStore) UserInInstitution(ctx context.Context, userID, institutionID uuid.UUID) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM users WHERE id=$1 AND institution_id=$2`, userID, institutionID).Scan(&n)
	return n > 0, err
}

func (s *InstitutionStore) CohortInInstitution(ctx context.Context, institutionID, cohortID uuid.UUID) (bool, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM cohorts WHERE id=$1 AND institution_id=$2`, cohortID, institutionID).Scan(&n)
	return n > 0, err
}

// CreateCohortFor lets a dean ASSIGN a cohort to one of their teachers (the roster
// model — teachers receive cohorts rather than only picking students).
func (s *InstitutionStore) CreateCohortFor(ctx context.Context, institutionID, teacherID uuid.UUID, name string) (*Cohort, error) {
	var n int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM users WHERE id=$1 AND institution_id=$2 AND role IN ('teacher','dean')`,
		teacherID, institutionID).Scan(&n); err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, ErrTeacherNotInInstitution
	}
	c := &Cohort{TeacherID: teacherID, Name: name}
	err := s.db.QueryRow(ctx,
		`INSERT INTO cohorts (teacher_id, name, institution_id) VALUES ($1,$2,$3) RETURNING id, created_at`,
		teacherID, name, institutionID).Scan(&c.ID, &c.CreatedAt)
	return c, err
}

// ------------------- Dean management (institution-scoped mutations) -------------------

// deanCount returns how many deans the institution currently has (used to protect
// the last dean from being removed or demoted).
func deanCount(ctx context.Context, tx pgx.Tx, institutionID uuid.UUID) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `SELECT count(*) FROM users WHERE institution_id=$1 AND role='dean'`, institutionID).Scan(&n)
	return n, err
}

// RemoveMember detaches a teacher/dean from the institution. Their institution
// cohorts are first reassigned to `reassignTo` (the acting dean) so no class is
// orphaned, then the member is demoted to an independent learner (institution_id
// NULL, role='learner'). Refuses to remove the institution's LAST dean. Scoped to
// members of THIS institution.
func (s *InstitutionStore) RemoveMember(ctx context.Context, institutionID, userID, reassignTo uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Serialize all dean-count-changing txns for THIS institution. Without it, two
	// concurrent demotions of different deans each take FOR UPDATE on their own (distinct)
	// row, both read deanCount=2, and both commit — leaving the institution with 0 deans.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1::text))`, institutionID.String()); err != nil {
		return err
	}

	var role string
	err = tx.QueryRow(ctx, `SELECT role FROM users WHERE id=$1 AND institution_id=$2 FOR UPDATE`, userID, institutionID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotInInstitution
	}
	if err != nil {
		return err
	}
	if role == "dean" {
		n, err := deanCount(ctx, tx, institutionID)
		if err != nil {
			return err
		}
		if n <= 1 {
			return ErrLastDean
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE cohorts SET teacher_id=$1 WHERE teacher_id=$2 AND institution_id=$3`, reassignTo, userID, institutionID); err != nil {
		return err
	}
	// Reassign the removed member's assignments too, so the new cohort owner (the dean)
	// can see/manage them and completion notifications route to the right person —
	// otherwise assignments keep teacher_id pointing at the now-demoted learner account.
	if _, err := tx.Exec(ctx, `UPDATE assignments SET teacher_id=$1 WHERE teacher_id=$2 AND cohort_id IN (SELECT id FROM cohorts WHERE institution_id=$3)`, reassignTo, userID, institutionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET institution_id=NULL, role='learner' WHERE id=$1 AND institution_id=$2`, userID, institutionID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetMemberRole changes a member's role within the institution (teacher<->dean).
// Won't demote the last dean.
func (s *InstitutionStore) SetMemberRole(ctx context.Context, institutionID, userID uuid.UUID, role string) error {
	if role != "teacher" && role != "dean" {
		return errors.New("role must be teacher or dean")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Same institution-scoped lock as RemoveMember — prevents a concurrent demotion +
	// removal from racing the last-dean guard down to zero deans.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1::text))`, institutionID.String()); err != nil {
		return err
	}

	var cur string
	err = tx.QueryRow(ctx, `SELECT role FROM users WHERE id=$1 AND institution_id=$2 FOR UPDATE`, userID, institutionID).Scan(&cur)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotInInstitution
	}
	if err != nil {
		return err
	}
	// Only staff roles may be flipped via this dean tool. Refuse to silently promote a
	// self-enrolled LEARNER (who joined via a code with role='learner') into teacher/dean
	// — staff onboarding must go through an invite the person actually accepts.
	if cur != "teacher" && cur != "dean" {
		return ErrNotStaff
	}
	if cur == "dean" && role == "teacher" {
		n, err := deanCount(ctx, tx, institutionID)
		if err != nil {
			return err
		}
		if n <= 1 {
			return ErrLastDean
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET role=$1 WHERE id=$2 AND institution_id=$3`, role, userID, institutionID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type Invite struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// ListInvites returns the institution's outstanding (unaccepted, unexpired) invites.
func (s *InstitutionStore) ListInvites(ctx context.Context, institutionID uuid.UUID) ([]Invite, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, email, role, created_at, expires_at FROM institution_invites
		WHERE institution_id=$1 AND accepted_at IS NULL AND expires_at > now()
		ORDER BY created_at DESC`, institutionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Invite{}
	for rows.Next() {
		var iv Invite
		if err := rows.Scan(&iv.ID, &iv.Email, &iv.Role, &iv.CreatedAt, &iv.ExpiresAt); err != nil {
			return nil, err
		}
		out = append(out, iv)
	}
	return out, rows.Err()
}

// RevokeInvite deletes a pending invite (scoped to the institution). Returns rows affected.
func (s *InstitutionStore) RevokeInvite(ctx context.Context, institutionID, inviteID uuid.UUID) (int64, error) {
	tag, err := s.db.Exec(ctx,
		`DELETE FROM institution_invites WHERE id=$1 AND institution_id=$2 AND accepted_at IS NULL`,
		inviteID, institutionID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

type InstCohort struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	TeacherID    uuid.UUID `json:"teacherId"`
	TeacherEmail string    `json:"teacherEmail"`
	Students     int       `json:"students"`
}

// ListCohorts returns every cohort in the institution with its teacher + headcount,
// so a dean can rename / reassign / delete any class.
func (s *InstitutionStore) ListCohorts(ctx context.Context, institutionID uuid.UUID) ([]InstCohort, error) {
	rows, err := s.db.Query(ctx, `
		SELECT c.id, c.name, c.teacher_id, u.email, count(cm.learner_id)
		FROM cohorts c
		JOIN users u ON u.id = c.teacher_id
		LEFT JOIN cohort_members cm ON cm.cohort_id = c.id
		WHERE c.institution_id = $1
		GROUP BY c.id, c.name, c.teacher_id, u.email
		ORDER BY c.name`, institutionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InstCohort{}
	for rows.Next() {
		var c InstCohort
		if err := rows.Scan(&c.ID, &c.Name, &c.TeacherID, &c.TeacherEmail, &c.Students); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// RenameCohort renames a cohort that belongs to the institution.
func (s *InstitutionStore) RenameCohort(ctx context.Context, institutionID, cohortID uuid.UUID, name string) error {
	tag, err := s.db.Exec(ctx, `UPDATE cohorts SET name=$1 WHERE id=$2 AND institution_id=$3`, name, cohortID, institutionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCohortNotInInstitution
	}
	return nil
}

// ReassignCohort moves an institution cohort to another teacher in the institution.
func (s *InstitutionStore) ReassignCohort(ctx context.Context, institutionID, cohortID, teacherID uuid.UUID) error {
	var n int
	if err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM users WHERE id=$1 AND institution_id=$2 AND role IN ('teacher','dean')`,
		teacherID, institutionID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrTeacherNotInInstitution
	}
	tag, err := s.db.Exec(ctx, `UPDATE cohorts SET teacher_id=$1 WHERE id=$2 AND institution_id=$3`, teacherID, cohortID, institutionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCohortNotInInstitution
	}
	return nil
}

// DeleteCohort removes an institution cohort (members/assignments/invites cascade).
func (s *InstitutionStore) DeleteCohort(ctx context.Context, institutionID, cohortID uuid.UUID) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM cohorts WHERE id=$1 AND institution_id=$2`, cohortID, institutionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrCohortNotInInstitution
	}
	return nil
}

// UnenrolStudent removes a learner from the institution entirely: drops them from
// every cohort in the institution, then detaches them (institution_id NULL) so they
// leave the pool. Only acts on a learner currently in THIS institution.
func (s *InstitutionStore) UnenrolStudent(ctx context.Context, institutionID, learnerProfileID uuid.UUID) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT u.id FROM learner_profiles lp JOIN users u ON u.id=lp.user_id
		 WHERE lp.id=$1 AND u.institution_id=$2`, learnerProfileID, institutionID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotInInstitution
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM cohort_members WHERE learner_id=$1 AND cohort_id IN (SELECT id FROM cohorts WHERE institution_id=$2)`,
		learnerProfileID, institutionID); err != nil {
		return err
	}
	// Purge the learner's assignment state within this institution so single-attempt
	// completions and per-learner targets don't silently resurface (marking old work
	// "done", un-redoable) if the student is later re-enrolled into the same cohorts.
	if _, err := tx.Exec(ctx,
		`DELETE FROM assignment_completions WHERE learner_id=$1 AND assignment_id IN (
			SELECT a.id FROM assignments a JOIN cohorts c ON c.id=a.cohort_id WHERE c.institution_id=$2)`,
		learnerProfileID, institutionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM assignment_targets WHERE learner_id=$1 AND assignment_id IN (
			SELECT a.id FROM assignments a JOIN cohorts c ON c.id=a.cohort_id WHERE c.institution_id=$2)`,
		learnerProfileID, institutionID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE users SET institution_id=NULL WHERE id=$1 AND institution_id=$2 AND role='learner'`,
		userID, institutionID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Rename changes the institution's display name.
func (s *InstitutionStore) Rename(ctx context.Context, institutionID uuid.UUID, name string) (*Institution, error) {
	return scanInstitution(s.db.QueryRow(ctx,
		`UPDATE institutions SET name=$1 WHERE id=$2 RETURNING `+instCols, name, institutionID))
}

// RotateJoinCode issues a fresh student join code (e.g. after the old one leaks).
func (s *InstitutionStore) RotateJoinCode(ctx context.Context, institutionID uuid.UUID) (*Institution, error) {
	return scanInstitution(s.db.QueryRow(ctx,
		`UPDATE institutions SET join_code=$1 WHERE id=$2 RETURNING `+instCols, randCode(8), institutionID))
}
