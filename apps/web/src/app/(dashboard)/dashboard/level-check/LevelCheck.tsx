"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MultipleChoice, FillBlank } from "@/components/exercises";
import { auth } from "@/lib/auth";
import { sound } from "@/lib/sound";
import { levels, normalizeSegment, segmentProfile, targetLevel, levelRank, type CEFR, type Question } from "@/curriculum";

// A self-contained, offline adaptive placement: a short ladder drawn from the
// bundled curriculum. The learner answers a few core-grammar questions per level,
// ascending while they pass; the first level they CAN'T pass is where they start.
// No backend needed — it sets `current_level`, and the path page's seeding marks
// everything below complete so they enter at the right place.

const LADDER: CEFR[] = ["A1", "A2", "B1", "B2", "C1"];
const PER_LEVEL = 6; // enough per rung for a clear signal (need 4/6 to advance)
const PASS = 0.6; // fraction correct to advance a rung

const LEVEL_LABEL: Record<string, string> = {
  A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Intermediate", C1: "Advanced", C2: "Mastery",
};
const LEVEL_COLOR: Record<string, string> = {
  A1: "#22c55e", A2: "#84cc16", B1: "#eab308", B2: "#f97316", C1: "#ef4444", C2: "#dc2626",
};

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// Core-grammar MC/fill_blank questions for a level (skip themed segment modules).
function levelQuestions(levelId: CEFR, n: number): Question[] {
  const lvl = levels.find((l) => l.id === levelId);
  if (!lvl) return [];
  const pool: Question[] = [];
  for (const m of lvl.modules) {
    if (m.track === "segment") continue;
    for (const lesson of m.lessons)
      for (const q of lesson.questionBank)
        if ((q.exerciseType === "multiple_choice" || q.exerciseType === "fill_blank") && q.correctAnswer && (q.distractors?.length ?? 0) >= 2)
          pool.push(q);
  }
  return shuffle(pool).slice(0, n);
}

