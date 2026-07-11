"use client";

import { useState } from "react";
import { SpeakButton } from "../SpeakButton";
import { buttonClasses } from "../ui";

interface FreeResponseProps {
  promptEn: string;
  promptRu?: string;
  modelAnswerRu: string;
  rubricEn: string[];
  responseMode?: "writing" | "speaking";
  explanationEn?: string;
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

// Productive (Письмо / Говорение) practice: the learner writes or speaks a
// response, then self-assesses it against a model answer and a rubric. Score =
// fraction of rubric points they tick; passing (>=50%) counts as "correct" for
// progression. This gives uni-prep real productive practice the auto-graded MCQs
// can't, without needing a server-side grader.
export function FreeResponse({
  promptEn,
  promptRu,
  modelAnswerRu,
  rubricEn,
  responseMode = "writing",
  explanationEn,
  onSubmit,
  onContinue,
}: FreeResponseProps) {
  const speaking = responseMode === "speaking";
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const score = rubricEn.length ? checked.size / rubricEn.length : 0;
  const passed = score >= 0.5;

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <span className="inline-block text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)] mb-2">
          {speaking ? "Speaking · Говорение" : "Writing · Письмо"}
        </span>
        <p className="text-base text-[var(--color-text)] whitespace-pre-line">{promptEn}</p>
        {promptRu && (
          <p className="ru-text text-sm text-[var(--color-text-muted)] mt-2 whitespace-pre-line">{promptRu}</p>
        )}
      </div>

      {!revealed ? (
        <>
          {speaking ? (
            <div
              className="rounded-[var(--radius-card)] border p-5 mb-4 text-center"
              style={{ backgroundColor: "var(--color-primary-tint)", borderColor: "color-mix(in srgb, var(--color-primary) 20%, white)" }}
            >
              <p className="text-sm text-[var(--color-text-muted)] mb-1">Say your answer aloud — take your time.</p>
              <p className="text-xs text-[var(--color-text-muted)]">When you&apos;re done, reveal the model answer and rate yourself.</p>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Напишите ваш ответ здесь…"
              className="ru-text w-full px-4 py-3 border border-[var(--color-border-strong)] rounded-[var(--radius-control)] outline-none focus:ring-2 focus:ring-[var(--color-primary)] mb-4 resize-y"
            />
          )}
          <button
            onClick={() => setRevealed(true)}
            disabled={!speaking && text.trim().length === 0}
            className={`${buttonClasses("navy", "lg")} w-full`}
          >
            {speaking ? "I've said it — show the model answer" : "Compare with the model answer"}
          </button>
        </>
      ) : (
        <>
          <div
            className="rounded-[var(--radius-card)] border p-4 mb-4"
            style={{ backgroundColor: "var(--color-success-surface)", borderColor: "var(--color-success)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold" style={{ color: "var(--color-success)" }}>Model answer</h3>
              <SpeakButton text={modelAnswerRu} className="w-8 h-8" />
            </div>
            <p className="ru-text text-[var(--color-text)] whitespace-pre-line">{modelAnswerRu}</p>
          </div>

          <div className="mb-4">
            <p className="text-sm font-semibold mb-2">Rate yourself — tick what your answer did:</p>
            <div className="space-y-2">
              {rubricEn.map((r, i) => (
                <label key={i} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} className="mt-0.5 accent-[var(--color-primary)]" />
                  <span>{r}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              You met {checked.size} of {rubricEn.length}. {passed ? "Solid — counts as a pass." : "Keep practising — revisit the model and try again."}
            </p>
          </div>

          {explanationEn && (
            <div
              className="rounded-[var(--radius-control)] border p-3 mb-4 text-sm text-[var(--color-primary)]"
              style={{ backgroundColor: "var(--color-primary-tint)", borderColor: "color-mix(in srgb, var(--color-primary) 20%, white)" }}
            >
              {explanationEn}
            </div>
          )}

          <button
            onClick={() => {
              onSubmit(text || "(spoken)", passed, 0);
              onContinue?.();
            }}
            className={`${buttonClasses("navy", "lg")} w-full`}
          >
            Continue →
          </button>
        </>
      )}
    </div>
  );
}
