"use client";

// Learner-facing player for an assignment's attached Студия materials (Phase B
// delivery). The server only returns content for assignments this learner can
// actually see (cohort member + targeted-or-untargeted), so this page needs no
// extra authz of its own.
//
// SINGLE ATTEMPT: teacher assignments record exactly one run. Per-question
// outcomes (correct / incorrect / timeout) are captured and sent with the
// completion; afterwards the page shows the recorded results instead of the
// player. Every question is timed (teacher-set, default 30s) with a draining
// bar; expiry scores the question as not-attempted and moves on.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, type TeacherContent, type LearnerAssignment, type CompletionItemResult } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ContentPlayer } from "@/components/content/ContentPlayer";
import { Watermark } from "@/components/content/Watermark";
import { Card, buttonClasses } from "@/components/ui";

const DEFAULT_TIME_PER_QUESTION = 30;

// Mirrors the server's scoring: dialogue views don't count; matching partials
// count as correct only when complete.
function countScore(results: CompletionItemResult[]): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  for (const item of results) {
    for (const s of item.steps) {
      if (s.result === "viewed" || s.result === "done" || s.result === "") continue;
      const frac = /^(\d+)\/(\d+)$/.exec(s.result);
      if (s.result === "correct" || (frac && frac[1] === frac[2])) correct++;
      total++;
    }
  }
  return { correct, total };
}

function stepBadge(result: string): { icon: string; cls: string; label: string } {
  if (result === "correct") return { icon: "✓", cls: "bg-green-50 text-green-700 border-green-200", label: "correct" };
  if (result === "timeout") return { icon: "⏱", cls: "bg-amber-50 text-amber-700 border-amber-200", label: "time ran out" };
  if (result === "viewed" || result === "done") return { icon: "👁", cls: "bg-gray-50 text-gray-500 border-gray-200", label: "viewed" };
  const frac = /^(\d+)\/(\d+)$/.exec(result);
  if (frac) {
    return frac[1] === frac[2]
      ? { icon: "✓", cls: "bg-green-50 text-green-700 border-green-200", label: `all ${frac[2]} pairs` }
      : { icon: frac[0], cls: "bg-amber-50 text-amber-700 border-amber-200", label: `${frac[1]} of ${frac[2]} pairs` };
  }
  return { icon: "✗", cls: "bg-red-50 text-red-600 border-red-200", label: "incorrect" };
}

