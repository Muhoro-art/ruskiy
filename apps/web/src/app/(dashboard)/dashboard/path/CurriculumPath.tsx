"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MultipleChoice,
  FillBlank,
  Matching,
  DragEndings,
  WordScramble,
  SentenceBuilder,
  Listening,
  MemoryMatch,
  FreeResponse,
} from "@/components/exercises";
import { SpeakButton } from "@/components/SpeakButton";
import { GlossText } from "@/components/GlossText";
import { QuestionTimer } from "@/components/content/ContentPlayer";
import { Watermark } from "@/components/content/Watermark";
import { logPathAnswer } from "@/lib/pathlog";
import { TEACH_OVERRIDES } from "@/curriculum/teach.enriched";
import { cefrColor, Chip, ProgressBar, buttonClasses } from "@/components/ui";
import { auth } from "@/lib/auth";
import { api } from "@/lib/api";
import { sound } from "@/lib/sound";
import { analytics } from "@/lib/analytics";
import {
  buildTrack,
  trackSteps,
  currentStepIndex,
  currentLevelId,
  stepComplete,
  findLesson,
  findExam,
  normalizeSegment,
  segmentLabel,
  segmentProfile,
  targetLevel,
  levelRank,
  levelStatus,
  overallProgress,
  loadProgress,
  saveProgress,
  recordLesson,
  recordExam,
  recordTopic,
  sampleQuestions,
  isLessonMastered,
  isPlacedOut,
  weakTopics,
  buildReview,
  buildInterleavedReview,
  moduleByTopic,
  seedPlacement,
  MASTERY_THRESHOLD,
  EXAM_PASS_THRESHOLD,
  type CEFR,
  type Segment,
  type Level,
  type Lesson,
  type Exam,
  type Question,
  type ProgressMap,
} from "@/curriculum";

// Soft-gated segments (kids, seniors) advance at a gentler bar than the standard
// 0.8 mastery — completing a lesson with half right is enough to keep going.
const SOFT_MASTERY = 0.5;

type View =
  | { mode: "map" }
  | { mode: "lesson"; id: string }
  | { mode: "exam"; id: string }
  | { mode: "review" };