export default function LevelCheckPage() {
  const router = useRouter();
  const segment = useMemo(() => normalizeSegment(auth.getSegment()), []);
  const cap = targetLevel(segment);

  // Segments without the shared grammar core (kids) have nothing to place out of —
  // skip the check and start them at the beginning of their own spine.
  useEffect(() => {
    if (!segmentProfile(segment).usesCore) router.replace("/dashboard/path");
  }, [segment, router]);

  // Build the ladder once, capped at the segment's ceiling.
  const rungs = useMemo(
    () => LADDER.filter((lv) => levelRank(lv) <= levelRank(cap)).map((lv) => ({ level: lv, questions: levelQuestions(lv, PER_LEVEL) })).filter((r) => r.questions.length > 0),
    [cap]
  );

  const [phase, setPhase] = useState<"intro" | "testing" | "result">("intro");
  const [rung, setRung] = useState(0);
  const [qi, setQi] = useState(0);
  const [correctInRung, setCorrectInRung] = useState(0);
  const [entry, setEntry] = useState<CEFR>("A1");
  // Bridges the exercise components' separate onSubmit (gives correctness) and
  // onContinue (advances) callbacks.
  const lastOk = useRef(false);

  function finish(determined: CEFR) {
    auth.setProfile({ currentLevel: determined });
    auth.setWorkingLevel(determined); // Home reflects the new level immediately
    const id = auth.getLearnerId() || "anon";
    localStorage.removeItem(`placement_seeded_${id}`); // force a re-seed at the new level
    setEntry(determined);
    sound.play("complete");
    setPhase("result");
  }

  function onAnswer(isCorrect: boolean) {
    const nextCorrect = correctInRung + (isCorrect ? 1 : 0);
    const r = rungs[rung];
    if (qi + 1 < r.questions.length) {
      setCorrectInRung(nextCorrect);
      setQi(qi + 1);
      return;
    }
    // rung finished — passed?
    const passed = nextCorrect / r.questions.length >= PASS;
    if (!passed) { finish(r.level); return; } // first level they can't pass = their start
    if (rung + 1 >= rungs.length) { finish(cap); return; } // aced everything → enter at the ceiling
    setRung(rung + 1);
    setQi(0);
    setCorrectInRung(0);
  }

  if (rungs.length === 0) {
    // No gradable bundled questions (shouldn't happen) — fall back to beginner.
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <p className="text-[var(--color-text-muted)]">We couldn&apos;t build a placement test right now.</p>
        <button onClick={() => router.push("/dashboard/path")} className="mt-4 bg-[var(--color-primary)] text-white font-semibold px-6 py-3 rounded-xl">Start from the beginning</button>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center mx-auto mb-5 text-3xl">🎯</div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">Quick Level Check</h1>
          <p className="text-[var(--color-text-muted)] mt-2 max-w-md mx-auto">
            About 3–4 minutes. Answer a short set of questions at each level and we&apos;ll start you exactly where you belong — no grinding through what you already know.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 text-sm text-[var(--color-text-muted)]">
          We start easy and go up. As soon as a level gets too hard, we stop — that&apos;s your starting point. Don&apos;t guess; it&apos;s better to land where it fits.
        </div>
        <div className="flex gap-3">
          <button onClick={() => router.push("/dashboard/path")} className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50">Skip — I&apos;m a beginner</button>
          <button onClick={() => { sound.play("click"); setPhase("testing"); }} className="flex-1 bg-[var(--color-accent)] text-white font-semibold py-3 rounded-xl hover:bg-[var(--color-accent-light)]">Start the check</button>
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const color = LEVEL_COLOR[entry];
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: color + "20", border: `3px solid ${color}` }}>
          <span className="text-4xl font-black" style={{ color }}>{entry}</span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-1">You&apos;re starting at {entry}</h1>
        <p className="text-lg text-[var(--color-text-muted)] mb-8">{LEVEL_LABEL[entry]}{entry !== "A1" ? " — we'll skip the basics you already know." : " — we'll build you up from the alphabet."}</p>
        <button onClick={() => router.push("/dashboard/path")} className="bg-[var(--color-accent)] text-white font-semibold px-8 py-4 rounded-xl hover:bg-[var(--color-accent-light)] text-lg">Start learning →</button>
      </div>
    );
  }

  // testing
  const r = rungs[rung];
  const q = r.questions[qi];
  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2 text-sm">
          <span className="font-semibold text-[var(--color-primary)]">Level {r.level} · {LEVEL_LABEL[r.level]}</span>
          <span className="text-[var(--color-text-muted)]">Question {qi + 1} of {r.questions.length}</span>
        </div>
        <div className="flex gap-1">
          {rungs.map((rr, i) => (
            <div key={rr.level} className={`h-1.5 flex-1 rounded-full ${i < rung ? "bg-green-400" : i === rung ? "bg-[var(--color-accent)]" : "bg-gray-200"}`} />
          ))}
        </div>
      </div>
      <div key={`${rung}-${qi}`} className="bg-white rounded-2xl border border-gray-200 p-6">
        {q.exerciseType === "fill_blank" ? (
          <FillBlank promptRu={q.promptRu ?? ""} promptEn={q.promptEn} correctAnswer={q.correctAnswer ?? ""} distractors={q.distractors ?? []} explanationEn={q.explanationEn} onSubmit={(_r, ok) => { lastOk.current = ok; sound.play(ok ? "correct" : "incorrect"); }} onContinue={() => onAnswer(lastOk.current)} />
        ) : (
          <MultipleChoice promptRu={q.promptRu} promptEn={q.promptEn} correctAnswer={q.correctAnswer ?? ""} distractors={q.distractors ?? []} explanationEn={q.explanationEn} onSubmit={(_r, ok) => { lastOk.current = ok; sound.play(ok ? "correct" : "incorrect"); }} onContinue={() => onAnswer(lastOk.current)} />
        )}
      </div>
    </div>
  );
}
