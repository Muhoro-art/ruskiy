"use client";

import { useState, useRef, useEffect } from "react";

interface FillBlankProps {
  promptRu: string;
  promptEn?: string;
  correctAnswer: string;
  distractors?: string[];
  explanationEn?: string;
  hintSequence?: string[];
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

export function FillBlank({
  promptRu,
  promptEn,
  correctAnswer,
  distractors = [],
  explanationEn,
  hintSequence = [],
  onSubmit,
  onContinue,
}: FillBlankProps) {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [mode, setMode] = useState<"type" | "select">(
    distractors.length > 0 ? "select" : "type"
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "type" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  const parts = promptRu.split("___");
  const isCorrect = answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();

  function handleSubmit() {
    if (!answer) return;
    setSubmitted(true);
    onSubmit(answer, isCorrect, hintLevel);
  }

  function showHint() {
    if (hintLevel < hintSequence.length) {
      setHintLevel(hintLevel + 1);
    }
  }

  const options = distractors.length > 0
    ? shuffleOnce([correctAnswer, ...distractors])
    : [];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Prompt with blank */}
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-[var(--color-primary)] leading-relaxed">
          {parts[0]}
          <span
            className={`inline-block min-w-32 mx-2 px-4 py-1 rounded-lg border-2 border-dashed text-center ${
              submitted
                ? isCorrect
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-red-500 bg-red-50 text-red-800"
                : answer
                  ? "border-[var(--color-primary)] bg-blue-50"
                  : "border-gray-300 bg-gray-50 text-gray-400"
            }`}
          >
            {answer || "___"}
          </span>
          {parts[1]}
        </p>
        {promptEn && (
          <p className="text-base text-[var(--color-text-muted)] mt-3">
            {promptEn}
          </p>
        )}
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

      {/* Input area */}
      {!submitted && (
        <div className="mb-6">
          {mode === "select" && options.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAnswer(opt)}
                  className={`p-4 rounded-xl border-2 text-lg font-medium transition-all ${
                    answer === opt
                      ? "border-[var(--color-primary)] bg-blue-50 ring-2 ring-[var(--color-primary)]"
                      : "border-gray-200 hover:border-[var(--color-primary)] hover:bg-blue-50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Type your answer in Russian..."
              className="w-full px-6 py-4 text-xl text-center border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
              autoComplete="off"
              spellCheck={false}
              lang="ru"
            />
          )}

          {distractors.length > 0 && (
            <button
              onClick={() => setMode(mode === "select" ? "type" : "select")}
              className="block mx-auto mt-3 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
            >
              {mode === "select" ? "Type answer instead" : "Choose from options"}
            </button>
          )}
        </div>
      )}

      {/* Result */}
      {submitted && explanationEn && (
        <div
          className={`mb-6 p-4 rounded-lg border ${
            isCorrect
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <p className="font-bold mb-1">
            {isCorrect
              ? "Correct! ✓"
              : `Incorrect. The answer is: ${correctAnswer}`}
          </p>
          <p className="text-sm">{explanationEn}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {!submitted && hintSequence.length > 0 && hintLevel < hintSequence.length ? (
          <button onClick={showHint} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
            Need a hint? ({hintSequence.length - hintLevel} remaining)
          </button>
        ) : (
          <div />
        )}

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!answer}
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
                setAnswer("");
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
