"use client";

import { useState, useEffect, useRef } from "react";
import { MultipleChoice, FillBlank, Matching, Dialogue } from "@/components/exercises";
import { api, type SessionWithItems, type SessionItem } from "@/lib/api";

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
  const startTimeRef = useRef<number>(Date.now());
  const exerciseKeyRef = useRef(0);

  useEffect(() => {
    // Check if placement test is completed — redirect if not
    const placementDone = localStorage.getItem("placement_completed");
    if (!placementDone) {
      window.location.href = "/dashboard/placement";
      return;
    }

    async function loadSession() {
      try {
        const learnerId = localStorage.getItem("learner_id");
        if (!learnerId) {
          setError("No learner profile found. Please sign up or log in again.");
          setLoading(false);
          return;
        }
        const session = await api.generateSession(learnerId, 15);
        if (session && session.items && session.items.length > 0) {
          setSessionData(session);
          const mapped = session.items
            .map(exerciseFromItem)
            .filter((e): e is NonNullable<typeof e> => e !== null);
          if (mapped.length > 0) {
            setExercises(mapped);
          } else {
            setError("Session generated but no exercises could be loaded.");
          }
        } else {
          setError("Could not generate a session. Try again later.");
        }
      } catch {
        setError("Could not connect to the API. Make sure the server is running.");
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const exercise = exercises[currentIndex];
  const progress = exercises.length > 0 ? (currentIndex / exercises.length) * 100 : 0;
  const totalXP = results.reduce((sum, r) => sum + r.xp, 0);

  // Called when user checks their answer — shows feedback, submits to API, but does NOT advance
  async function handleAnswerSubmit(response: string, correct: boolean, hintLevel: number) {
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

    setPendingResult({ correct, xp });
  }

  // Called when user clicks "Continue" after seeing feedback — advances to next exercise
  function handleContinue() {
    if (!pendingResult) return;

    startTimeRef.current = Date.now();
    const newResults = [...results, pendingResult];
    setResults(newResults);
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

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto mt-20 text-center">
        <div className="animate-pulse">
          <div className="h-3 bg-gray-200 rounded-full mb-8" />
          <div className="h-64 bg-gray-100 rounded-xl" />
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
            className="bg-[var(--color-accent)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-accent-light)] transition-colors"
          >
            Try Again
          </button>
          <a
            href="/dashboard"
            className="bg-gray-100 text-gray-700 font-semibold px-8 py-3 rounded-xl hover:bg-gray-200 transition-colors"
          >
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
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-[var(--color-primary)]">
              {correctCount}/{results.length}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Correct</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-green-600">+{totalXP}</p>
            <p className="text-xs text-[var(--color-text-muted)]">XP Earned</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-[var(--color-gold)]">
              {Math.round((correctCount / results.length) * 100)}%
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Accuracy</p>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="bg-[var(--color-accent)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-accent-light)] transition-colors"
          >
            Practice Again
          </button>
          <a
            href="/dashboard"
            className="bg-gray-100 text-gray-700 font-semibold px-8 py-3 rounded-xl hover:bg-gray-200 transition-colors"
          >
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
      {/* Progress bar */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          {currentIndex + 1}/{exercises.length}
        </span>
        <span className="text-sm font-bold text-green-600">+{totalXP} XP</span>
      </div>

      {/* Role badge */}
      <div className="flex items-center justify-between mb-8">
        <span className="text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
          {ROLE_LABELS[exercise.role] || exercise.role}
        </span>
        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
          Live &bull; Adaptive
        </span>
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
          onComplete={() => {
            handleAnswerSubmit("dialogue_complete", true, 0);
            // Auto-advance for dialogues since there's nothing to "check"
            setTimeout(() => handleContinue(), 0);
          }}
        />
      )}
    </div>
  );
}
