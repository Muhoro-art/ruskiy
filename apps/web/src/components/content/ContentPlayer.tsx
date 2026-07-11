"use client";

// ContentPlayer renders one teacher-authored Студия item exactly as a learner
// experiences it — atomic exercises directly, composites as a sequential
// step-player with progress dots. Shared by: the learner assignment page, the
// admin moderation preview, and the Студия's own live preview, so all three
// always agree on what the content looks like.
//
// It supports the platform's FULL exercise engine — all ten interactive types —
// so a teacher's creative space is the whole toolbox, not a subset.

import { useEffect, useRef, useState } from "react";
import { MultipleChoice } from "@/components/exercises/MultipleChoice";
import { FillBlank } from "@/components/exercises/FillBlank";
import { WordScramble } from "@/components/exercises/WordScramble";
import { Matching } from "@/components/exercises/Matching";
import { SentenceBuilder } from "@/components/exercises/SentenceBuilder";
import { Listening } from "@/components/exercises/Listening";
import { MemoryMatch } from "@/components/exercises/MemoryMatch";
import { DragEndings } from "@/components/exercises/DragEndings";
import { FreeResponse } from "@/components/exercises/FreeResponse";
import { Dialogue } from "@/components/exercises/Dialogue";

export type AtomicType =
  | "multiple_choice"
  | "fill_blank"
  | "word_scramble"
  | "matching"
  | "sentence_builder"
  | "listening"
  | "memory_match"
  | "drag_endings"
  | "free_response"
  | "dialogue";

export const ATOMIC_TYPE_IDS: AtomicType[] = [
  "multiple_choice", "fill_blank", "word_scramble", "matching", "sentence_builder",
  "listening", "memory_match", "drag_endings", "free_response", "dialogue",
];

export interface AtomicData {
  promptEn?: string;
  promptRu?: string;
  correctAnswer?: string;
  answer?: string;
  hintEn?: string;
  explanationEn?: string;
  distractors?: string[];
  matchPairs?: Array<{ left: string; right: string }>;
  // sentence_builder
  correctOrder?: string[];
  distractorTokens?: string[];
  translationEn?: string;
  // listening
  textRu?: string;
  // memory_match
  pairs?: Array<{ ru: string; en: string }>;
  // drag_endings
  templateRu?: string;
  slots?: Array<{ stem: string; correct: string }>;
  endingBank?: string[];
  // free_response
  modelAnswerRu?: string;
  rubricEn?: string[];
  responseMode?: "writing" | "speaking";
  // dialogue
  dialogueLines?: Array<{ speaker: string; textRu: string; textEn: string }>;
}
export interface CompositeStep {
  type: AtomicType;
  data: AtomicData;
}

export interface PlayableItem {
  exerciseType: string;
  contentData: Record<string, unknown>;
}

// asAnswerText flattens whatever shape an exercise reports as the response
// into a short human-readable string for the teacher's per-question review.
function asAnswerText(resp: unknown): string {
  if (resp == null) return "";
  if (typeof resp === "string") return resp.slice(0, 300);
  if (Array.isArray(resp)) return resp.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ").slice(0, 300);
  if (typeof resp === "object") {
    try { return JSON.stringify(resp).slice(0, 300); } catch { return ""; }
  }
  return String(resp).slice(0, 300);
}

// stepPrompt / stepExpected: what the question ASKED and what the right answer
// WAS — recorded with each result so the teacher reviews real questions, not
// just green/red counts.
export function stepPrompt(t: AtomicType, d: AtomicData): string {
  return (
    d.promptEn || d.promptRu || d.textRu || d.templateRu ||
    (d.dialogueLines && d.dialogueLines[0] ? d.dialogueLines[0].textRu : "") || ""
  ).slice(0, 300);
}
export function stepExpected(t: AtomicType, d: AtomicData): string {
  switch (t) {
    case "multiple_choice":
    case "fill_blank":
    case "listening":
      return (d.correctAnswer || "").slice(0, 300);
    case "word_scramble":
      return (d.answer || "").slice(0, 300);
    case "sentence_builder":
      return (d.correctOrder || []).join(" ").slice(0, 300);
    case "drag_endings":
      return (d.slots || []).map((s) => s.stem + s.correct).join(", ").slice(0, 300);
    case "free_response":
      return (d.modelAnswerRu || "").slice(0, 300);
    case "matching":
      return (d.matchPairs || []).map((p) => `${p.left} → ${p.right}`).join(", ").slice(0, 300);
    case "memory_match":
      return (d.pairs || []).map((p) => `${p.ru} = ${p.en}`).join(", ").slice(0, 300);
    default:
      return "";
  }
}

