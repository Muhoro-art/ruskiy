// Generates the server-side exam answer key that the Go API uses to re-grade assigned
// exams authoritatively (so a learner can't POST a fabricated score). Output is embedded
// in the API via go:embed at services/api/internal/exam/answerkey.json.
//
// RE-RUN THIS whenever the exam pools in apps/web/src/curriculum/data.generated.ts change:
//   node scripts/gen-exam-answerkey.mjs
//
// It exports only OBJECTIVELY gradable questions (multiple_choice / fill_blank / listening
// / word_scramble — those with a single correct answer). matching + free_response have no
// single-string answer, so the server falls back to the client's per-question verdict for
// just those (a small, inherently self-assessed subset). NOTE: because exam CONTENT is
// delivered to the browser, the correct answers are present in the client bundle — this
// re-grading stops trivial score fabrication and removes trust in the self-reported
// aggregate, but a determined attacker who reads the bundle can still submit correct
// answers. Fully preventing that requires serving exam questions from the server without
// answers (a larger content-pipeline change).

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "apps/web/src/curriculum/data.generated.ts");
const outPath = path.join(root, "services/api/internal/exam/answerkey.json");

let src = fs.readFileSync(dataPath, "utf8");
src = src.slice(src.indexOf("= [") + 2).trim().replace(/;\s*$/, "");
const levels = JSON.parse(src);

// Keep this normalization IN SYNC with normalize() in services/api/internal/exam/grade.go.
const norm = (s) =>
  (s == null ? "" : String(s)).toLowerCase().normalize("NFC").replace(/\s+/g, " ").replace(/[.!?;,]+$/, "").trim();

const OBJECTIVE = new Set(["multiple_choice", "fill_blank", "listening", "word_scramble"]);
const out = { exams: {}, answers: {} };

for (const lv of levels) {
  if (!lv.exam) continue;
  const ex = lv.exam;
  const secs = ex.sections || [];
  out.exams[ex.id] = { threshold: ex.passThreshold, expected: (ex.questionsPerSection || 10) * secs.length };
  for (const sec of secs) {
    for (const q of sec.pool || []) {
      const ans = q.correctAnswer || q.answer || "";
      if (ans && OBJECTIVE.has(q.exerciseType)) out.answers[q.id] = norm(ans);
    }
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
console.log(`wrote ${outPath}: ${Object.keys(out.exams).length} exams, ${Object.keys(out.answers).length} objective answers`);
