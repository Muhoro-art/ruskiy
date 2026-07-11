// Package exam provides SERVER-SIDE grading of assigned exams, so the learner's
// pass/score is derived from their actual submitted answers checked against an embedded
// answer key — not from a self-reported {correct,total} the client could fabricate.
//
// Scope + honest limitation: the answer key covers the objectively gradable exam
// questions (multiple_choice / fill_blank / listening / word_scramble). The few
// matching / free_response questions have no single-string answer, so for THOSE the
// server falls back to the client's per-question verdict. And because exam content is
// delivered to the browser, the correct answers are present in the client bundle, so a
// determined attacker who reads the bundle can still submit correct answers — this
// grading stops trivial fabrication and score-inflation-by-omission and removes trust in
// the aggregate, but fully preventing extraction needs server-served content (see the
// generator header in scripts/gen-exam-answerkey.mjs).
package exam

import (
	_ "embed"
	"encoding/json"
	"log"
	"strings"
	"unicode"
)

//go:embed answerkey.json
var answerKeyJSON []byte

type examMeta struct {
	Threshold float64 `json:"threshold"`
	Expected  int     `json:"expected"`
}

type keyData struct {
	Exams   map[string]examMeta `json:"exams"`
	Answers map[string]string   `json:"answers"`
}

// SubmittedAnswer is one answered exam question from the client.
type SubmittedAnswer struct {
	ID       string `json:"id"`
	Response string `json:"response"`
	Correct  bool   `json:"correct"` // client verdict, trusted ONLY for non-objective types
}

var key keyData

func init() {
	if err := json.Unmarshal(answerKeyJSON, &key); err != nil {
		log.Printf("exam: failed to parse embedded answer key: %v", err)
		key = keyData{Exams: map[string]examMeta{}, Answers: map[string]string{}}
	}
}

// KnownExam reports whether the given exam id (e.g. "exam-B1") has an embedded key.
func KnownExam(examID string) bool {
	_, ok := key.Exams[examID]
	return ok
}

// normalize must stay in sync with norm() in scripts/gen-exam-answerkey.mjs: lowercase,
// NFC-ish (Go strings are already UTF-8; we just fold case + collapse whitespace), strip
// trailing sentence punctuation, trim.
func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	// collapse internal whitespace runs to a single space
	s = strings.Join(strings.FieldsFunc(s, unicode.IsSpace), " ")
	s = strings.TrimRight(s, ".!?;,")
	return strings.TrimSpace(s)
}

// Grade re-grades a submission for examID. It returns the server-authoritative
// (correct, total) and ok=false only when there are no usable answers.
//
//   - Known exam: total is the exam's full expected length (so omitting hard questions
//     can't inflate the percentage — unanswered = wrong). Each answered question that
//     belongs to this exam is graded against the key when objective, else by the client
//     verdict. Foreign question ids are ignored.
//   - Unknown exam (stale/absent key): best-effort — total = submitted count, correct =
//     sum of client verdicts (still derived per-question with id echo, strictly better
//     than trusting a bare {correct,total}). Logged so a stale key is noticed.
func Grade(examID string, answers []SubmittedAnswer) (correct, total int, ok bool) {
	meta, known := key.Exams[examID]
	if !known {
		log.Printf("exam: no embedded key for %q — grading best-effort from client verdicts (regenerate answerkey.json?)", examID)
		for _, a := range answers {
			total++
			if a.Correct {
				correct++
			}
		}
		return correct, total, total > 0
	}

	prefix := examID + "#"
	for _, a := range answers {
		if !strings.HasPrefix(a.ID, prefix) {
			continue // not a question of this exam — ignore
		}
		want, objective := key.Answers[a.ID]
		if objective {
			if normalize(a.Response) == want {
				correct++
			}
		} else if a.Correct { // matching / free_response — no single-string key
			correct++
		}
	}
	// Denominator is the exam's full length: unanswered/omitted questions count as wrong,
	// so a learner can't raise their percentage by only submitting the ones they got right.
	total = meta.Expected
	if total <= 0 {
		total = len(answers)
	}
	if correct > total {
		correct = total
	}
	return correct, total, true
}
