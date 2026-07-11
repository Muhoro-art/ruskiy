package exam

import "testing"

// These ids/answers come from the embedded answerkey.json (regenerate if it changes).
const (
	a1q1 = "exam-A1#0_1" // key: "книга"
	a1q2 = "exam-A1#0_2" // key: "сестра"
)

func TestGradeIgnoresClientVerdictForObjective(t *testing.T) {
	if !KnownExam("exam-A1") {
		t.Fatal("expected exam-A1 in embedded key")
	}
	// A learner fabricates: every answer flagged correct=true but the RESPONSE is wrong.
	// Objective questions must be graded against the key, so correct stays 0.
	ans := []SubmittedAnswer{
		{ID: a1q1, Response: "totally-wrong", Correct: true},
		{ID: a1q2, Response: "also-wrong", Correct: true},
	}
	correct, total, ok := Grade("exam-A1", ans)
	if !ok {
		t.Fatal("ok should be true")
	}
	if correct != 0 {
		t.Fatalf("fabricated all-true with wrong responses graded correct=%d, want 0", correct)
	}
	if total != 20 { // exam-A1 expected length (denominator is the full exam)
		t.Fatalf("total=%d, want 20 (full exam length so omissions count against)", total)
	}
}

func TestGradeCountsRealAnswerDespiteFalseFlag(t *testing.T) {
	// The correct response with a FALSE client flag must still be counted (server grades).
	ans := []SubmittedAnswer{{ID: a1q1, Response: "Книга.", Correct: false}} // case/punct-insensitive
	correct, total, _ := Grade("exam-A1", ans)
	if correct != 1 {
		t.Fatalf("correct answer graded correct=%d, want 1 (server must grade, not trust the flag)", correct)
	}
	if total != 20 {
		t.Fatalf("total=%d, want 20", total)
	}
}

func TestGradeIgnoresForeignQuestionIds(t *testing.T) {
	// A question id from a different exam must not be counted toward this exam.
	ans := []SubmittedAnswer{{ID: "exam-B1#0_1", Response: "книга", Correct: true}}
	correct, total, _ := Grade("exam-A1", ans)
	if correct != 0 {
		t.Fatalf("foreign question id counted (correct=%d), want 0", correct)
	}
	if total != 20 {
		t.Fatalf("total=%d, want 20", total)
	}
}

func TestGradeUnknownExamBestEffort(t *testing.T) {
	// No embedded key → best-effort from client verdicts (still per-question, id-echoed).
	ans := []SubmittedAnswer{
		{ID: "exam-ZZ#0_1", Correct: true},
		{ID: "exam-ZZ#0_2", Correct: false},
	}
	correct, total, ok := Grade("exam-ZZ", ans)
	if !ok || correct != 1 || total != 2 {
		t.Fatalf("unknown-exam best-effort = (correct=%d,total=%d,ok=%v), want (1,2,true)", correct, total, ok)
	}
}