export default function PathPage() {
  const [learnerId, setLearnerId] = useState("");
  const [segment, setSegment] = useState<Segment>("core");
  const [progress, setProgress] = useState<ProgressMap>({ lessons: {}, exams: {}, topics: {} });
  const [view, setView] = useState<View>({ mode: "map" });
  const [ready, setReady] = useState(false);
  // The level currently shown in the map. Only ONE level renders at a time (picked
  // from the horizontal level rail), so the learner isn't scrolling past every
  // level's lessons. null → resolves to the active level.
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  // Which modules (within the shown level) are expanded to their lessons. The module
  // you're currently in auto-opens; the rest collapse to a one-line summary so a
  // 66-lesson level shows as ~5 rows, not a giant scroll.
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});
  // Gate the server push until the cross-device pull has settled, so a fresh
  // device (empty local progress) can't push empty state — which would clobber the
  // server blob and, before the server's monotonic guard, regress the saved level.
  const [synced, setSynced] = useState(false);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = auth.getLearnerId() || "anon";
    setLearnerId(id);
    setSegment(normalizeSegment(auth.getSegment()));
    const local = loadProgress(id);
    setProgress(local);
    setReady(true);
    // Restore the placed level from progress if this device lacks it (cross-device).
    if (local.placedLevel && !auth.getCurrentLevel()) auth.setProfile({ currentLevel: local.placedLevel });

    // Best-effort cross-device sync: pull server progress and adopt it if it's
    // further along. Offline / local-only accounts just keep using localStorage.
    if (auth.isAuthenticated() && !auth.isLocalOnly()) {
      const masteredCount = (m: ProgressMap) => Object.values(m.lessons).filter((l) => l.mastered).length;
      api
        .getCurriculumProgress<Partial<ProgressMap>>()
        .then((remote) => {
          if (remote && remote.lessons) {
            const merged: ProgressMap = {
              lessons: remote.lessons || {},
              exams: remote.exams || {},
              topics: remote.topics || {},
              placedLevel: remote.placedLevel,
            };
            if (masteredCount(merged) >= masteredCount(local)) {
              saveProgress(id, merged);
              setProgress(merged);
              if (merged.placedLevel && !auth.getCurrentLevel()) auth.setProfile({ currentLevel: merged.placedLevel });
            }
          }
          // Open the push gate ONLY on a successful pull. On failure we must not
          // push at all this visit: a fresh device with empty local progress would
          // otherwise overwrite the server's real blob (the exact clobber this
          // gate exists to prevent). localStorage keeps working offline either way.
          setSynced(true);
        })
        .catch(() => {
          /* offline / pull failed — do NOT open the push gate; localStorage
             remains the source of truth until a later successful pull */
        });
    } else {
      setSynced(true); // no server sync for local-only sessions
    }
  }, []);

  const track = useMemo(() => buildTrack(segment), [segment]);
  const masteryThreshold = segmentProfile(segment).gating === "soft" ? SOFT_MASTERY : MASTERY_THRESHOLD;

  // Debounced push of progress to the server (best-effort). Waits for `synced` so
  // we never push before the cross-device pull has had a chance to restore real
  // progress on a fresh device.
  useEffect(() => {
    if (!ready || !learnerId || !synced || !auth.isAuthenticated() || auth.isLocalOnly()) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      // Include the derived current level so the server-side projection (stats,
      // leaderboard, teacher reports) stays in sync with real curriculum progress.
      const currentLevel = track.length ? currentLevelId(track, progress) : undefined;
      api.putCurriculumProgress({ ...progress, currentLevel }).catch(() => {});
    }, 1500);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [progress, ready, learnerId, track, synced]);

  // Level-entry: if the learner placed into a level above A1 (from the placement
  // test), mark everything below it as tested-out so they START THERE instead of
  // grinding the alphabet. Runs once per learner; idempotent and never downgrades
  // real progress.
  useEffect(() => {
    if (!ready || !learnerId || track.length === 0) return;
    const chosen = (auth.getCurrentLevel() || "A1") as CEFR;
    // Never place above the segment's own ceiling (e.g. a kid track tops out at A2).
    const cap = targetLevel(segment);
    const level = levelRank(chosen) > levelRank(cap) ? cap : chosen;
    if (level === "A1") return;
    // Re-seed only when the placed level changes (e.g. after a placement test),
    // not on every mount.
    const seedKey = `placement_seeded_${learnerId}`;
    if (localStorage.getItem(seedKey) === level) return;
    seedPlacement(learnerId, track, level);
    localStorage.setItem(seedKey, level);
    setProgress(loadProgress(learnerId));
  }, [ready, learnerId, track]);

  const steps = useMemo(() => trackSteps(track), [track]);
  const currentIdx = useMemo(() => currentStepIndex(steps, progress), [steps, progress]);
  const overall = useMemo(() => overallProgress(track, progress), [track, progress]);

  // Keep the app-wide "working level" in sync with where the learner actually is.
  // Home and Leaderboard read this, so the level shown there never drifts from the
  // Path. Derived from progress, so it advances past the placement entry point.
  useEffect(() => {
    if (!ready || track.length === 0) return;
    const lvl = currentLevelId(track, progress);
    if (lvl && auth.getWorkingLevel() !== lvl) auth.setWorkingLevel(lvl);
  }, [ready, track, progress]);

  function refresh() {
    setProgress(loadProgress(learnerId));
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-[var(--color-text-muted)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
      </div>
    );
  }

  if (view.mode === "lesson") {
    const found = findLesson(track, view.id);
    if (found) {
      return (
        <LessonRunner
          lesson={found.lesson}
          topic={found.module.topic}
          contextTitle={`${found.level.id} · ${found.module.title}`}
          learnerId={learnerId}
          seenIds={progress.lessons[found.lesson.id]?.seenQuestionIds || []}
          track={track}
          levelId={found.level.id}
          masteryThreshold={masteryThreshold}
          onExit={() => { refresh(); setView({ mode: "map" }); }}
        />
      );
    }
  }

  if (view.mode === "review") {
    return (
      <ReviewRunner
        track={track}
        learnerId={learnerId}
        progress={progress}
        onExit={() => { refresh(); setView({ mode: "map" }); }}
      />
    );
  }

  if (view.mode === "exam") {
    const found = findExam(track, view.id);
    if (found) {
      return (
        <ExamRunner
          exam={found.exam}
          level={found.level}
          learnerId={learnerId}
          seenIds={progress.exams[found.exam.id]?.seenQuestionIds || []}
          onExit={() => { refresh(); setView({ mode: "map" }); }}
        />
      );
    }
  }

  // ---------- MAP ----------
  const stepIndexById = new Map(steps.map((s, i) => [s.id, i]));
  const current = currentIdx >= 0 ? steps[currentIdx] : null;

  function stepState(id: string): "done" | "current" | "locked" {
    const i = stepIndexById.get(id);
    if (i === undefined) return "locked";
    if (stepComplete(progress, steps[i])) return "done";
    return i === currentIdx ? "current" : "locked";
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--color-primary)] display">Your Path</h1>
          <Chip tone="brand">{segmentLabel(segment)}</Chip>
          <Chip tone="gold">Goal: {segmentProfile(segment).examFocus}</Chip>
        </div>
        <p className="text-[var(--color-text-muted)] mt-1">
          {segmentProfile(segment).outcomeEn}{" "}
          {segmentProfile(segment).gating === "exam"
            ? "Master each lesson, then pass the level exam to unlock the next — retakes always use fresh questions."
            : "Master each lesson to move on, at your own pace — no tests, just progress."}
        </p>
      </div>

      {/* Continue card */}
      <div className="bg-[var(--color-primary)] text-white rounded-[var(--radius-card)] p-6 mb-6">
        {current ? (
          current.kind === "lesson" ? (
            <>
              <p className="text-xs uppercase tracking-wide text-[var(--color-primary-fg-muted)] mb-1">
                You&apos;re learning now · {current.level.id}
              </p>
              <h2 className="text-xl font-bold">{current.module.title}</h2>
              <p className="text-[var(--color-primary-fg-muted)] text-sm mb-4">{current.lesson.titleEn}</p>
              <button
                onClick={() => setView({ mode: "lesson", id: current.lesson.id })}
                className="bg-white text-[var(--color-primary)] font-semibold px-6 py-2.5 rounded-xl hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                {progress.lessons[current.lesson.id]?.attempts ? "Keep practicing" : "Start lesson"} →
              </button>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-[var(--color-primary-fg-muted)] mb-1">🎓 Level exam</p>
              <h2 className="text-xl font-bold">{current.exam.title}</h2>
              <p className="text-[var(--color-primary-fg-muted)] text-sm mb-4">
                Pass ({Math.round(current.exam.passThreshold * 100)}%+) to unlock the next level.
              </p>
              <button
                onClick={() => setView({ mode: "exam", id: current.exam.id })}
                className="bg-white text-[var(--color-primary)] font-semibold px-6 py-2.5 rounded-xl hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                Take the exam →
              </button>
            </>
          )
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-[var(--color-primary-fg-muted)] mb-1">🎉 Path complete</p>
            <h2 className="text-xl font-bold">You&apos;ve reached your goal level!</h2>
          </>
        )}

        <div className="mt-5">
          <div className="flex justify-between text-xs text-[var(--color-primary-fg-muted)] mb-1">
            <span>Overall progress</span>
            <span>
              {overall.masteredLessons}/{overall.totalLessons} lessons · {overall.examsPassed}/
              {overall.totalExams} exams
            </span>
          </div>
          <ProgressBar value={overall.fraction} onDark />
        </div>
      </div>

      {/* Adaptive focus areas */}
      {(() => {
        const weak = weakTopics(progress);
        if (weak.length === 0) return null;
        return (
          <div
            className="rounded-[var(--radius-card)] border p-5 mb-6"
            style={{ backgroundColor: "var(--color-warning-surface)", borderColor: "color-mix(in srgb, var(--color-gold) 40%, white)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-[var(--color-primary)]">🎯 Focus areas</h2>
              <button onClick={() => setView({ mode: "review" })} className={buttonClasses("primary", "sm")}>
                Targeted review →
              </button>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              Based on your answers, these need more work. We&apos;ll mix in fresh questions from them.
            </p>
            <div className="flex flex-wrap gap-2">
              {weak.slice(0, 5).map((w) => {
                const mod = moduleByTopic(track, w.topic);
                return (
                  <Chip key={w.topic} tone="gold">
                    {mod?.title || w.topic}{" "}
                    <span className="text-[var(--color-accent)] font-semibold">{Math.round(w.accuracy * 100)}%</span>
                  </Chip>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Level map — a horizontal rail of every level. Tap a node (or the ◂/▸
          arrows) to jump; only the SELECTED level's lessons render below, so you
          never scroll past all six levels at once. Defaults to the active level. */}
      {(() => {
        const activeLevelId = current ? current.level.id : track[track.length - 1]?.id;
        const shownId = selectedLevel ?? activeLevelId ?? track[0]?.id;
        const shownIdx = Math.max(0, track.findIndex((l) => l.id === shownId));
        const shown = track[shownIdx];
        if (!shown) return null;
        const shownSt = levelStatus(track, steps, shown, progress);
        const shownColor = cefrColor(shown.id);
        const go = (i: number) => setSelectedLevel(track[Math.max(0, Math.min(track.length - 1, i))].id);

        return (
          <>
            {/* Rail */}
            <div className="flex items-center gap-1 mb-4">
              <button
                aria-label="Previous level"
                disabled={shownIdx === 0}
                onClick={() => go(shownIdx - 1)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg text-[var(--color-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:pointer-events-none"
              >
                ‹
              </button>
              <div className="flex items-center flex-1 min-w-0 overflow-x-auto">
                {track.map((lvl, i) => {
                  const st = levelStatus(track, steps, lvl, progress);
                  const color = cefrColor(lvl.id);
                  const isShown = lvl.id === shownId;
                  const done = st.state === "complete";
                  const locked = st.state === "locked";
                  return (
                    <div key={lvl.id} className="flex items-center flex-1 min-w-0">
                      <button
                        onClick={() => setSelectedLevel(lvl.id)}
                        title={`${lvl.name}${done ? " · complete" : locked ? " · locked" : " · in progress"}`}
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-black border-2 transition-all ${
                          isShown ? "ring-2 ring-offset-2 ring-[var(--color-primary)]" : ""
                        }`}
                        style={
                          done
                            ? { color: "white", backgroundColor: "var(--color-success)", borderColor: "var(--color-success)" }
                            : locked
                              ? { color: "var(--color-text-muted)", backgroundColor: "var(--color-surface-2)", borderColor: "var(--color-border-strong)" }
                              : { color, backgroundColor: `color-mix(in srgb, ${color} 14%, white)`, borderColor: color }
                        }
                      >
                        {done ? "✓" : locked ? "🔒" : lvl.id}
                      </button>
                      {i < track.length - 1 && (
                        <div className="h-0.5 flex-1 min-w-3" style={{ backgroundColor: done ? "var(--color-success)" : "var(--color-border-strong)" }} />
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                aria-label="Next level"
                disabled={shownIdx === track.length - 1}
                onClick={() => go(shownIdx + 1)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg text-[var(--color-primary)] hover:bg-[var(--color-surface-2)] disabled:opacity-30 disabled:pointer-events-none"
              >
                ›
              </button>
            </div>

            {/* The single selected level */}
            <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)]">
                <span
                  className="w-9 h-9 rounded-[var(--radius-control)] flex items-center justify-center text-sm font-black"
                  style={{ color: shownColor, backgroundColor: `color-mix(in srgb, ${shownColor} 14%, white)` }}
                >
                  {shown.id}
                </span>
                <div className="flex-1">
                  <h3 className="font-bold text-[var(--color-primary)]">{shown.name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {shownSt.masteredLessons}/{shownSt.totalLessons} lessons
                    {shown.exam ? (shownSt.examPassed ? " · exam passed ✓" : " · exam pending") : ""}
                  </p>
                </div>
                <Chip tone={shownSt.state === "complete" ? "success" : shownSt.state === "active" ? "brand" : "neutral"}>
                  {shownSt.state === "complete" ? "Complete" : shownSt.state === "active" ? "In progress" : "🔒 Locked"}
                </Chip>
              </div>

              {shownSt.state === "locked" ? (
                <div className="px-5 py-4 text-sm text-[var(--color-text-muted)]">
                  🔒 Pass the previous level&apos;s exam to unlock {shown.id}. You can browse ahead here — lessons open up as you progress.
                </div>
              ) : (
                <div>
                  {shownSt.state === "complete" && (
                    <p className="px-5 pt-3 text-sm text-[var(--color-success)]">
                      Level complete 🎉 — revisit any lesson to review; retakes use fresh questions.
                    </p>
                  )}
                  {shown.modules.map((module) => {
                    const doneCount = module.lessons.filter((l) => stepState(l.id) === "done").length;
                    const hasCurrent = module.lessons.some((l) => stepState(l.id) === "current");
                    const modOpen = openModules[module.id] ?? hasCurrent;
                    return (
                      <div key={module.id} className="border-b border-[var(--color-border)] last:border-0">
                        <button
                          type="button"
                          aria-expanded={modOpen}
                          onClick={() => setOpenModules((o) => ({ ...o, [module.id]: !modOpen }))}
                          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--color-surface-2)]"
                        >
                          <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            {module.title}
                          </span>
                          {hasCurrent && !modOpen && <Chip tone="brand">Continue</Chip>}
                          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                            {doneCount}/{module.lessons.length}
                          </span>
                          <span className="w-4 text-center text-xs text-[var(--color-text-muted)]" aria-hidden>
                            {modOpen ? "▾" : "▸"}
                          </span>
                        </button>
                        {modOpen &&
                          module.lessons.map((lesson) => {
                            const s = stepState(lesson.id);
                            const clickable = s !== "locked";
                            return (
                              <button
                                key={lesson.id}
                                onClick={() => clickable && setView({ mode: "lesson", id: lesson.id })}
                                disabled={!clickable}
                                className={`w-full flex items-center gap-3 pl-8 pr-5 py-2.5 text-left transition-colors ${
                                  clickable ? "hover:bg-[var(--color-primary-tint)] cursor-pointer" : "cursor-not-allowed"
                                }`}
                              >
                                <span className="w-5 text-center">
                                  {s === "done" ? "✅" : s === "current" ? "🔵" : "🔒"}
                                </span>
                                <span
                                  className={`flex-1 text-sm ${
                                    s === "locked" ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"
                                  }`}
                                >
                                  {lesson.titleEn}
                                </span>
                                {isPlacedOut(progress, lesson.id) && <Chip tone="neutral">Tested out · Review</Chip>}
                                {s === "current" && (
                                  <span className="text-xs text-[var(--color-accent)] font-semibold">Continue →</span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}

                  {/* Level exam card */}
                  {shown.exam && (
                    <ExamCard
                      exam={shown.exam}
                      state={stepState(shown.exam.id)}
                      bestScore={progress.exams[shown.exam.id]?.bestScore}
                      onTake={() => setView({ mode: "exam", id: shown.exam!.id })}
                    />
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function ExamCard({
  exam,
  state,
  bestScore,
  onTake,
}: {
  exam: Exam;
  state: "done" | "current" | "locked";
  bestScore?: number;
  onTake: () => void;
}) {
  return (
    <div className="m-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-gold)] bg-[var(--color-gold-tint)] px-5 py-3 flex items-center gap-3">
      <span className="text-xl">🎓</span>
      <div className="flex-1">
        <p className="font-bold text-sm text-[var(--color-primary)]">{exam.title}</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {state === "done"
            ? `Passed · best ${Math.round((bestScore || 0) * 100)}%`
            : state === "current"
              ? `Ready — pass ${Math.round(exam.passThreshold * 100)}%+ to advance`
              : "Master every lesson above to unlock"}
        </p>
      </div>
      {state === "done" ? (
        <button onClick={onTake} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          Retake
        </button>
      ) : state === "current" ? (
        <button onClick={onTake} className={buttonClasses("exam", "sm")}>
          Take exam
        </button>
      ) : (
        <span className="text-sm">🔒</span>
      )}
    </div>
  );
}

// ------------------- shared question driver -------------------

// A reading-comprehension prompt embeds the passage inside «…» after a
// "Прочитайте…/Read…" lead-in; the follow-up questions on that same passage
// don't repeat it. Peel the passage out so it can render in its own persistent
// panel (and be carried onto the follow-ups), leaving just the question for the
// exercise. Returns isBearer=false for any prompt that isn't a reading passage.
function extractReadingPrompt(promptRu?: string, promptEn?: string) {
  const isBearer = (t?: string) => !!t && /^\s*(прочит|read)/i.test(t);
  if (!isBearer(promptRu) && !isBearer(promptEn)) return { isBearer: false as const };
  const split = (t?: string) => {
    if (!t) return null;
    const open = t.indexOf("«");
    const close = open >= 0 ? t.indexOf("»", open + 1) : -1;
    if (open < 0 || close < 0) return null; // "Прочитайте" with no «…» → not splittable
    const question = t
      .slice(close + 1)
      .replace(/^[\s"'“„”«».,;:—–-]*(вопрос|question)\s*[:.\-–—]?\s*/i, "")
      .trim();
    return { passage: t.slice(open + 1, close).trim(), question };
  };
  const ru = split(promptRu);
  const en = split(promptEn);
  return {
    isBearer: true as const,
    passageRu: ru?.passage,
    questionRu: ru && ru.question ? ru.question : promptRu,
    questionEn: en && en.question ? en.question : promptEn,
  };
}

// The Russian passage as a calm, persistent panel above the question. Height-
// capped with its own scroll so a long text stays put and referenceable while
// the learner works the question below (and re-renders identically per question
// in the group, so it reads as "constant" as the questions change).
function ReadingPassage({ ru }: { ru?: string }) {
  if (!ru) return null;
  return (
    <div className="mb-4 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 max-h-64 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        <span>📖 Текст</span>
        <SpeakButton text={ru} className="w-6 h-6 ml-auto" />
      </div>
      <p className="text-[var(--color-text)] leading-relaxed whitespace-pre-line">{ru}</p>
    </div>
  );
}

function QuestionView({
  q,
  onResult,
  onContinue,
  onAnswer,
  passageForQ,
}: {
  q: Question;
  onResult: (correct: boolean) => void;
  onContinue: () => void;
  /** Fires with the learner's raw answer so an exam can submit answers for server-side
   *  re-grading. Optional — Path lessons don't need it. */
  onAnswer?: (id: string, response: string, correct: boolean) => void;
  /** Carries a reading passage onto follow-up questions that don't repeat it. */
  passageForQ?: (q: Question) => { ru?: string } | null;
}) {
  // Coerce any exercise's response into the plain text the server grades against.
  const answerText = (resp: unknown, label?: string): string =>
    label ?? (typeof resp === "string" ? resp : Array.isArray(resp) ? resp.join(" ") : resp == null ? "" : JSON.stringify(resp));
  // Single choke-point for answer feedback: every exercise type reports through
  // here, so the correct/incorrect cue fires once — and every answer is logged
  // (question + the learner's response + verdict) for the teacher's answer sheets.
  const report = (correct: boolean, resp?: unknown, responseLabel?: string) => {
    logPathAnswer(q, resp, correct, responseLabel);
    onAnswer?.(q.id, answerText(resp, responseLabel), correct);
    sound.play(correct ? "correct" : "incorrect");
    onResult(correct);
  };
  // Reading comprehension: a "bearer" question carries the passage in its prompt;
  // a follow-up gets it from the carry-forward lookup. Either way the exercise
  // shows only the question — the passage lives in its own panel above.
  const reading = extractReadingPrompt(q.promptRu, q.promptEn);
  const carried = !reading.isBearer && passageForQ ? passageForQ(q) : null;
  const passageRu = reading.isBearer ? reading.passageRu : carried?.ru;
  const d = {
    promptRu: reading.isBearer ? reading.questionRu : q.promptRu,
    promptEn: (reading.isBearer ? reading.questionEn : q.promptEn) ?? q.promptEn,
    correctAnswer: q.correctAnswer ?? "",
    distractors: q.distractors ?? [],
    explanationEn: q.explanationEn,
    hintSequence: q.hintSequence ?? [],
    matchPairs: q.matchPairs ?? [],
  };
  function renderExercise() {
  if (q.exerciseType === "fill_blank") {
    return (
      <FillBlank
        promptRu={d.promptRu ?? ""}
        promptEn={d.promptEn}
        correctAnswer={d.correctAnswer}
        distractors={d.distractors}
        explanationEn={d.explanationEn}
        hintSequence={d.hintSequence}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "matching") {
    return (
      <Matching
        promptEn={d.promptEn}
        matchPairs={d.matchPairs}
        explanationEn={d.explanationEn}
        onSubmit={(c, t) => report(c === t, undefined, `${c}/${t} пар`)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "drag_endings" && q.templateRu && q.slots && q.endingBank) {
    return (
      <DragEndings
        promptEn={d.promptEn}
        templateRu={q.templateRu}
        slots={q.slots}
        endingBank={q.endingBank}
        explanationEn={d.explanationEn}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "word_scramble" && q.answer) {
    return (
      <WordScramble
        promptEn={d.promptEn}
        answer={q.answer}
        hintEn={q.hintEn}
        explanationEn={d.explanationEn}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "sentence_builder" && q.correctOrder) {
    return (
      <SentenceBuilder
        promptEn={d.promptEn}
        correctOrder={q.correctOrder}
        distractorTokens={q.distractorTokens}
        translationEn={q.translationEn}
        explanationEn={d.explanationEn}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "listening" && q.textRu) {
    return (
      <Listening
        promptEn={d.promptEn}
        textRu={q.textRu}
        correctAnswer={d.correctAnswer}
        distractors={d.distractors}
        explanationEn={d.explanationEn}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "memory_match" && q.pairs) {
    return (
      <MemoryMatch
        promptEn={d.promptEn}
        pairs={q.pairs}
        explanationEn={d.explanationEn}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
  if (q.exerciseType === "free_response" && q.modelAnswerRu && q.rubricEn) {
    return (
      <FreeResponse
        promptEn={d.promptEn}
        promptRu={d.promptRu}
        modelAnswerRu={q.modelAnswerRu}
        rubricEn={q.rubricEn}
        responseMode={q.responseMode}
        explanationEn={d.explanationEn}
        onSubmit={(r, ok) => report(ok, r)}
        onContinue={onContinue}
      />
    );
  }
    return (
      <MultipleChoice
        promptRu={d.promptRu}
        promptEn={d.promptEn}
        correctAnswer={d.correctAnswer}
        distractors={d.distractors}
        explanationEn={d.explanationEn}
        hintSequence={d.hintSequence}
        onSubmit={(r, ok) => { logPathAnswer(q, r, ok); onAnswer?.(q.id, answerText(r), ok); onResult(ok); }}
        onContinue={onContinue}
      />
    );
  }
  return (
    <>
      <ReadingPassage ru={passageRu} />
      {renderExercise()}
    </>
  );
}

type RunnerItem = { q: Question; section?: string; reviewTopic?: string; reviewLessonId?: string };

function Runner({
  items,
  accentExam,
  onComplete,
  onItemResult,
  onTouchup,
  topicLabel,
  secondsPerQuestion = 0,
  passageForQ,
  onAnswer,
}: {
  items: RunnerItem[];
  accentExam?: boolean;
  onComplete: (correct: number, total: number) => void;
  // Called per interleaved-review item so the topic model updates live.
  onItemResult?: (item: RunnerItem, correct: boolean) => void;
  // Called with each raw answer (id, response, verdict) — an exam uses this to submit
  // answers for server-side re-grading.
  onAnswer?: (id: string, response: string, correct: boolean) => void;
  // If a review item is missed and the learner agrees to refresh, this runs a full
  // refresher LESSON for the topic, then calls resume() to continue right here.
  onTouchup?: (topic: string, resume: () => void) => void;
  topicLabel?: (topic: string) => string;
  /** > 0 = exam-style countdown per question; expiry scores as a miss and moves on. */
  secondsPerQuestion?: number;
  /** Reading comprehension: carries a passage onto follow-up questions. */
  passageForQ?: (q: Question) => { ru?: string } | null;
}) {
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0); // counts NON-review items (drives mastery)
  const [total, setTotal] = useState(0); // counts NON-review items
  const [armed, setArmed] = useState<string | null>(null); // topic just missed
  const [prompt, setPrompt] = useState<string | null>(null); // show "touch up?" prompt
  const [prompted, setPrompted] = useState<Set<string>>(new Set()); // don't re-ask a topic
  const [answeredQ, setAnsweredQ] = useState(false); // stops the countdown once submitted
  const it = items[idx];

  function advance() {
    setAnsweredQ(false);
    if (idx + 1 >= items.length) {
      sound.play("complete");
      onComplete(correct, total);
    } else setIdx((i) => i + 1);
  }

  // Time ran out: score a miss and move straight on (no explanation screen —
  // real exam conditions). Totals are computed locally because setState hasn't
  // landed yet when this question happens to be the last one.
  function handleExpire() {
    sound.play("incorrect");
    setArmed(null);
    setAnsweredQ(false);
    const isLast = idx + 1 >= items.length;
    if (it.reviewTopic) {
      onItemResult?.(it, false);
      if (isLast) {
        sound.play("complete");
        onComplete(correct, total);
      } else setIdx((i) => i + 1);
    } else {
      const newTotal = total + 1;
      setTotal(newTotal);
      if (isLast) {
        sound.play("complete");
        onComplete(correct, newTotal);
      } else setIdx((i) => i + 1);
    }
  }

  function handleResult(c: boolean) {
    setAnsweredQ(true);
    if (it.reviewTopic) {
      onItemResult?.(it, c);
      // A miss on a previously-mastered question is the "sign of weakening" — arm the
      // EXACT source lesson so the refresher redoes the lesson that question came from.
      setArmed(!c && onTouchup && it.reviewLessonId && !prompted.has(it.reviewLessonId) ? it.reviewLessonId : null);
    } else {
      setTotal((t) => t + 1);
      if (c) setCorrect((x) => x + 1);
      setArmed(null);
    }
  }

  function handleContinue() {
    if (armed) {
      setPrompt(armed); // pop the prompt instead of advancing
      setArmed(null);
    } else advance();
  }

  if (!it) return null;

  return (
    <div>
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
          <span>{it.reviewTopic ? "🔁 Review" : it.section || "Practice"}</span>
          <span>{idx + 1} / {items.length}</span>
        </div>
        <ProgressBar value={items.length ? idx / items.length : 0} tone={accentExam ? "exam" : "accent"} />
      </div>
      <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-6">
        {secondsPerQuestion > 0 && !answeredQ && (
          <QuestionTimer
            key={`t${idx}`}
            seconds={it.q.exerciseType === "free_response" ? secondsPerQuestion * 5 : secondsPerQuestion}
            onExpire={handleExpire}
          />
        )}
        <QuestionView key={idx} q={it.q} onResult={handleResult} onContinue={handleContinue} onAnswer={onAnswer} passageForQ={passageForQ} />
      </div>

      {prompt && (
        <TouchupPrompt
          label={topicLabel ? topicLabel(prompt) : prompt}
          onYes={() => { const t = prompt; setPrompted((p) => new Set(p).add(t)); setPrompt(null); onTouchup?.(t, advance); }}
          onNo={() => { setPrompted((p) => new Set(p).add(prompt)); setPrompt(null); advance(); }}
        />
      )}
    </div>
  );
}

function TouchupPrompt({ label, onYes, onNo }: { label: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="fixed inset-0 bg-[var(--color-scrim)] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[var(--radius-card)] p-6 max-w-sm w-full text-center">
        <div className="text-4xl mb-2">🔁</div>
        <h2 className="text-lg font-bold text-[var(--color-primary)]">That one looked a little rusty</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1 mb-4">
          Want to redo the <strong>{label}</strong> lesson — the lesson plus a fresh set of questions? You&apos;ll come right back to where you are.
        </p>
        <div className="flex gap-2">
          <button onClick={onNo} className={`${buttonClasses("secondary", "md")} flex-1`}>
            Keep going
          </button>
          <button onClick={onYes} className={`${buttonClasses("primary", "md")} flex-1`}>
            Redo the lesson
          </button>
        </div>
      </div>
    </div>
  );
}

function RunnerHeader({ title, subtitle, badge, onExit }: { title: string; subtitle: string; badge: string; onExit: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>
        <h1 className="text-lg font-bold text-[var(--color-primary)]">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Chip tone="brand">{badge}</Chip>
        <button onClick={onExit} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          ✕
        </button>
      </div>
    </div>
  );
}

// ------------------- lesson runner (teach → practice → result) -------------------

function LessonRunner({
  lesson,
  topic,
  contextTitle,
  learnerId,
  seenIds,
  track,
  levelId = "A1",
  refresher,
  masteryThreshold = MASTERY_THRESHOLD,
  onExit,
}: {
  lesson: Lesson;
  topic: string;
  contextTitle: string;
  learnerId: string;
  seenIds: string[];
  track: Level[];
  /** CEFR level of this lesson — drives transliteration gating (off B1+). */
  levelId?: string;
  // When true this IS a refresher run: no interleaving, no nested touch-ups.
  refresher?: boolean;
  masteryThreshold?: number;
  onExit: () => void;
}) {
  const showTranslit = translitVisible(levelId);
  // Sample fresh questions for THIS attempt, excluding ones already seen.
  const [sampled] = useState(() => sampleQuestions(lesson.questionBank, lesson.questionsPerAttempt, seenIds));
  const [phase, setPhase] = useState<"teach" | "practice" | "result">("teach");
  const [teachIdx, setTeachIdx] = useState(0);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  // The active refresher: when a review item is missed and the learner agrees, we
  // re-run a full LESSON for that topic over this one, then resume() right here.
  const [refresh, setRefresh] = useState<{ lessonId: string; resume: () => void } | null>(null);

  // Snapshot progress once, then interleave a couple of review questions from
  // previously-mastered topics into this lesson (spaced repetition; a miss surfaces
  // weakening and offers a refresher). Skipped on a refresher run, and empty until
  // the learner has mastered something to review.
  const [items] = useState<RunnerItem[]>(() => {
    const main: RunnerItem[] = sampled.questions.map((q) => ({ q }));
    if (refresher) return main;
    const map = loadProgress(learnerId);
    const reviews: RunnerItem[] = buildInterleavedReview(track, map, topic, 2).map((r) => ({ q: r.question, reviewTopic: r.topic, reviewLessonId: r.lessonId }));
    if (!reviews.length) return main;
    const out: RunnerItem[] = [];
    let r = 0;
    for (let i = 0; i < main.length; i++) {
      out.push(main[i]);
      if ((i + 1) % 2 === 0 && r < reviews.length) out.push(reviews[r++]);
    }
    while (r < reviews.length) out.push(reviews[r++]);
    return out;
  });

  // Task analytics: mark this lesson attempt started; if the learner leaves before
  // finishing (abandon = got bored / stuck), record that on unmount.
  const taskDoneRef = useRef(false);
  useEffect(() => {
    analytics.task(lesson.titleEn, "start", { lessonId: lesson.id, refresher: !!refresher });
    return () => {
      if (!taskDoneRef.current) analytics.task(lesson.titleEn, "abandon", { lessonId: lesson.id });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enriched teach content wins over the generated array when available.
  const teach = TEACH_OVERRIDES[lesson.id] ?? lesson.teach;

  if (phase === "teach") {
    const block = teach[teachIdx];
    const last = teachIdx + 1 >= teach.length;
    return (
      <div className="mx-auto" style={{ maxWidth: "var(--lesson-measure)" }}>
        <RunnerHeader title={lesson.titleEn} subtitle={contextTitle} badge="Learn" onExit={onExit} />
        {/* Center the card in the remaining viewport so it never floats at the
            top with a large dead zone; tall cards (big tables) grow and scroll. */}
        <div className="flex flex-col justify-center min-h-[60vh]">
          <div
            className="lesson-card bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-sm flex items-center justify-center"
            style={{ padding: "var(--lesson-pad)", minHeight: "16rem" }}
            spellCheck={false}
          >
            {/* key resets per-block state + replays the entrance on each slide */}
            <div key={teachIdx} className="animate-teach-in w-full flex items-center justify-center">
              <TeachBlockView block={block} showTranslit={showTranslit} />
            </div>
          </div>
          {/* thin progress bar keeps the "how much is left" answer ambient */}
          <div className="h-1.5 bg-[var(--color-surface-2)] rounded-[var(--radius-pill)] mt-4 overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] rounded-[var(--radius-pill)] transition-all duration-300"
              style={{ width: `${((teachIdx + 1) / teach.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => (teachIdx > 0 ? setTeachIdx((i) => i - 1) : onExit())}
              className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] px-3 py-2 rounded-[var(--radius-control)] transition-colors"
            >
              {teachIdx > 0 ? "← Back" : "Exit"}
            </button>
            <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {teachIdx + 1} / {teach.length}
            </span>
            <button
              onClick={() => (last ? setPhase("practice") : setTeachIdx((i) => i + 1))}
              className="bg-[var(--color-primary)] text-white font-semibold px-6 py-2.5 rounded-[var(--radius-control)] hover:bg-[var(--color-primary-light)] transition-colors"
            >
              {last ? "Start practice →" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const pct = score.total > 0 ? score.correct / score.total : 0;
    const passed = pct >= masteryThreshold;
    return (
      <div className="max-w-2xl mx-auto">
        <RunnerHeader title={lesson.titleEn} subtitle={contextTitle} badge="Result" onExit={onExit} />
        <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-8 text-center">
          <div className="text-5xl mb-3">{passed ? "🎉" : "💪"}</div>
          <h2 className="text-2xl font-bold text-[var(--color-primary)]">
            {score.correct}/{score.total} · {Math.round(pct * 100)}%
          </h2>
          <p className={`mt-2 ${passed ? "text-[var(--color-success)] font-medium" : "text-[var(--color-text-muted)]"}`}>
            {passed
              ? "Lesson mastered — the next step is unlocked!"
              : `You need ${Math.round(masteryThreshold * 100)}% to move on. Try again — you'll get different questions.`}
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <button
              onClick={onExit}
              className={`${passed ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)]" : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"} text-white font-semibold px-8 py-3 rounded-xl transition-colors`}
            >
              {refresher ? "Back to my lesson →" : passed ? "Continue →" : "Back to path"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // practice
  return (
    <div className="max-w-2xl mx-auto">
      <RunnerHeader title={lesson.titleEn} subtitle={contextTitle} badge="Practice" onExit={onExit} />
      <Runner
        items={items}
        onItemResult={(item, correct) => {
          if (item.reviewTopic) recordTopic(learnerId, item.reviewTopic, correct ? 1 : 0, 1);
        }}
        onTouchup={refresher ? undefined : (lessonId, resume) => setRefresh({ lessonId, resume })}
        topicLabel={(id) => findLesson(track, id)?.lesson.titleEn || moduleByTopic(track, topic)?.title || "this"}
        onComplete={(correct, total) => {
          taskDoneRef.current = true;
          analytics.task(lesson.titleEn, "complete", { lessonId: lesson.id, pct: total > 0 ? Math.round((correct / total) * 100) : 0 });
          recordLesson(learnerId, lesson.id, correct, total, sampled.nextSeen, masteryThreshold);
          recordTopic(learnerId, topic, correct, total);
          setScore({ correct, total });
          setPhase("result");
        }}
      />

      {/* Full refresher LESSON over the current one; resume() returns right here. */}
      {refresh && (
        <div className="fixed inset-0 z-40 bg-[var(--color-surface)] overflow-y-auto">
          <div className="max-w-2xl mx-auto py-8 px-4">
            <p className="mb-3 text-sm font-medium text-[var(--color-accent)]">
              🔁 Refresher — you&apos;ll return to your lesson right after this
            </p>
            <RefresherLesson
              lessonId={refresh.lessonId}
              track={track}
              learnerId={learnerId}
              onDone={() => { const resume = refresh.resume; setRefresh(null); resume(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// A full repeat of the EXACT lesson the missed question came from (teach screens +
// a fresh practice set), shown over the current lesson; `onDone` resumes it.
function RefresherLesson({ lessonId, track, learnerId, onDone }: { lessonId: string; track: Level[]; learnerId: string; onDone: () => void }) {
  const found = findLesson(track, lessonId);
  if (!found) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--color-text-muted)] mb-4">Nothing to refresh here.</p>
        <button onClick={onDone} className="bg-[var(--color-primary)] text-white font-semibold px-6 py-3 rounded-xl">Back to my lesson →</button>
      </div>
    );
  }
  const seen = loadProgress(learnerId).lessons[found.lesson.id]?.seenQuestionIds || [];
  return (
    <LessonRunner
      lesson={found.lesson}
      topic={found.module.topic}
      contextTitle={`🔁 Refresher · ${found.module.title}`}
      learnerId={learnerId}
      seenIds={seen}
      track={track}
      levelId={found.level.id}
      refresher
      onExit={onDone}
    />
  );
}

// ------------------- adaptive targeted review -------------------

function ReviewRunner({
  track,
  learnerId,
  progress,
  onExit,
}: {
  track: Level[];
  learnerId: string;
  progress: ProgressMap;
  onExit: () => void;
}) {
  const [items] = useState(() =>
    buildReview(track, weakTopics(progress).map((w) => w.topic), progress, 8)
  );
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <RunnerHeader title="Targeted review" subtitle="Adaptive practice" badge="Review" onExit={onExit} />
        <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-[var(--color-text-muted)]">
            Nothing to review yet — keep going through your lessons and we&apos;ll surface weak spots here.
          </p>
          <button onClick={onExit} className="mt-5 bg-[var(--color-primary)] text-white font-semibold px-6 py-2.5 rounded-xl">
            Back to path
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    const pct = Math.round((correct / items.length) * 100);
    return (
      <div className="max-w-2xl mx-auto">
        <RunnerHeader title="Targeted review" subtitle="Adaptive practice" badge="Review" onExit={onExit} />
        <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-8 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <h2 className="text-2xl font-bold text-[var(--color-primary)]">
            {correct}/{items.length} · {pct}%
          </h2>
          <p className="text-[var(--color-text-muted)] mt-2">
            Your focus areas have been updated based on this review.
          </p>
          <button onClick={onExit} className="mt-6 bg-[var(--color-accent)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-accent-light)]">
            Back to path
          </button>
        </div>
      </div>
    );
  }

  const it = items[idx];
  return (
    <div className="max-w-2xl mx-auto">
      <RunnerHeader title="Targeted review" subtitle="Practice on your weak areas" badge="Review" onExit={onExit} />
      <div className="mb-3">
        <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
          <span>{moduleByTopic(track, it.topic)?.title || "Review"}</span>
          <span>
            {idx + 1} / {items.length}
          </span>
        </div>
        <div className="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--color-accent)] rounded-full transition-all" style={{ width: `${(idx / items.length) * 100}%` }} />
        </div>
      </div>
      <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-6">
        <QuestionView
          key={idx}
          q={it.question}
          onResult={(ok) => {
            recordTopic(learnerId, it.topic, ok ? 1 : 0, 1);
            if (ok) setCorrect((c) => c + 1);
          }}
          onContinue={() => (idx + 1 >= items.length ? setDone(true) : setIdx((i) => i + 1))}
        />
      </div>
    </div>
  );
}

// ------------------- exam runner -------------------

// Every level exam is timed per question ("all level exams" — teacher request).
// Productive free_response questions get 5× this inside the Runner.
const EXAM_SECONDS_PER_QUESTION = 60;

export function ExamRunner({
  exam,
  level,
  learnerId,
  seenIds,
  onExit,
  onGraded,
  recordToPath,
}: {
  exam: Exam;
  level: Level;
  learnerId: string;
  seenIds: string[];
  onExit: () => void;
  /** Fired once the exam is graded — used to record a dean-assigned exam result. The
   *  `answers` array carries the learner's raw per-question responses so a dean-assigned
   *  exam can submit them for SERVER-SIDE re-grading (the client tally isn't trusted). */
  onGraded?: (
    correct: number,
    total: number,
    passed: boolean,
    answers: Array<{ id: string; response: string; correct: boolean }>,
  ) => void;
  /** Persist to the learner's Path progress (unlocks the next level). Default true;
   *  a dean-assigned exam sets false so it stays separate from Path progression. */
  recordToPath?: boolean;
}) {
  // Sample fresh questions per section, accumulating the seen set (no repeats on retake).
  const [{ items, nextSeen, passageByQId }] = useState(() => {
    let seen = seenIds;
    const out: Array<{ q: Question; section?: string }> = [];
    // Reading sections group several questions under one passage: only the first
    // carries the text; the rest say "того же текста". Walk each pool IN ORDER,
    // remembering the current passage, and map EVERY reading question to it — so a
    // sampled follow-up still has its passage even if its lead question wasn't drawn.
    const passageByQId = new Map<string, { ru?: string }>();
    for (const section of exam.sections) {
      if (/reading|чтение/i.test(section.name)) {
        let cur: string | undefined;
        for (const q of section.pool) {
          const r = extractReadingPrompt(q.promptRu, q.promptEn);
          if (r.isBearer && r.passageRu) cur = r.passageRu;
          if (cur) passageByQId.set(q.id, { ru: cur });
        }
      }
      const s = sampleQuestions(section.pool, exam.questionsPerSection, seen);
      seen = s.nextSeen;
      for (const q of s.questions) out.push({ q, section: section.name });
    }
    return { items: out, nextSeen: seen, passageByQId };
  });
  const [phase, setPhase] = useState<"intro" | "exam" | "result">("intro");
  const [score, setScore] = useState({ correct: 0, total: 0 });
  // Accumulates the learner's raw answers as they go, to submit for server-side re-grading.
  const answers = useRef<Array<{ id: string; response: string; correct: boolean }>>([]);

  if (phase === "intro") {
    return (
      <div className="max-w-2xl mx-auto">
        <RunnerHeader title={exam.title} subtitle={`${level.name} · Level Exam`} badge="Exam" onExit={onExit} />
        <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-8 text-center">
          <div className="text-5xl mb-3">🎓</div>
          <h2 className="text-xl font-bold text-[var(--color-primary)] mb-2">{exam.title}</h2>
          <p className="text-[var(--color-text-muted)] mb-4">
            {items.length} questions across {exam.sections.length} sections. Pass mark:{" "}
            <strong>{Math.round(exam.passThreshold * 100)}%</strong>. Passing unlocks the next level.
          </p>
          <div className="text-sm text-[var(--color-text-muted)] mb-6">
            {exam.sections.map((s) => (
              <Chip key={s.name} tone="neutral" className="m-1">{s.name}</Chip>
            ))}
          </div>
          <button
            onClick={() => setPhase("exam")}
            className="bg-[var(--color-gold)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-gold-light)]"
          >
            Begin exam →
          </button>
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const pct = score.total > 0 ? score.correct / score.total : 0;
    const passed = pct >= exam.passThreshold;
    return (
      <div className="max-w-2xl mx-auto">
        <RunnerHeader title={exam.title} subtitle={`${level.name} · Level Exam`} badge="Result" onExit={onExit} />
        <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-8 text-center">
          <div className="text-5xl mb-3">{passed ? "🏆" : "📚"}</div>
          <h2 className="text-2xl font-bold text-[var(--color-primary)]">
            {score.correct}/{score.total} · {Math.round(pct * 100)}%
          </h2>
          <p className={`mt-2 ${passed ? "text-[var(--color-success)] font-medium" : "text-[var(--color-text-muted)]"}`}>
            {passed
              ? `You passed the ${level.id} exam! The next level is unlocked.`
              : `Not yet — you need ${Math.round(exam.passThreshold * 100)}%. Review the lessons and retake; you'll get fresh questions.`}
          </p>
          <button
            onClick={onExit}
            className={`mt-6 font-semibold px-8 py-3 rounded-xl text-white ${passed ? "bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)]" : "bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"}`}
          >
            Back to path
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-2xl mx-auto"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
    >
      <RunnerHeader title={exam.title} subtitle={`${level.name} · Level Exam`} badge="Exam" onExit={onExit} />
      {/* Watermark overlays the exam (pointer-events: none) — screenshots can't be
          blocked on the web, but any leak carries the student's name. */}
      <div className="relative select-none">
        <Runner
          items={items}
          accentExam
          secondsPerQuestion={EXAM_SECONDS_PER_QUESTION}
          passageForQ={(q) => passageByQId.get(q.id) ?? null}
          onAnswer={(id, response, correct) => answers.current.push({ id, response, correct })}
          onComplete={(correct, total) => {
            if (recordToPath !== false) recordExam(learnerId, exam.id, correct, total, nextSeen, exam.passThreshold);
            onGraded?.(correct, total, total > 0 && correct / total >= exam.passThreshold, answers.current);
            setScore({ correct, total });
            setPhase("result");
          }}
        />
        <Watermark text={`${auth.getDisplayName() || learnerId} · Russkiy · ${level.id}`} />
      </div>
    </div>
  );
}

// ------------------- teach block view -------------------

// Column tints for paradigm tables — ONE consistent color per grammatical
// gender/number across the whole platform (dual coding: color carries meaning).
const COL_TINT: Record<string, string> = {
  m: "bg-blue-50 text-blue-900",
  f: "bg-rose-50 text-rose-900",
  n: "bg-amber-50 text-amber-900",
  pl: "bg-green-50 text-green-900",
  accent: "bg-indigo-50 text-indigo-900",
};

// Word-part highlight styles — read from the shared --hl-* token map so the
// "changing part" of a word is coloured identically in every lesson.
const SEGMENT_STYLE: Record<string, string> = {
  prefix: "text-[var(--hl-nom)]",
  stem: "text-[var(--hl-stem)]",
  ending: "text-[var(--hl-ending)] font-black underline decoration-2 underline-offset-2",
  suffix: "text-[var(--hl-dat)] font-bold underline decoration-dotted decoration-2 underline-offset-2",
  stress: "text-[var(--hl-stress)] underline decoration-4 underline-offset-2",
};

// The six grammatical cases → their fixed semantic colour (the single source of
// truth is the --hl-* token map in globals.css).
const CASE_COLOR: Record<string, string> = {
  nom: "var(--hl-nom)",
  gen: "var(--hl-gen)",
  dat: "var(--hl-dat)",
  acc: "var(--hl-acc)",
  instr: "var(--hl-instr)",
  prep: "var(--hl-prep)",
};

// Transliteration visibility: a per-user preference wins; otherwise it's ON for
// A1/A2 and OFF from B1 up — advanced learners should be reading Cyrillic
// directly, and Latin crutches slow that transition (and cluttered the slide).
function translitVisible(levelId: string): boolean {
  if (typeof window !== "undefined") {
    const pref = window.localStorage.getItem("translit_pref");
    if (pref === "on") return true;
    if (pref === "off") return false;
  }
  return levelRank((levelId || "A1") as CEFR) < levelRank("B1");
}

// TryIt: the generation effect — the learner commits to an answer in their
// head BEFORE seeing it. Even a wrong silent guess beats passive reading.
function TryItCard({ block, showTranslit = true }: { block: Lesson["teach"][number]; showTranslit?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="text-center w-full">
      <p className="text-xs uppercase tracking-wide text-[var(--color-accent)] font-semibold mb-2">✍ Try it first</p>
      {block.headingEn && <h2 className="text-lg font-bold text-[var(--color-primary)] mb-2"><GlossText text={block.headingEn} /></h2>}
      {block.promptEn && <p className="text-lg text-[var(--color-text)] mb-4"><GlossText text={block.promptEn} /></p>}
      {!revealed ? (
        <>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">Say your answer out loud or in your head — then check.</p>
          <button
            onClick={() => setRevealed(true)}
            className="border-2 border-dashed border-[var(--color-primary)] text-[var(--color-primary)] font-semibold px-8 py-3 rounded-[var(--radius-control)] hover:bg-[var(--color-primary-tint)]"
          >
            Show the answer
          </button>
        </>
      ) : (
        <div className="animate-fade-in">
          <div className="text-3xl font-bold text-[var(--color-primary)] mb-2 flex items-center justify-center gap-2">
            {block.answerRu}
            {block.answerRu && <SpeakButton text={block.answerRu} className="w-8 h-8" />}
          </div>
          {showTranslit && block.translit && <p className="text-base text-[var(--color-translit)] mb-1">[{block.translit}]</p>}
          {block.answerNote && <p className="lesson-body text-sm text-[var(--color-text-muted)] mt-2 mx-auto"><GlossText text={block.answerNote} /></p>}
        </div>
      )}
    </div>
  );
}

function TeachBlockView({ block, showTranslit = true }: { block: Lesson["teach"][number]; showTranslit?: boolean }) {
  // caseTable — the designed declension/paradigm map: one row per case, a
  // colour rail + coloured ending + question words + a usage example. The
  // single canonical way to present any case paradigm across the course.
  if (block.kind === "caseTable" && block.caseRows) {
    return (
      <div className="w-full">
        {block.headingEn && (
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-lg font-bold text-[var(--color-primary)] text-left"><GlossText text={block.headingEn} /></h2>
            {block.ru && <span className="text-sm text-[var(--color-text-muted)] shrink-0 ru-text">{block.ru}</span>}
          </div>
        )}
        {block.en && <p className="lesson-body text-sm text-[var(--color-text-muted)] mb-4"><GlossText text={block.en} /></p>}
        <div className="space-y-2">
          {block.caseRows.map((row, i) => {
            const c = CASE_COLOR[row.role] || "var(--color-text)";
            return (
              <div key={i} className="flex items-stretch rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white overflow-hidden">
                <div className="w-1.5 shrink-0" style={{ background: c }} />
                <div className="flex items-center gap-3 md:gap-5 py-2.5 px-3 md:px-4 flex-1 flex-wrap">
                  <div className="min-w-[84px]">
                    <p className="font-bold text-sm" style={{ color: c }}>{row.label}</p>
                    {row.question && <p className="text-xs text-[var(--color-text-muted)] ru-text">{row.question}</p>}
                  </div>
                  <p className="text-2xl font-bold min-w-[104px] ru-text">
                    <span className="text-[var(--color-text)]">{row.stem}</span>
                    <span style={{ color: c }}>{row.ending}</span>
                  </p>
                  {row.exampleRu && (
                    <p className="text-sm text-[var(--color-text)] flex-1 min-w-[180px]">
                      <span className="ru-text">{row.exampleRu}</span>
                      {row.gloss && <span className="text-[var(--color-text-muted)]"> — <span className="italic">{row.gloss}</span></span>}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {block.noteEn && <p className="lesson-body text-sm text-[var(--color-text-muted)] mt-3"><GlossText text={block.noteEn} /></p>}
      </div>
    );
  }
  // keyRule — the important rule of the slide, in a navy left-bar callout so
  // the load-bearing sentence stands out from surrounding explanation.
  if (block.kind === "keyRule") {
    return (
      <div className="w-full" style={{ maxWidth: "34rem" }}>
        <div className="rounded-[var(--radius-card)] border-l-4 border-[var(--color-primary)] bg-[var(--color-primary-tint)] p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--color-primary)] font-semibold mb-2">🔑 The key rule</p>
          {block.headingEn && <h2 className="text-base font-bold text-[var(--color-primary)] mb-2 text-left"><GlossText text={block.headingEn} /></h2>}
          {block.en && <p className="lesson-body text-[var(--color-text)]"><GlossText text={block.en} /></p>}
          {block.ru && (
            <p className="text-xl font-bold text-[var(--color-primary)] mt-3 flex items-center gap-2 ru-text">
              {block.ru}
              <SpeakButton text={block.ru} className="w-7 h-7" />
            </p>
          )}
          {showTranslit && block.translit && <p className="text-sm text-[var(--color-translit)] mt-1">[{block.translit}]</p>}
          {block.noteEn && <p className="lesson-body text-xs text-[var(--color-text-muted)] mt-2"><GlossText text={block.noteEn} /></p>}
        </div>
      </div>
    );
  }
  // warning — common mistakes / exceptions, in a gold left-bar callout,
  // deliberately distinct from the navy keyRule.
  if (block.kind === "warning") {
    return (
      <div className="w-full" style={{ maxWidth: "34rem" }}>
        <div className="rounded-[var(--radius-card)] border-l-4 border-[var(--color-warning)] bg-[var(--color-warning-surface)] p-5">
          <p className="text-xs uppercase tracking-wide text-[var(--color-gold)] font-semibold mb-2">⚠ Common mistake</p>
          {block.headingEn && <h2 className="text-base font-bold text-[var(--color-text)] mb-2 text-left"><GlossText text={block.headingEn} /></h2>}
          {block.en && <p className="lesson-body text-[var(--color-text)]"><GlossText text={block.en} /></p>}
          {block.ru && (
            <p className="text-lg font-bold text-[var(--color-text)] mt-3 flex items-center gap-2 ru-text">
              {block.ru}
              <SpeakButton text={block.ru} className="w-7 h-7" />
            </p>
          )}
          {showTranslit && block.translit && <p className="text-sm text-[var(--color-translit)] mt-1">[{block.translit}]</p>}
          {block.noteEn && <p className="lesson-body text-xs text-[var(--color-text-muted)] mt-2"><GlossText text={block.noteEn} /></p>}
        </div>
      </div>
    );
  }
  if (block.kind === "table" && block.rows) {
    return (
      <div className="w-full">
        {block.headingEn && <h2 className="text-lg font-bold text-[var(--color-primary)] mb-1 text-left"><GlossText text={block.headingEn} /></h2>}
        {block.en && <p className="text-sm text-[var(--color-text-muted)] mb-4 text-left"><GlossText text={block.en} /></p>}
        <div className="overflow-x-auto">
          <table className="w-full text-center border-separate border-spacing-1">
            {block.headers && (
              <thead>
                <tr>
                  {block.headers.map((h, i) => (
                    <th key={i} className={`text-xs font-semibold rounded-md px-3 py-2 ${COL_TINT[block.colTints?.[i] || ""] || "bg-gray-100 text-gray-500"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`rounded-md px-3 py-2 text-sm ${
                        c === 0
                          ? "font-semibold text-slate-700 bg-gray-50 text-left"
                          : `${COL_TINT[block.colTints?.[c] || ""] || "bg-white border border-gray-100"} font-medium`
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {block.noteEn && <p className="text-sm text-[var(--color-text-muted)] mt-3 text-left"><GlossText text={block.noteEn} /></p>}
      </div>
    );
  }
  if (block.kind === "compare" && block.leftItems && block.rightItems) {
    return (
      <div className="w-full">
        {block.headingEn && <h2 className="text-lg font-bold text-[var(--color-primary)] mb-1 text-left"><GlossText text={block.headingEn} /></h2>}
        {block.en && <p className="text-sm text-[var(--color-text-muted)] mb-4 text-left"><GlossText text={block.en} /></p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border-2 border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm font-bold text-blue-800 mb-2 text-center">{block.leftTitle}</p>
            <ul className="space-y-1.5">
              {block.leftItems.map((it, i) => (
                <li key={i} className="text-sm text-slate-700"><GlossText text={it} /></li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border-2 border-rose-100 bg-rose-50/50 p-4">
            <p className="text-sm font-bold text-rose-800 mb-2 text-center">{block.rightTitle}</p>
            <ul className="space-y-1.5">
              {block.rightItems.map((it, i) => (
                <li key={i} className="text-sm text-slate-700"><GlossText text={it} /></li>
              ))}
            </ul>
          </div>
        </div>
        {block.noteEn && <p className="text-sm text-[var(--color-text-muted)] mt-3 text-left"><GlossText text={block.noteEn} /></p>}
      </div>
    );
  }
  if (block.kind === "breakdown" && block.segments) {
    return (
      <div className="text-center w-full">
        {block.headingEn && <h2 className="text-lg font-bold text-[var(--color-primary)] mb-3"><GlossText text={block.headingEn} /></h2>}
        <div className="text-5xl font-bold mb-1 flex items-center justify-center gap-0.5 flex-wrap">
          {block.segments.map((s, i) => (
            <span key={i} className={SEGMENT_STYLE[s.role] || "text-slate-800"}>{s.text}</span>
          ))}
          <SpeakButton text={block.segments.map((s) => s.text).join("")} className="w-8 h-8 ml-2" />
        </div>
        {showTranslit && block.translit && <p className="text-base text-[var(--color-translit)] mb-2">[{block.translit}]</p>}
        {block.en && <p className="text-lg text-[var(--color-text)] mb-3"><GlossText text={block.en} /></p>}
        <div className="flex items-center justify-center gap-3 text-xs text-[var(--color-text-muted)]">
          {block.segments.some((s) => s.role === "prefix") && <span><span className="text-[var(--hl-nom)] font-bold">■</span> prefix</span>}
          <span><span className="text-[var(--hl-stem)] font-bold">■</span> stem</span>
          {block.segments.some((s) => s.role === "suffix") && <span><span className="text-[var(--hl-dat)] font-bold">■</span> suffix</span>}
          {block.segments.some((s) => s.role === "ending") && <span><span className="text-[var(--hl-ending)] font-bold">■</span> ending</span>}
          {block.segments.some((s) => s.role === "stress") && <span><span className="text-[var(--hl-stress)] font-bold">■</span> stressed</span>}
        </div>
        {block.noteEn && <p className="text-sm text-[var(--color-text-muted)] mt-3 max-w-md mx-auto"><GlossText text={block.noteEn} /></p>}
      </div>
    );
  }
  if (block.kind === "tryit") {
    return <TryItCard block={block} showTranslit={showTranslit} />;
  }
  if (block.kind === "why") {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
          <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold mb-2">🤔 Why it works this way</p>
          {block.headingEn && <h2 className="text-base font-bold text-amber-900 mb-2"><GlossText text={block.headingEn} /></h2>}
          {block.en && <p className="text-sm text-amber-900 leading-relaxed"><GlossText text={block.en} /></p>}
          {block.ru && (
            <p className="text-lg font-bold text-amber-900 mt-3 flex items-center gap-2">
              {block.ru}
              <SpeakButton text={block.ru} className="w-7 h-7" />
            </p>
          )}
          {block.noteEn && <p className="text-xs text-amber-800/80 mt-2"><GlossText text={block.noteEn} /></p>}
        </div>
      </div>
    );
  }
  if (block.kind === "mnemonic") {
    return (
      <div className="w-full max-w-lg mx-auto text-center">
        <div className="rounded-xl border-2 border-purple-200 bg-purple-50 p-5">
          <p className="text-xs uppercase tracking-wide text-purple-700 font-semibold mb-2">🧠 Memory hook</p>
          <div className="text-4xl mb-2">{block.icon || "💡"}</div>
          {block.ru && (
            <p className="text-2xl font-bold text-purple-900 mb-1 flex items-center justify-center gap-2">
              {block.ru}
              <SpeakButton text={block.ru} className="w-7 h-7" />
            </p>
          )}
          {block.en && <p className="text-sm text-purple-900 leading-relaxed"><GlossText text={block.en} /></p>}
          {block.noteEn && <p className="text-xs text-purple-800/80 mt-2"><GlossText text={block.noteEn} /></p>}
        </div>
      </div>
    );
  }
  if (block.kind === "letter") {
    return (
      <div className="text-center">
        <div className="text-7xl font-black text-[var(--color-primary)] mb-2">{block.ru}</div>
        {block.ru && <div className="mb-2"><SpeakButton text={block.ru} className="w-10 h-10 text-2xl" /></div>}
        {showTranslit && block.translit && <p className="text-lg text-[var(--color-translit)] mb-2">[{block.translit}]</p>}
        {block.en && <p className="text-xl font-medium"><GlossText text={block.en} /></p>}
        {block.noteEn && <p className="text-sm text-[var(--color-text-muted)] mt-3 max-w-sm mx-auto"><GlossText text={block.noteEn} /></p>}
      </div>
    );
  }
  if (block.kind === "example") {
    return (
      <div className="text-center">
        <div className="text-3xl font-bold text-[var(--color-primary)] mb-2 flex items-center justify-center gap-2">
          {block.ru}
          {block.ru && <SpeakButton text={block.ru} className="w-8 h-8" />}
        </div>
        {showTranslit && block.translit && <p className="text-base text-[var(--color-translit)] mb-1">[{block.translit}]</p>}
        {block.en && <p className="text-lg text-[var(--color-text)]"><GlossText text={block.en} /></p>}
        {block.noteEn && <p className="text-sm text-[var(--color-text-muted)] mt-3"><GlossText text={block.noteEn} /></p>}
      </div>
    );
  }
  // Recap tips ("point · point · point") render as a checklist — a scannable
  // summary consolidates far better than the same words as a paragraph.
  const recapItems =
    block.kind === "tip" && block.en && block.en.includes("·")
      ? block.en.split("·").map((s) => s.trim()).filter(Boolean)
      : null;
  return (
    <div className="w-full">
      {block.headingEn && (
        <h2 className="text-xl font-bold text-[var(--color-primary)] mb-3 text-left">
          {block.kind === "tip" ? "💡 " : ""}
          <GlossText text={block.headingEn} />
        </h2>
      )}
      {recapItems ? (
        <ul className="text-left space-y-2">
          {recapItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-base text-[var(--color-text)]">
              <span className="text-[var(--color-success)] font-bold shrink-0 mt-0.5">✓</span>
              <GlossText text={item} />
            </li>
          ))}
        </ul>
      ) : (
        block.en && <p className="lesson-body text-lg text-[var(--color-text)]"><GlossText text={block.en} /></p>
      )}
      {/* A single Russian focal line stays centered — it's a display element the
          eye locks onto, not multi-line reading text. */}
      {block.ru && (
        <p className="lesson-focus text-2xl font-bold text-[var(--color-primary)] mt-3 flex items-center justify-center gap-2">
          {block.ru}
          <SpeakButton text={block.ru} className="w-8 h-8" />
        </p>
      )}
      {block.noteEn && <p className="lesson-body text-sm text-[var(--color-text-muted)] mt-3"><GlossText text={block.noteEn} /></p>}
    </div>
  );
}
