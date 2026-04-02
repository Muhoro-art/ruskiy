"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MultipleChoice, FillBlank, Matching } from "@/components/exercises";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface PlacementItem {
  skillId: string;
  cefrLevel: string;
  stage: string;
  stageIndex: number;
  content: {
    id: string;
    contentType: string;
    exerciseType: string;
    contentData: Record<string, unknown>;
    targetSkills: string[];
  };
}

interface StageInfo {
  name: string;
  label: string;
  description: string;
}

interface PlacementResponse {
  learnerId: string;
  items: PlacementItem[];
  total: number;
  stageMinPass: number[];
  stages: StageInfo[];
}

const LEVEL_COLORS: Record<string, string> = {
  A1: "#22c55e",
  A2: "#84cc16",
  B1: "#eab308",
  B2: "#f97316",
  C1: "#ef4444",
  C2: "#dc2626",
};

const LEVEL_LABELS: Record<string, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Mastery",
};

// Encouraging stage transition messages
const STAGE_PASS_MESSAGES = [
  "You know your letters! Let's see if you know some words...",
  "Nice — you know some Russian words! Let's test basic sentences...",
  "Great grammar skills! Let's try something harder...",
  "Impressive! You know your cases. Let's push further...",
  "You're doing amazing! One more stage...",
  "Wow — you really know your Russian!",
];

const STAGE_FAIL_MESSAGES = [
  "No worries! We'll start from the very beginning — learning the Cyrillic alphabet. You'll be reading Russian in no time!",
  "Good start with letters! We'll begin with basic vocabulary and build from there.",
  "You know some words! We'll start with basic grammar and sentences.",
  "Solid foundation! We'll pick up from elementary grammar.",
  "Great skills! We'll start you at pre-intermediate level.",
  "Excellent Russian! We've placed you at intermediate.",
];

