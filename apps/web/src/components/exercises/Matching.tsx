"use client";

import { useState, useMemo } from "react";
import { buttonClasses } from "../ui";

interface MatchingProps {
  promptEn: string;
  matchPairs: Array<{ left: string; right: string }>;
  explanationEn?: string;
  onSubmit: (correctCount: number, totalCount: number) => void;
  onContinue?: () => void;
}

export function Matching({
  promptEn,
  matchPairs,
  explanationEn,
  onSubmit,
  onContinue,
}: MatchingProps) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Shuffle the right column once per exercise — re-shuffling on every render
  // (e.g. after each match) scrambled the column mid-exercise.
  const shuffledRight = useMemo(
    () => shuffleOnce(matchPairs.map((p) => p.right)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchPairs.map((p) => p.right).join("")]
  );
  const correctMap = Object.fromEntries(matchPairs.map((p) => [p.left, p.right]));

  function handleRightClick(right: string) {
    if (!selectedLeft || submitted) return;

    setMatches((prev) => ({ ...prev, [selectedLeft]: right }));
    setSelectedLeft(null);
  }

  function handleSubmit() {
    const correctCount = matchPairs.filter(
      (p) => matches[p.left] === p.right
    ).length;
    setSubmitted(true);
    onSubmit(correctCount, matchPairs.length);
  }

  function isRightTaken(right: string) {
    return Object.values(matches).includes(right);
  }

  function getMatchColor(left: string, right: string) {
    if (!submitted) return "bg-[var(--color-primary-tint)] text-[var(--color-primary)]";
    return correctMap[left] === right
      ? "bg-[var(--color-success-surface)] text-[var(--color-success)]"
      : "bg-[var(--color-danger-surface)] text-[var(--color-accent)]";
  }

  const allMatched = Object.keys(matches).length === matchPairs.length;
  const correctCount = submitted
    ? matchPairs.filter((p) => matches[p.left] === p.right).length
    : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-lg text-[var(--color-text-muted)] text-center mb-8">
        {promptEn}
      </p>

      <div className="grid grid-cols-2 gap-8 mb-6">
        {/* Left column */}
        <div className="space-y-3">
          {matchPairs.map((pair, i) => {
            const isSelected = selectedLeft === pair.left;
            const isMatched = pair.left in matches;
            return (
              <button
                key={`l-${i}-${pair.left}`}
                onClick={() => !submitted && !isMatched && setSelectedLeft(pair.left)}
                disabled={submitted || isMatched}
                className={`ru-text w-full p-4 rounded-[var(--radius-control)] border-2 text-lg font-medium text-center transition-all ${
                  isMatched
                    ? `${getMatchColor(pair.left, matches[pair.left])} border-transparent`
                    : isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] ring-2 ring-[var(--color-primary)]"
                      : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)]"
                }`}
              >
                {pair.left}
                {isMatched && (
                  <span className="block text-xs font-normal mt-1">
                    → {matches[pair.left]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {shuffledRight.map((right, i) => {
            const taken = isRightTaken(right);
            return (
              <button
                key={`r-${i}-${right}`}
                onClick={() => handleRightClick(right)}
                disabled={submitted || taken || !selectedLeft}
                className={`w-full p-4 rounded-[var(--radius-control)] border-2 text-lg font-medium text-center transition-all ${
                  taken
                    ? "border-transparent bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                    : selectedLeft
                      ? "border-[var(--color-border-strong)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] cursor-pointer"
                      : "border-[var(--color-border-strong)] opacity-60"
                }`}
              >
                {right}
              </button>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {submitted && (
        <div
          className="mb-6 p-4 rounded-[var(--radius-control)] border"
          style={{
            backgroundColor: correctCount === matchPairs.length ? "var(--color-success-surface)" : "var(--color-warning-surface)",
            borderColor: correctCount === matchPairs.length ? "var(--color-success)" : "var(--color-gold)",
          }}
        >
          <p className="font-bold" style={{ color: correctCount === matchPairs.length ? "var(--color-success)" : "var(--color-primary)" }}>
            {correctCount}/{matchPairs.length} correct
            {correctCount === matchPairs.length && " — Perfect! ✓"}
          </p>
          {explanationEn && <p className="text-sm mt-1 text-[var(--color-text)]">{explanationEn}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center">
        {!submitted && Object.keys(matches).length > 0 && (
          <button
            onClick={() => {
              setMatches({});
              setSelectedLeft(null);
            }}
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            Reset matches
          </button>
        )}
        {(submitted || Object.keys(matches).length === 0) && <div />}

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!allMatched}
            className={buttonClasses("navy", "lg")}
          >
            Check Matches
          </button>
        ) : (
          <button
            onClick={() => {
              if (onContinue) {
                onContinue();
              } else {
                setMatches({});
                setSubmitted(false);
                setSelectedLeft(null);
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
