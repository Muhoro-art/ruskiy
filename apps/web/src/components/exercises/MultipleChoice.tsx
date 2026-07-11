"use client";

import { useState, useMemo } from "react";
import { SpeakButton } from "../SpeakButton";
import { GlossText } from "../GlossText";
import { buttonClasses } from "../ui";
import { OPTION, OPTION_FOCUS } from "./styles";

interface MultipleChoiceProps {
  promptRu?: string;
  promptEn: string;
  correctAnswer: string;
  distractors: string[];
  explanationEn?: string;
  hintSequence?: string[];
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

export function MultipleChoice({
  promptRu,
  promptEn,
  correctAnswer,
  distractors,
  explanationEn,
  hintSequence = [],
  onSubmit,
  onContinue,
}: MultipleChoiceProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);

  // Shuffle once per exercise instance — NOT on every render (would make
  // options jump under the user's cursor). Keyed on the answer set.
  const options = useMemo(
    () => shuffleOnce([correctAnswer, ...distractors]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [correctAnswer, distractors.join("")]
  );

  function handleSubmit() {
    if (!selected) return;
    setSubmitted(true);
    onSubmit(selected, selected === correctAnswer, hintLevel);
  }

  function showHint() {
    if (hintLevel < hintSequence.length) {
      setHintLevel(hintLevel + 1);
    }
  }

  const isCorrect = selected === correctAnswer;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Prompt */}
      <div className="mb-8 text-center">
        {promptRu && (
          <p className="ru-text text-3xl font-bold text-[var(--color-primary)] mb-2 flex items-center justify-center gap-2">
            {promptRu}
            <SpeakButton text={promptRu} className="w-9 h-9" />
          </p>
        )}
        <p className="text-lg text-[var(--color-text-muted)]">{promptEn}</p>
      </div>

      {/* Hints */}
      {hintLevel > 0 && (
        <div className="mb-6 space-y-2">
          {hintSequence.slice(0, hintLevel).map((hint, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-control)] px-4 py-2 text-sm text-[var(--color-primary)]"
              style={{ backgroundColor: "var(--color-gold-tint)", border: "1px solid color-mix(in srgb, var(--color-gold) 40%, white)" }}
            >
              💡 {hint}
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {options.map((option, i) => {
          let style: string = OPTION.idle;
          if (submitted) {
            if (option === correctAnswer) style = `${OPTION.correct} text-[var(--color-success)]`;
            else if (option === selected && !isCorrect) style = `${OPTION.incorrect} text-[var(--color-accent)]`;
            else style = "border-[var(--color-border)] opacity-50";
          } else if (option === selected) {
            style = OPTION.selected;
          }

          return (
            <button
              key={`${i}-${option}`}
              onClick={() => !submitted && setSelected(option)}
              disabled={submitted}
              className={`ru-text p-4 rounded-[var(--radius-control)] border-2 text-lg font-medium transition-all ${OPTION_FOCUS} ${style}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Explanation after submit */}
      {submitted && explanationEn && (
        <div
          className="mb-6 p-4 rounded-[var(--radius-control)] border"
          style={{
            backgroundColor: isCorrect ? "var(--color-success-surface)" : "var(--color-danger-surface)",
            borderColor: isCorrect ? "var(--color-success)" : "var(--color-accent)",
          }}
        >
          <p className="font-bold mb-1" style={{ color: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}>
            {isCorrect ? "✓ Correct!" : <>Not quite — the answer is <span className="ru-text font-bold">{correctAnswer}</span></>}
          </p>
          <p className="text-sm text-[var(--color-text)]"><GlossText text={explanationEn} /></p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {!submitted && hintSequence.length > 0 && hintLevel < hintSequence.length && (
          <button
            onClick={showHint}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
          >
            Need a hint? ({hintSequence.length - hintLevel} remaining)
          </button>
        )}
        {!submitted && hintSequence.length === 0 && <div />}
        {submitted && <div />}

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!selected}
            className={buttonClasses("navy", "lg")}
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={() => {
              if (onContinue) {
                onContinue();
              } else {
                setSelected(null);
                setSubmitted(false);
                setHintLevel(0);
              }
            }}
            className={buttonClasses("navy", "lg")}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}

function shuffleOnce<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
