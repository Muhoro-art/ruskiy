"use client";

import { useState, useEffect, useRef } from "react";
import { MultipleChoice, FillBlank, Matching, Dialogue } from "@/components/exercises";
import { api, type SessionWithItems, type SessionItem } from "@/lib/api";
import { auth } from "@/lib/auth";
import { buildLocalSession } from "@/content";
import { Chip, Callout, buttonClasses } from "@/components/ui";

type ExerciseData = { type: string; role: string; data: Record<string, unknown> };

const ROLE_LABELS: Record<string, string> = {
  warmup: "Warm-Up", ramp: "Ramp Up", core: "Core Practice",
  relief: "Cultural Break", challenge: "Challenge", cooldown: "Cool Down",
};

function exerciseFromItem(item: SessionItem): ExerciseData | null {
  if (!item.content) return null;
  const data = item.content.contentData as Record<string, unknown>;
  const type = item.content.exerciseType || item.content.contentType;
  return { type, role: item.role, data };
}

export default function LearnPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<Array<{ correct: boolean; xp: number }>>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionData, setSessionData] = useState<SessionWithItems | null>(null);
  const [exercises, setExercises] = useState<ExerciseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingResult, setPendingResult] = useState<{ correct: boolean; xp: number } | null>(null);
  const [usingLocal, setUsingLocal] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const exerciseKeyRef = useRef(0);

  // Fall back to the curated literature/history library when the adaptive API
  // can't produce a session — the learn flow still works and shows real content.
  function loadLocalFallback() {
    const local = buildLocalSession(8).map((e) => ({ type: e.type, role: e.role, data: e.data }));
    if (local.length > 0) {
      setExercises(local);
      setUsingLocal(true);
      setError("");
    } else {
      setError("No exercises available right now. Please try again later.");
    }
  }

  useEffect(() => {
    // Check if placement test is completed — redirect if not. Uses the typed
    // checker (=== "true") so a "false" string isn't mistaken for completion.
    if (!auth.isPlacementCompleted()) {
      window.location.href = "/dashboard/placement";
      return;
    }

    async function loadSession() {
      try {
        const learnerId = auth.getLearnerId();
        if (!learnerId) {
          // No profile (e.g. offline / not signed up) — use the local library.
          loadLocalFallback();
          setLoading(false);
          return;
        }
        const session = await api.generateSession(learnerId, 15);
        if (session && session.items && session.items.length > 0) {
          const mapped = session.items
            .map(exerciseFromItem)
            .filter((e): e is NonNullable<typeof e> => e !== null);
          if (mapped.length > 0) {
            setSessionData(session);
            setExercises(mapped);
          } else {
            loadLocalFallback();
          }
        } else {
          loadLocalFallback();
        }
      } catch {
        // API unreachable — fall back to the curated library so learning continues.
        loadLocalFallback();
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const exercise = exercises[currentIndex];
  const progress = exercises.length > 0 ? (currentIndex / exercises.length) * 100 : 0;
  const totalXP = results.reduce((sum, r) => sum + r.xp, 0);

  // Called when user checks their answer — shows feedback, submits to API, but does NOT advance.
  // Returns the scored result so callers that advance immediately (dialogues) don't have to
  // wait for the pendingResult state to commit.
  async function handleAnswerSubmit(
    response: string,
    correct: boolean,
    hintLevel: number
  ): Promise<{ correct: boolean; xp: number }> {
    const elapsed = Date.now() - startTimeRef.current;
    let xp = correct ? 15 + Math.floor(Math.random() * 10) : 3;

    // Submit to API
    if (sessionData) {
      const item = sessionData.items[currentIndex];
      if (item) {
        try {
          const contentData = item.content?.contentData as Record<string, unknown> | undefined;
          const result = await api.submitAnswer(sessionData.id, {
            contentId: item.contentId,
            learnerId: sessionData.learnerId,
            response: response,
            correctAnswer: String(contentData?.correctAnswer || ""),
            isCorrect: correct,
            responseTimeMs: elapsed,
            hintLevelUsed: hintLevel,
          });
          if (result && result.xpEarned) {
            xp = result.xpEarned;
          }
        } catch {
          // Non-fatal — use local XP calculation
        }
      }
    }

    const scored = { correct, xp };
    setPendingResult(scored);
    return scored;
  }

  // Records a result and moves to the next exercise (or completes the session).
  // Takes the result explicitly so it never depends on un-committed pendingResult state.
  function advance(result: { correct: boolean; xp: number }) {
    startTimeRef.current = Date.now();
    setResults((prev) => [...prev, result]);
    setPendingResult(null);
    exerciseKeyRef.current++;

    if (currentIndex + 1 >= exercises.length) {
      setSessionComplete(true);
      // Complete session via API
      if (sessionData) {
        api.completeSession(sessionData.id).catch(() => {});
      }
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  }

  // Called when user clicks "Continue" after seeing feedback — advances to next exercise
  function handleContinue() {
    if (!pendingResult) return;
    advance(pendingResult);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto mt-20 text-center">
        <div className="animate-pulse">
          <div className="h-3 bg-[var(--color-surface-2)] rounded-full mb-8" />
          <div className="h-64 bg-[var(--color-surface-2)] rounded-[var(--radius-card)]" />
        </div>
        <p className="text-[var(--color-text-muted)] mt-4">Generating your adaptive session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <div className="text-5xl mb-6">&#9888;&#65039;</div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)] mb-4">Session Unavailable</h1>
        <p className="text-[var(--color-text-muted)] mb-8">{error}</p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => window.location.reload()}
            className={buttonClasses("primary", "lg")}
          >
            Try Again
          </button>
          <a href="/dashboard" className={buttonClasses("secondary", "lg")}>
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    const correctCount = results.filter((r) => r.correct).length;
    return (
      <div className="max-w-xl mx-auto mt-12 text-center">
        <div className="text-6xl mb-6">&#127881;</div>
        <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-4">
          Session Complete!
        </h1>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
            <p className="text-2xl font-bold text-[var(--color-primary)]">
              {correctCount}/{results.length}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Correct</p>
          </div>
          <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
            <p className="text-2xl font-bold text-[var(--color-gold)]">+{totalXP}</p>
            <p className="text-xs text-[var(--color-text-muted)]">XP Earned</p>
          </div>
          <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-4">
            <p className="text-2xl font-bold text-[var(--color-gold)]">
              {Math.round((correctCount / results.length) * 100)}%
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Accuracy</p>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => window.location.reload()}
            className={buttonClasses("primary", "lg")}
          >
            Practice Again
          </button>
          <a href="/dashboard" className={buttonClasses("secondary", "lg")}>
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!exercise) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <p className="text-[var(--color-text-muted)]">No exercises available.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {usingLocal && (
        <Callout tone="info" className="mb-4 text-xs text-center">
          📚 Practicing from the offline Library (literature &amp; history). Progress won&apos;t sync until you&apos;re back online.
        </Callout>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex-1 h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-medium text-[var(--color-text-muted)] tabular-nums">
          {currentIndex + 1}/{exercises.length}
        </span>
        <span className="text-sm font-bold text-[var(--color-gold)] tabular-nums">+{totalXP} XP</span>
      </div>

      {/* Role badge */}
      <div className="flex items-center justify-between mb-8">
        <Chip tone="brand">{ROLE_LABELS[exercise.role] || exercise.role}</Chip>
        <Chip tone={usingLocal ? "gold" : "success"}>{usingLocal ? "Library" : "Live · Adaptive"}</Chip>
      </div>

      {/* Exercise rendering */}
      {(exercise.type === "multiple_choice" || exercise.type === "translation") && (
        <MultipleChoice
          key={exerciseKeyRef.current}
          promptRu={exercise.data.promptRu as string}
          promptEn={exercise.data.promptEn as string}
          correctAnswer={exercise.data.correctAnswer as string}
          distractors={(exercise.data.distractors as string[]) || []}
          explanationEn={exercise.data.explanationEn as string}
          hintSequence={exercise.data.hintSequence as string[]}
          onSubmit={(response, isCorrect, hintLevel) => handleAnswerSubmit(response, isCorrect, hintLevel)}
          onContinue={handleContinue}
        />
      )}

      {exercise.type === "fill_blank" && (
        <FillBlank
          key={exerciseKeyRef.current}
          promptRu={exercise.data.promptRu as string}
          promptEn={exercise.data.promptEn as string}
          correctAnswer={exercise.data.correctAnswer as string}
          distractors={exercise.data.distractors as string[]}
          explanationEn={exercise.data.explanationEn as string}
          hintSequence={exercise.data.hintSequence as string[]}
          onSubmit={(response, isCorrect, hintLevel) => handleAnswerSubmit(response, isCorrect, hintLevel)}
          onContinue={handleContinue}
        />
      )}

      {exercise.type === "matching" && (
        <Matching
          key={exerciseKeyRef.current}
          promptEn={exercise.data.promptEn as string}
          matchPairs={(exercise.data.matchPairs as Array<{ left: string; right: string }>) || []}
          explanationEn={exercise.data.explanationEn as string}
          onSubmit={(correct, total) => handleAnswerSubmit(String(correct), correct === total, 0)}
          onContinue={handleContinue}
        />
      )}

      {(exercise.type === "dialogue" || exercise.type === "scenario") && (
        <Dialogue
          key={exerciseKeyRef.current}
          dialogueLines={(exercise.data.dialogueLines as Array<{ speaker: string; textRu: string; textEn: string }>) || []}
          explanationEn={exercise.data.explanationEn as string}
          onComplete={async () => {
            // Dialogues have nothing to "check" — submit, then advance with the
            // returned result directly (no reliance on un-committed state).
            const scored = await handleAnswerSubmit("dialogue_complete", true, 0);
            advance(scored);
          }}
        />
      )}
    </div>
  );
}
