"use client";

import { useState } from "react";

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

  const shuffledRight = shuffleOnce(matchPairs.map((p) => p.right));
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
    if (!submitted) return "bg-blue-100 text-blue-800";
    return correctMap[left] === right
      ? "bg-green-100 text-green-800"
      : "bg-red-100 text-red-800";
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
          {matchPairs.map((pair) => {
            const isSelected = selectedLeft === pair.left;
            const isMatched = pair.left in matches;
            return (
              <button
                key={pair.left}
                onClick={() => !submitted && !isMatched && setSelectedLeft(pair.left)}
                disabled={submitted || isMatched}
                className={`w-full p-4 rounded-xl border-2 text-xl font-bold text-center transition-all ${
                  isMatched
                    ? `${getMatchColor(pair.left, matches[pair.left])} border-transparent`
                    : isSelected
                      ? "border-[var(--color-primary)] bg-blue-50 ring-2 ring-[var(--color-primary)]"
                      : "border-gray-200 hover:border-[var(--color-primary)]"
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
          {shuffledRight.map((right) => {
            const taken = isRightTaken(right);
            return (
              <button
                key={right}
                onClick={() => handleRightClick(right)}
                disabled={submitted || taken || !selectedLeft}
                className={`w-full p-4 rounded-xl border-2 text-sm font-medium text-center transition-all ${
                  taken
                    ? "border-transparent bg-gray-100 text-gray-400"
                    : selectedLeft
                      ? "border-gray-200 hover:border-[var(--color-accent)] hover:bg-red-50 cursor-pointer"
                      : "border-gray-200 opacity-60"
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
          className={`mb-6 p-4 rounded-lg border ${
            correctCount === matchPairs.length
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-orange-50 border-orange-200 text-orange-800"
          }`}
        >
          <p className="font-bold">
            {correctCount}/{matchPairs.length} correct
            {correctCount === matchPairs.length && " — Perfect! ✓"}
          </p>
          {explanationEn && <p className="text-sm mt-1">{explanationEn}</p>}
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
            className="bg-[var(--color-primary)] text-white font-semibold px-8 py-3 rounded-xl hover:bg-[var(--color-primary-light)] transition-colors disabled:opacity-50"
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