export function renderAtomic(
  t: AtomicType,
  d: AtomicData,
  key: string,
  onResult: (label: string, given?: string) => void,
  onContinue?: () => void
) {
  const onSubmit = (resp: unknown, isCorrect?: boolean) => {
    if (typeof isCorrect === "boolean") onResult(isCorrect ? "correct" : "incorrect", asAnswerText(resp));
  };
  switch (t) {
    case "multiple_choice":
      return (
        <MultipleChoice key={key} promptEn={d.promptEn || ""} correctAnswer={d.correctAnswer || ""}
          distractors={d.distractors || []} explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "fill_blank":
      return (
        <FillBlank key={key} promptRu={d.promptRu || ""} promptEn={d.promptEn} correctAnswer={d.correctAnswer || ""}
          distractors={[]} explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "word_scramble":
      return (
        <WordScramble key={key} promptEn={d.promptEn || ""} answer={d.answer || ""} hintEn={d.hintEn}
          explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "matching":
      return (
        <Matching key={key} promptEn={d.promptEn || "Match the pairs"} matchPairs={d.matchPairs || []}
          explanationEn={d.explanationEn}
          onSubmit={(c, tot) => onResult(`${c}/${tot}`, `${c} of ${tot} pairs`)} onContinue={onContinue} />
      );
    case "sentence_builder":
      return (
        <SentenceBuilder key={key} promptEn={d.promptEn || ""} correctOrder={d.correctOrder || []}
          distractorTokens={d.distractorTokens} translationEn={d.translationEn}
          explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "listening":
      return (
        <Listening key={key} promptEn={d.promptEn || ""} textRu={d.textRu || ""} correctAnswer={d.correctAnswer || ""}
          distractors={d.distractors || []} explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "memory_match":
      return (
        <MemoryMatch key={key} promptEn={d.promptEn || "Find the pairs"} pairs={d.pairs || []}
          explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "drag_endings":
      return (
        <DragEndings key={key} promptEn={d.promptEn || ""} templateRu={d.templateRu || ""}
          slots={d.slots || []} endingBank={d.endingBank || []}
          explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "free_response":
      return (
        <FreeResponse key={key} promptEn={d.promptEn || ""} promptRu={d.promptRu}
          modelAnswerRu={d.modelAnswerRu || ""} rubricEn={d.rubricEn || []}
          responseMode={d.responseMode} explanationEn={d.explanationEn} onSubmit={onSubmit} onContinue={onContinue} />
      );
    case "dialogue":
      // Dialogue has no scoring — completing it advances the flow.
      return (
        <div key={key}>
          <Dialogue dialogueLines={d.dialogueLines || []} explanationEn={d.explanationEn}
            onComplete={() => { onResult("done"); if (onContinue) onContinue(); }} />
        </div>
      );
    default:
      return <p key={key} className="text-sm text-[var(--color-text-muted)]">Unsupported exercise type.</p>;
  }
}

// QuestionTimer: teacher-set countdown per question. On expiry it reports
// "timeout" and force-advances — the student can't sit on a question forever.
// Exported so the level-exam runner can reuse the exact same countdown.
export function QuestionTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  useEffect(() => {
    setLeft(seconds);
    fired.current = false;
    const iv = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [left, onExpire]);
  const frac = Math.max(0, left / seconds);
  const urgent = left <= 5;
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${urgent ? "bg-red-500" : "bg-[var(--color-primary)]"}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${urgent ? "text-red-600" : "text-gray-400"}`}>
        ⏱ {Math.max(0, left)}s
      </span>
    </div>
  );
}

export function ContentPlayer({
  item,
  nonce = 0,
  onFinished,
  onResult = () => {},
  doneLabel = "Done! 🎉",
  againLabel = "Play again",
  allowReplay = true,
  stepLabel = (i: number, n: number) => `step ${i} of ${n}`,
  timePerQuestionSec = 0,
}: {
  item: PlayableItem;
  /** Bump to force a full remount/reset of the player. */
  nonce?: number;
  onFinished?: () => void;
  /** Fired once per question; `step` says WHICH question (1-based), its type,
   *  the prompt, the student's answer and the expected one — so callers can
   *  record reviewable per-question outcomes for the teacher. */
  onResult?: (label: string, step?: { i: number; type: string; prompt?: string; given?: string; expected?: string }) => void;
  doneLabel?: string;
  againLabel?: string;
  /** false hides the replay button on the composite done screen (single-attempt). */
  allowReplay?: boolean;
  stepLabel?: (i: number, n: number) => string;
  /** > 0 = countdown per question; expiry counts as a timeout and advances. */
  timePerQuestionSec?: number;
}) {
  const [step, setStep] = useState(0);
  // Once the student has submitted an answer the countdown stops — otherwise an
  // expiry while they read the explanation would double-report and skip ahead.
  const [answered, setAnswered] = useState(false);
  const base = `${item.exerciseType}|${nonce}`;

  if (item.exerciseType !== "composite") {
    const atomicData = item.contentData as AtomicData;
    const atomicType = item.exerciseType as AtomicType;
    const stepInfo = {
      i: 1,
      type: item.exerciseType,
      prompt: stepPrompt(atomicType, atomicData),
      expected: stepExpected(atomicType, atomicData),
    };
    const reportAtomic = (label: string, given?: string) => {
      setAnswered(true);
      onResult(label, { ...stepInfo, given });
    };
    const expireAtomic = () => {
      onResult("timeout", stepInfo);
      if (onFinished) onFinished();
    };
    return (
      <div>
        {timePerQuestionSec > 0 && !answered && (
          <QuestionTimer key={base} seconds={timePerQuestionSec} onExpire={expireAtomic} />
        )}
        {renderAtomic(item.exerciseType as AtomicType, item.contentData as AtomicData, base, reportAtomic, onFinished)}
      </div>
    );
  }

  const steps = (Array.isArray((item.contentData as { steps?: CompositeStep[] }).steps)
    ? (item.contentData as { steps: CompositeStep[] }).steps
    : []
  ).filter((s) => s && s.type && s.data);
  if (steps.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">This task has no steps.</p>;
  }
  // Clamp defensively: steps can shrink under an open player (e.g. studio edits).
  const idx = Math.min(step, steps.length);

  if (idx >= steps.length) {
    return (
      <div className="text-center py-8">
        <p className="text-2xl mb-2">🎉</p>
        <p className="font-semibold text-[var(--color-primary)]">{doneLabel}</p>
        {allowReplay && (
          <button
            onClick={() => setStep(0)}
            className="mt-3 text-sm underline text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            {againLabel}
          </button>
        )}
      </div>
    );
  }
  const stepInfo = {
    i: idx + 1,
    type: steps[idx].type,
    prompt: stepPrompt(steps[idx].type, steps[idx].data),
    expected: stepExpected(steps[idx].type, steps[idx].data),
  };
  const advance = () => {
    if (idx + 1 >= steps.length && onFinished) onFinished();
    setAnswered(false);
    setStep(idx + 1);
  };
  const reportStep = (label: string, given?: string) => {
    setAnswered(true);
    onResult(label, { ...stepInfo, given });
  };
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < idx ? "w-6 bg-green-500" : i === idx ? "w-6 bg-[var(--color-primary)]" : "w-3 bg-gray-200"
            }`}
          />
        ))}
        <span className="ml-auto text-xs text-gray-400">{stepLabel(idx + 1, steps.length)}</span>
      </div>
      {timePerQuestionSec > 0 && !answered && (
        <QuestionTimer
          key={`${base}|t${idx}`}
          seconds={timePerQuestionSec}
          onExpire={() => {
            onResult("timeout", stepInfo);
            advance();
          }}
        />
      )}
      {renderAtomic(steps[idx].type, steps[idx].data, `${base}|s${idx}`, reportStep, advance)}
    </div>
  );
}
