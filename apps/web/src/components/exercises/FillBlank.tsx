"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { GlossText } from "../GlossText";
import { buttonClasses } from "../ui";
import { OPTION, OPTION_FOCUS } from "./styles";

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

  // Shuffle once per exercise instance, not on every render.
  const options = useMemo(
    () => (distractors.length > 0 ? shuffleOnce([correctAnswer, ...distractors]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [correctAnswer, distractors.join("")]
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Prompt with blank */}
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-[var(--color-primary)] leading-relaxed">
          {parts[0]}
          <span
            className={`ru-text inline-block min-w-32 mx-2 px-4 py-1 rounded-[var(--radius-control)] border-2 border-dashed text-center ${
              submitted
                ? isCorrect
                  ? "border-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]"
                  : "border-[var(--color-accent)] bg-[var(--color-danger-surface)] text-[var(--color-accent)]"
                : answer
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]"
                  : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
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
              className="rounded-[var(--radius-control)] px-4 py-2 text-sm text-[var(--color-primary)]"
              style={{ backgroundColor: "var(--color-gold-tint)", border: "1px solid color-mix(in srgb, var(--color-gold) 40%, white)" }}
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
              {options.map((opt, i) => (
                <button
                  key={`${i}-${opt}`}
                  onClick={() => setAnswer(opt)}
                  className={`ru-text p-4 rounded-[var(--radius-control)] border-2 text-lg font-medium transition-all ${OPTION_FOCUS} ${
                    answer === opt ? OPTION.selected : OPTION.idle
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
              className="ru-text w-full px-6 py-4 text-xl text-center border-2 border-[var(--color-border-strong)] rounded-[var(--radius-control)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
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
                setAnswer("");
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
