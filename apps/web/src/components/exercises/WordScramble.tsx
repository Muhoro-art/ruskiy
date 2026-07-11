"use client";

import { useMemo, useState } from "react";
import { buttonClasses } from "../ui";
import { OPTION_FOCUS } from "./styles";

interface WordScrambleProps {
  promptEn: string;
  answer: string; // the Russian word to spell
  hintEn?: string;
  explanationEn?: string;
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

interface Tile {
  id: number;
  ch: string;
}

function scramble(word: string): Tile[] {
  const tiles: Tile[] = Array.from(word).map((ch, id) => ({ id, ch }));
  // Fisher–Yates; reshuffle if it lands on the original order.
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    if (tiles.map((t) => t.ch).join("") !== word) break;
  }
  return tiles;
}

export function WordScramble({
  promptEn,
  answer,
  hintEn,
  explanationEn,
  onSubmit,
  onContinue,
}: WordScrambleProps) {
  const tiles = useMemo(() => scramble(answer), [answer]);
  const [order, setOrder] = useState<number[]>([]); // tile ids in the answer row
  const [submitted, setSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const used = new Set(order);
  const built = order.map((id) => tiles.find((t) => t.id === id)!.ch).join("");
  const isCorrect = built === answer;
  const complete = order.length === answer.length;

  function pick(id: number) {
    if (submitted || used.has(id)) return;
    setOrder((o) => [...o, id]);
  }
  function removeAt(pos: number) {
    if (submitted) return;
    setOrder((o) => o.filter((_, i) => i !== pos));
  }
  function check() {
    if (!complete) return;
    setSubmitted(true);
    onSubmit(built, isCorrect, showHint ? 1 : 0);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-lg text-[var(--color-text-muted)] text-center mb-2">{promptEn}</p>
      {hintEn && (
        <p className="text-center mb-6">
          {showHint ? (
            <span className="inline-block text-sm text-[var(--color-primary)] rounded-full px-3 py-1" style={{ backgroundColor: "var(--color-gold-tint)" }}>💡 {hintEn}</span>
          ) : (
            <button onClick={() => setShowHint(true)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
              Need a hint?
            </button>
          )}
        </p>
      )}

      {/* Answer row */}
      <div className="flex flex-wrap justify-center gap-2 min-h-16 mb-6 p-3 rounded-[var(--radius-control)] bg-[var(--color-surface-2)] border-2 border-dashed border-[var(--color-border-strong)]">
        {order.length === 0 && <span className="text-[var(--color-text-muted)] self-center">tap the letters in order…</span>}
        {order.map((id, pos) => {
          const ch = tiles.find((t) => t.id === id)!.ch;
          return (
            <button
              key={id}
              onClick={() => removeAt(pos)}
              disabled={submitted}
              className={`ru-text w-11 h-11 rounded-[var(--radius-control)] text-xl font-bold flex items-center justify-center transition-all ${
                submitted
                  ? isCorrect
                    ? "bg-[var(--color-success-surface)] text-[var(--color-success)] border-2 border-[var(--color-success)]"
                    : "bg-[var(--color-danger-surface)] text-[var(--color-accent)] border-2 border-[var(--color-accent)]"
                  : "bg-[var(--color-primary)] text-white"
              }`}
            >
              {ch}
            </button>
          );
        })}
      </div>

      {/* Tile tray */}
      {!submitted && (
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {tiles.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              disabled={used.has(t.id)}
              className={`ru-text w-11 h-11 rounded-[var(--radius-control)] text-xl font-bold flex items-center justify-center border-2 transition-all ${OPTION_FOCUS} ${
                used.has(t.id)
                  ? "opacity-0 pointer-events-none"
                  : "border-[var(--color-border-strong)] bg-white text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)]"
              }`}
            >
              {t.ch}
            </button>
          ))}
        </div>
      )}

      {/* Result */}
      {submitted && (
        <div
          className="mb-6 p-4 rounded-[var(--radius-control)] border"
          style={{ backgroundColor: isCorrect ? "var(--color-success-surface)" : "var(--color-danger-surface)", borderColor: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}
        >
          <p className="font-bold mb-1" style={{ color: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}>
            {isCorrect ? "✓ Correct!" : <>Not quite — it&apos;s <span className="ru-text font-bold">{answer}</span></>}
          </p>
          {explanationEn && <p className="text-sm text-[var(--color-text)]">{explanationEn}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center">
        {!submitted && order.length > 0 ? (
          <button onClick={() => setOrder([])} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
            Clear
          </button>
        ) : (
          <div />
        )}
        {!submitted ? (
          <button
            onClick={check}
            disabled={!complete}
            className={buttonClasses("navy", "lg")}
          >
            Check
          </button>
        ) : (
          <button
            onClick={() => onContinue?.()}
            className={buttonClasses("navy", "lg")}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