export default function PlacementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PlacementItem[]>([]);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [stageMinPass, setStageMinPass] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<
    Array<{ skillId: string; cefrLevel: string; isCorrect: boolean; stage: string; stageIndex: number }>
  >([]);
  const [pendingResult, setPendingResult] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"loading" | "intro" | "stage_intro" | "testing" | "submitting" | "result">("loading");
  const [determinedLevel, setDeterminedLevel] = useState("");
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [stoppedStage, setStoppedStage] = useState(-1);
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [stageMessage, setStageMessage] = useState("");
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    generatePlacement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generatePlacement() {
    const token = localStorage.getItem("access_token");
    const learnerId = localStorage.getItem("learner_id");
    if (!token || !learnerId) {
      router.push("/login");
      return;
    }

    try {
      const res = await fetch(`${API}/v1/placement/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ learnerId }),
      });

      if (!res.ok) throw new Error("Failed to generate placement test");

      const data: PlacementResponse = await res.json();
      setItems(data.items || []);
      setStages(data.stages || []);
      setStageMinPass(data.stageMinPass || []);
      setPhase("intro");
    } catch {
      router.push("/dashboard/learn");
    } finally {
      setLoading(false);
    }
  }

  // Count correct answers for a specific stage
  function getStageCorrect(stageIdx: number): number {
    return results.filter((r) => r.stageIndex === stageIdx && r.isCorrect).length;
  }

  // Check if we should stop after current answer (stage failed)
  function checkStageCompletion(newResults: typeof results, answeredItem: PlacementItem) {
    const stageIdx = answeredItem.stageIndex;
    const stageItems = items.filter((it) => it.stageIndex === stageIdx);
    const stageResults = newResults.filter((r) => r.stageIndex === stageIdx);

    // Have we answered all questions in this stage?
    if (stageResults.length >= stageItems.length) {
      const correct = stageResults.filter((r) => r.isCorrect).length;
      const minNeeded = stageMinPass[stageIdx] ?? 1;

      if (correct < minNeeded) {
        // Stage failed — stop here, this is their ceiling
        return { stageDone: true, stagePassed: false };
      } else {
        // Stage passed — move to next stage
        return { stageDone: true, stagePassed: true };
      }
    }

    return { stageDone: false, stagePassed: false };
  }

  function handleAnswerMC(_response: string, isCorrect: boolean, _hintLevel: number) {
    const item = items[currentIndex];
    setPendingResult(isCorrect);
    setResults((prev) => [...prev, {
      skillId: item.skillId, cefrLevel: item.cefrLevel, isCorrect,
      stage: item.stage, stageIndex: item.stageIndex,
    }]);
  }

  function handleAnswerMatching(correctCount: number, totalCount: number) {
    const item = items[currentIndex];
    const isCorrect = correctCount === totalCount;
    setPendingResult(isCorrect);
    setResults((prev) => [...prev, {
      skillId: item.skillId, cefrLevel: item.cefrLevel, isCorrect,
      stage: item.stage, stageIndex: item.stageIndex,
    }]);
  }

  function handleContinue() {
    setPendingResult(null);
    const item = items[currentIndex];
    const allResults = [...results];

    const { stageDone, stagePassed } = checkStageCompletion(allResults, item);

    if (stageDone) {
      if (!stagePassed) {
        // Learner hit their ceiling — stop testing
        setStoppedStage(item.stageIndex);
        setStageMessage(STAGE_FAIL_MESSAGES[item.stageIndex] || "We've found your level!");
        submitPlacement(item.stageIndex);
        return;
      }

      // Stage passed — check if there are more stages
      const nextStageIdx = item.stageIndex + 1;
      const nextItems = items.filter((it) => it.stageIndex === nextStageIdx);

      if (nextItems.length === 0) {
        // No more stages — they passed everything!
        setStoppedStage(-1);
        submitPlacement(-1);
        return;
      }

      // Show stage transition screen
      setCurrentStageIdx(nextStageIdx);
      setStageMessage(STAGE_PASS_MESSAGES[item.stageIndex] || "Great job! Moving on...");
      setPhase("stage_intro");
      return;
    }

    // More questions in current stage
    setCurrentIndex((prev) => prev + 1);
  }

  function continueToNextStage() {
    const nextIdx = items.findIndex((it) => it.stageIndex === currentStageIdx);
    if (nextIdx >= 0) {
      setCurrentIndex(nextIdx);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
    setPhase("testing");
  }

  async function submitPlacement(stopped: number) {
    setPhase("submitting");
    const token = localStorage.getItem("access_token");
    const learnerId = localStorage.getItem("learner_id");

    const apiResults = results.map((r) => ({
      skillId: r.skillId,
      isCorrect: r.isCorrect,
      cefrLevel: r.cefrLevel,
    }));

    try {
      const res = await fetch(`${API}/v1/placement/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ learnerId, results: apiResults, stoppedStage: stopped }),
      });

      if (res.ok) {
        const data = await res.json();
        setDeterminedLevel(data.determinedLevel);
        setTotalCorrect(data.totalCorrect);
        localStorage.setItem("placement_completed", "true");
        localStorage.setItem("current_level", data.determinedLevel);
      }
    } catch {
      // Non-fatal
    }

    setPhase("result");
  }

  function skipPlacement() {
    localStorage.setItem("placement_completed", "true");
    localStorage.setItem("current_level", "A1");
    router.push("/dashboard/learn");
  }

  function startLearning() {
    router.push("/dashboard/learn");
  }

  // --- RENDER ---

  if (loading || phase === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)] mx-auto mb-4" />
          <p className="text-[var(--color-text-muted)]">Preparing your assessment...</p>
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl text-white">🎯</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Level Assessment</h1>
          <p className="text-lg text-gray-600 max-w-md mx-auto">
            Let&apos;s find out where to start your Russian journey.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-lg mb-4">How it works:</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shrink-0">1</span>
              <span className="text-gray-700">We start with the <strong>basics</strong> — recognizing Russian letters</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shrink-0">2</span>
              <span className="text-gray-700">If you pass a stage, we move to the <strong>next level</strong> — words, then grammar</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shrink-0">3</span>
              <span className="text-gray-700">We <strong>stop</strong> when we find your level — no wasted time on material that&apos;s too hard</span>
            </li>
          </ul>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-amber-800 text-sm">
            <strong>Don&apos;t worry</strong> — most people don&apos;t get past the first two stages. That&apos;s completely normal! This test is designed to find exactly where you are, even if you know zero Russian.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={skipPlacement}
            className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50"
          >
            Skip — I know zero Russian
          </button>
          <button
            onClick={() => { setPhase("testing"); startTimeRef.current = Date.now(); }}
            className="flex-1 bg-[var(--color-accent)] text-white font-semibold py-3 rounded-lg hover:opacity-90"
          >
            Start Assessment
          </button>
        </div>
      </div>
    );
  }

  // Stage transition screen — shown between stages when learner passes
  if (phase === "stage_intro") {
    const stageInfo = stages[currentStageIdx];
    const prevCorrect = getStageCorrect(currentStageIdx - 1);

    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Stage {currentStageIdx} Passed!
          </h2>
          <p className="text-lg text-gray-600 mb-1">
            {stageMessage}
          </p>
          <p className="text-sm text-gray-400">
            You got {prevCorrect} correct in the previous stage
          </p>
        </div>

        {stageInfo && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8 text-center">
            <h3 className="font-semibold text-lg text-[var(--color-primary)] mb-2">
              Next: {stageInfo.label}
            </h3>
            <p className="text-gray-600">{stageInfo.description}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              setStoppedStage(currentStageIdx);
              submitPlacement(currentStageIdx);
            }}
            className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50"
          >
            That&apos;s my level
          </button>
          <button
            onClick={continueToNextStage}
            className="flex-1 bg-[var(--color-accent)] text-white font-semibold py-3 rounded-lg hover:opacity-90"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-accent)] mx-auto mb-4" />
          <p className="text-[var(--color-text-muted)]">Analyzing your results...</p>
        </div>
      </div>
    );
  }

  if (phase === "result") {
    const color = LEVEL_COLORS[determinedLevel] || "#1e3a5f";
    const label = LEVEL_LABELS[determinedLevel] || "Beginner";
    const totalAnswered = results.length;
    const failMessage = stoppedStage >= 0 ? STAGE_FAIL_MESSAGES[stoppedStage] : "";

    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: color + "20", border: `3px solid ${color}` }}
          >
            <span className="text-4xl font-black" style={{ color }}>{determinedLevel}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Level: {determinedLevel}</h1>
          <p className="text-lg text-gray-600">{label}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-[var(--color-primary)]">{totalCorrect}</div>
              <div className="text-sm text-gray-500">Correct</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-400">{totalAnswered}</div>
              <div className="text-sm text-gray-500">Questions Answered</div>
            </div>
          </div>
        </div>

        {/* Stage progress visualization */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-4">Your Progress</h3>
          <div className="space-y-2">
            {stages.map((stage, idx) => {
              const stageCorrect = results.filter((r) => r.stageIndex === idx && r.isCorrect).length;
              const stageTotal = results.filter((r) => r.stageIndex === idx).length;
              const passed = stageTotal > 0 && stageCorrect >= (stageMinPass[idx] ?? 1);
              const attempted = stageTotal > 0;
              const failed = attempted && !passed;

              return (
                <div key={stage.name} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    passed ? "bg-green-100 text-green-600" :
                    failed ? "bg-red-100 text-red-500" :
                    "bg-gray-100 text-gray-400"
                  }`}>
                    {passed ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : failed ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <span className="text-xs">-</span>
                    )}
                  </div>
                  <span className={`text-sm flex-1 ${attempted ? "text-gray-700" : "text-gray-400"}`}>
                    {stage.label}
                  </span>
                  {attempted && (
                    <span className={`text-xs font-medium ${passed ? "text-green-600" : "text-red-500"}`}>
                      {stageCorrect}/{stageTotal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 mb-8">
          <p className="text-blue-800 text-sm">
            {failMessage || (
              <>
                <strong>Excellent!</strong> You passed all stages. Your curriculum has been personalized
                to match your advanced level. We&apos;ll skip the basics you already know.
              </>
            )}
          </p>
        </div>

        <button
          onClick={startLearning}
          className="w-full bg-[var(--color-accent)] text-white font-semibold py-4 rounded-lg hover:opacity-90 text-lg"
        >
          Start Learning
        </button>
      </div>
    );
  }

  // --- TESTING PHASE ---
  const item = items[currentIndex];
  if (!item) {
    submitPlacement(-1);
    return null;
  }

  const data = item.content?.contentData || {};
  const exerciseType = item.content?.exerciseType || item.content?.contentType || "multiple_choice";

  // Calculate progress within current stage
  const stageItems = items.filter((it) => it.stageIndex === item.stageIndex);
  const stageAnswered = results.filter((r) => r.stageIndex === item.stageIndex).length;
  const stageLabel = stages[item.stageIndex]?.label || `Stage ${item.stageIndex + 1}`;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Stage + Progress */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-[var(--color-primary)]">
            {stageLabel}
          </span>
          <span className="text-sm text-gray-500">
            Question {stageAnswered + 1} of {stageItems.length}
          </span>
        </div>

        {/* Stage dots */}
        <div className="flex gap-1 mb-3">
          {stages.map((s, idx) => (
            <div
              key={s.name}
              className={`h-1.5 flex-1 rounded-full ${
                idx < item.stageIndex ? "bg-green-400" :
                idx === item.stageIndex ? "bg-[var(--color-accent)]" :
                "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Question progress within stage */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] transition-all duration-500"
            style={{ width: `${((stageAnswered + (pendingResult !== null ? 1 : 0)) / stageItems.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Exercise */}
      <div key={currentIndex} className="bg-white rounded-2xl border border-gray-200 p-6">
        {exerciseType === "multiple_choice" && (
          <MultipleChoice
            promptRu={data.promptRu as string}
            promptEn={data.promptEn as string}
            correctAnswer={data.correctAnswer as string}
            distractors={(data.distractors as string[]) || []}
            explanationEn={data.explanationEn as string}
            onSubmit={handleAnswerMC}
            onContinue={handleContinue}
          />
        )}
        {exerciseType === "fill_blank" && (
          <FillBlank
            promptRu={data.promptRu as string}
            promptEn={data.promptEn as string}
            correctAnswer={data.correctAnswer as string}
            distractors={(data.distractors as string[]) || []}
            explanationEn={data.explanationEn as string}
            onSubmit={handleAnswerMC}
            onContinue={handleContinue}
          />
        )}
        {exerciseType === "matching" && (
          <Matching
            promptEn={data.promptEn as string}
            matchPairs={(data.matchPairs as Array<{ left: string; right: string }>) || []}
            explanationEn={data.explanationEn as string}
            onSubmit={handleAnswerMatching}
            onContinue={handleContinue}
          />
        )}
        {exerciseType === "translation" && (
          <MultipleChoice
            promptRu={data.promptRu as string}
            promptEn={data.promptEn as string || "Translate:"}
            correctAnswer={data.correctAnswer as string}
            distractors={(data.distractors as string[]) || []}
            explanationEn={data.explanationEn as string}
            onSubmit={handleAnswerMC}
            onContinue={handleContinue}
          />
        )}
        {!["multiple_choice", "fill_blank", "matching", "translation"].includes(exerciseType) && (
          <MultipleChoice
            promptRu={data.promptRu as string}
            promptEn={data.promptEn as string || "Choose the correct answer:"}
            correctAnswer={data.correctAnswer as string || ""}
            distractors={(data.distractors as string[]) || []}
            explanationEn={data.explanationEn as string}
            onSubmit={handleAnswerMC}
            onContinue={handleContinue}
          />
        )}
      </div>

      {/* Skip option */}
      <div className="text-center mt-4">
        <button
          onClick={skipPlacement}
          className="text-sm text-gray-400 hover:text-gray-600 underline"
        >
          Skip — start as complete beginner
        </button>
      </div>
    </div>
  );
}