// Per-material, per-question recap — the same detail the teacher sees: the
// question itself, and for misses the student's answer next to the right one.
function ResultsRecap({ results }: { results: CompletionItemResult[] }) {
  if (!results || results.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No per-question detail was recorded for this attempt.</p>;
  }
  return (
    <div className="space-y-3 text-left">
      {results.map((item, k) => (
        <div key={k} className="border border-[var(--color-border)] rounded-lg p-3">
          <p className="text-sm font-medium text-[var(--color-text)] mb-2">{item.title}</p>
          <div className="space-y-2">
            {item.steps.map((s, j) => {
              const b = stepBadge(s.result);
              const missed = s.result !== "correct" && s.result !== "viewed" && s.result !== "done";
              return (
                <div key={j} className="flex items-start gap-2">
                  <span
                    title={`Question ${s.i} · ${s.type.replace(/_/g, " ")} — ${b.label}`}
                    className={`text-xs font-semibold border rounded px-2 py-0.5 shrink-0 ${b.cls}`}
                  >
                    {s.i} {b.icon}
                  </span>
                  <div className="min-w-0 text-xs">
                    {s.prompt && <p className="text-[var(--color-text)]">{s.prompt}</p>}
                    {/* The answer is shown for EVERY question — right or wrong. */}
                    {!missed && s.given && (
                      <p className="text-[var(--color-text-muted)] mt-0.5">
                        your answer: <span className="text-green-700 font-medium">{s.given}</span>
                      </p>
                    )}
                    {missed && (
                      <p className="text-[var(--color-text-muted)] mt-0.5">
                        {s.result === "timeout" ? (
                          <span className="text-amber-700">no answer — time ran out</span>
                        ) : (
                          s.given && (
                            <>
                              your answer: <span className="text-red-600 font-medium">{s.given}</span>
                            </>
                          )
                        )}
                        {s.expected && (
                          <>
                            {" · "}correct: <span className="text-green-700 font-medium">{s.expected}</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AssignmentTaskPage() {
  const params = useParams();
  const id = String(params.id);
  const [items, setItems] = useState<TeacherContent[]>([]);
  const [meta, setMeta] = useState<LearnerAssignment | null>(null);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [completedSent, setCompletedSent] = useState(false);
  const [xpAwarded, setXpAwarded] = useState<number | null>(null);
  // true = this assignment was already completed BEFORE this visit — the one
  // recorded attempt is spent, so show the results instead of the player.
  const [priorAttempt, setPriorAttempt] = useState(false);
  const resultsRef = useRef<CompletionItemResult[]>([]);
  const watermark = `${auth.getDisplayName() || "Learner"} · Russkiy`;

  useEffect(() => {
    (async () => {
      try {
        const [content, mine] = await Promise.all([api.getAssignmentContent(id), api.getMyAssignments()]);
        setItems(content);
        const m = mine.find((a) => a.id === id) || null;
        setMeta(m);
        if (m?.completedAt) setPriorAttempt(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load this task");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Send the completion (with per-question results) exactly once, when the
  // learner finishes the last material. MUST sit above the early returns
  // (Rules of Hooks). Never fires for an already-spent attempt.
  useEffect(() => {
    if (!loading && !priorAttempt && items.length > 0 && idx >= items.length && !completedSent) {
      setCompletedSent(true);
      api
        .completeAssignment(id, resultsRef.current)
        .then((r) => setXpAwarded(typeof r.xpAwarded === "number" ? r.xpAwarded : 0))
        .catch(() => {});
    }
  }, [loading, priorAttempt, items.length, idx, completedSent, id]);

  if (loading) return <div className="text-[var(--color-text-muted)] py-12 text-center">Loading your task…</div>;
  if (error || (items.length === 0 && !priorAttempt))
    return (
      <div className="max-w-2xl">
        <Link href="/dashboard" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← Home</Link>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center mt-4">
          <p className="font-semibold text-[var(--color-primary)]">Nothing to play here</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {error || "This assignment has no attached materials (it may be a practice-skills assignment — use Learn instead)."}
          </p>
        </div>
      </div>
    );

  const done = idx >= items.length;
  const timerSec = meta?.timePerQuestionSec || DEFAULT_TIME_PER_QUESTION;

  // ---- attempt already spent before this visit: results only, no player ----
  if (priorAttempt && meta) {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
          <Link href="/dashboard" className="hover:text-[var(--color-primary)]">Home</Link>
          <span>/</span>
          <span className="text-[var(--color-text)]">{meta.title}</span>
        </div>
        <Card>
          <div className="text-center mb-6">
            <p className="text-3xl mb-2">✅</p>
            <h1 className="text-xl font-bold text-[var(--color-primary)]">Task completed</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Finished {new Date(meta.completedAt as string).toLocaleString()} · score{" "}
              <strong className="text-[var(--color-text)]">{meta.scoreCorrect}/{meta.scoreTotal}</strong>
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Teacher assignments allow one attempt — these results were shared with your teacher.
            </p>
          </div>
          <ResultsRecap results={meta.results} />
          <div className="text-center mt-6">
            <Link href="/dashboard" className={buttonClasses("primary", "md")}>Back home</Link>
          </div>
        </Card>
      </div>
    );
  }

  const recordStep =
    (itemIdx: number) =>
    (label: string, step?: { i: number; type: string; prompt?: string; given?: string; expected?: string }) => {
      const src = items[itemIdx];
      if (!src) return;
      let entry = resultsRef.current.find((r) => r.contentId === src.id);
      if (!entry) {
        entry = { contentId: src.id, title: src.title, steps: [] };
        resultsRef.current.push(entry);
      }
      entry.steps.push({
        i: step?.i ?? entry.steps.length + 1,
        type: step?.type || src.exerciseType,
        result: label === "done" ? "viewed" : label,
        prompt: step?.prompt || "",
        given: step?.given || "",
        expected: step?.expected || "",
      });
    };

  const score = done ? countScore(resultsRef.current) : null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard" className="hover:text-[var(--color-primary)]">Home</Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">{meta?.title || "Assignment"}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">{meta?.title || "Assignment from your teacher"}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {meta ? `${meta.cohortName} · from ${meta.teacherEmail}` : ""}
            {meta?.deadline ? ` · due ${new Date(meta.deadline).toLocaleDateString()}` : ""}
          </p>
        </div>
        <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-2)] rounded-full px-3 py-1 shrink-0 mt-1">
          {Math.min(idx + 1, items.length)}/{items.length}
        </span>
      </div>

      {done ? (
        <Card>
          <div className="text-center mb-6">
            <p className="text-4xl mb-3">🎉</p>
            <h2 className="text-xl font-bold text-[var(--color-primary)]">Task complete!</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Score <strong className="text-[var(--color-text)]">{score?.correct}/{score?.total}</strong> · sent to your teacher.
              One attempt per assignment — nice work committing to your answers!
            </p>
            {xpAwarded !== null && (
              <p
                className={`inline-block mt-2 text-sm font-bold rounded-full px-3 py-1 ${
                  xpAwarded >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                }`}
              >
                {xpAwarded >= 0 ? `+${xpAwarded}` : xpAwarded} XP
              </p>
            )}
          </div>
          <ResultsRecap results={resultsRef.current} />
          <div className="text-center mt-6">
            <Link href="/dashboard" className={buttonClasses("primary", "md")}>Back home</Link>
          </div>
        </Card>
      ) : (
        <div onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
        <Card className="relative select-none">
          <Watermark text={watermark} />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 min-w-0 relative">
              <h2 className="text-sm font-semibold text-[var(--color-text)] truncate">{items[idx].title}</h2>
              {/* ⓘ — creator attribution: every authored task names its teacher. */}
              <button
                onClick={() => setShowInfo((v) => !v)}
                aria-label="About this material"
                className="w-4.5 h-4.5 shrink-0 rounded-full border border-[var(--color-border-strong)] text-[10px] leading-none text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] px-1 py-0.5"
              >
                i
              </button>
              {showInfo && (
                <div className="absolute top-6 left-0 z-10 bg-white border border-[var(--color-border)] rounded-lg shadow-md px-3 py-2 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  <p><span className="font-medium text-[var(--color-text)]">Created by:</span> {items[idx].authorName || meta?.teacherEmail || "your teacher"}</p>
                  <p className="mt-0.5">Level {items[idx].cefrLevel} · custom material from the Студия</p>
                </div>
              )}
            </div>
            {items.length > 1 && (
              <div className="flex items-center gap-1">
                {items.map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${i < idx ? "bg-green-500" : i === idx ? "bg-[var(--color-primary)]" : "bg-gray-200"}`} />
                ))}
              </div>
            )}
          </div>
          <div className="relative" style={{ zIndex: 2 }}>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-3 inline-block">
              ⏱ {timerSec}s per question · one attempt — unanswered questions count as missed
            </p>
            <ContentPlayer
              key={`${items[idx].id}|${idx}`}
              item={{ exerciseType: items[idx].exerciseType, contentData: items[idx].contentData }}
              onFinished={() => setIdx((i) => i + 1)}
              onResult={recordStep(idx)}
              doneLabel="Nice work!"
              againLabel="Try again"
              allowReplay={false}
              stepLabel={(i, n) => `step ${i} of ${n}`}
              timePerQuestionSec={timerSec}
            />
          </div>
        </Card>
        </div>
      )}
    </div>
  );
}
