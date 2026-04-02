"use client";

import { useState } from "react";

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

  const options = shuffleOnce([correctAnswer, ...distractors]);

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
          <p className="text-3xl font-bold text-[var(--color-primary)] mb-2">
            {promptRu}
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
              className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm text-yellow-800"
            >
              💡 {hint}
            </div>
          ))}
        </div>
      )}

      {/* Options */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {options.map((option) => {
          let style = "border-gray-200 hover:border-[var(--color-primary)] hover:bg-blue-50";

          if (submitted) {
            if (option === correctAnswer) {
              style = "border-green-500 bg-green-50 text-green-800";
            } else if (option === selected && !isCorrect) {
              style = "border-red-500 bg-red-50 text-red-800";
            } else {
              style = "border-gray-200 opacity-50";
            }
          } else if (option === selected) {
            style = "border-[var(--color-primary)] bg-blue-50 ring-2 ring-[var(--color-primary)]";
          }

          return (
            <button
              key={option}
              onClick={() => !submitted && setSelected(option)}
              disabled={submitted}
              className={`p-4 rounded-xl border-2 text-lg font-medium transition-all ${style}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Explanation after submit */}
      {submitted && explanationEn && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            isCorrect
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <p className="font-bold mb-1">
            {isCorrect ? "Correct! ✓" : `Incorrect. The answer is: ${correctAnswer}`}
          </p>
          <p className="text-sm">{explanationEn}</p>
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
            className="bg-[var(--color-primary)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors disabled:opacity-50"
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
            className="bg-[var(--color-primary)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors"
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
