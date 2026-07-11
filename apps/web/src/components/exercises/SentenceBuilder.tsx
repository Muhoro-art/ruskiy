"use client";

import { useMemo, useState } from "react";
import { buttonClasses } from "../ui";
import { OPTION_FOCUS } from "./styles";

interface SentenceBuilderProps {
  promptEn: string;
  correctOrder: string[];
  distractorTokens?: string[];
  translationEn?: string;
  explanationEn?: string;
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

interface Tile {
  id: number;
  word: string;
}

function shuffleTiles(words: string[]): Tile[] {
  const tiles: Tile[] = words.map((word, id) => ({ id, word }));
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    if (tiles.map((t) => t.id).join() !== words.map((_, i) => i).join()) break;
  }
  return tiles;
}

export function SentenceBuilder({
  promptEn,
  correctOrder,
  distractorTokens = [],
  translationEn,
  explanationEn,
  onSubmit,
  onContinue,
}: SentenceBuilderProps) {
  const tiles = useMemo(
    () => shuffleTiles([...correctOrder, ...distractorTokens]),
    [correctOrder, distractorTokens]
  );
  const [order, setOrder] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const used = new Set(order);
  const built = order.map((id) => tiles.find((t) => t.id === id)!.word);
  const isCorrect =
    built.length === correctOrder.length && built.every((w, i) => w === correctOrder[i]);
  // a sentence is "complete enough to check" once the user has placed at least
  // as many tiles as the answer needs
  const complete = order.length >= correctOrder.length;

  function pick(id: number) {
    if (submitted || used.has(id)) return;
    setOrder((o) => [...o, id]);
  }
  function removeAt(pos: number) {
    if (submitted) return;
    setOrder((o) => o.filter((_, i) => i !== pos));
  }
  function check() {
    if (order.length === 0) return;
    setSubmitted(true);
    onSubmit(built.join(" "), isCorrect, 0);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-lg text-[var(--color-text-muted)] text-center mb-6">{promptEn}</p>

      {/* Built sentence */}
      <div className="flex flex-wrap justify-center gap-2 min-h-14 mb-5 p-3 rounded-[var(--radius-control)] bg-[var(--color-surface-2)] border-2 border-dashed border-[var(--color-border-strong)]">
        {order.length === 0 && <span className="text-[var(--color-text-muted)] self-center">tap the words in order…</span>}
        {order.map((id, pos) => {
          const word = tiles.find((t) => t.id === id)!.word;
          return (
            <button
              key={id}
              onClick={() => removeAt(pos)}
              disabled={submitted}
              className={`ru-text px-3 py-2 rounded-[var(--radius-control)] text-lg font-medium transition-all ${
                submitted
                  ? isCorrect
                    ? "bg-[var(--color-success-surface)] text-[var(--color-success)] border-2 border-[var(--color-success)]"
                    : "bg-[var(--color-danger-surface)] text-[var(--color-accent)] border-2 border-[var(--color-accent)]"
                  : "bg-[var(--color-primary)] text-white"
              }`}
            >
              {word}
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
              className={`ru-text px-3 py-2 rounded-[var(--radius-control)] text-lg font-medium border-2 transition-all ${OPTION_FOCUS} ${
                used.has(t.id)
                  ? "opacity-0 pointer-events-none"
                  : "border-[var(--color-border-strong)] bg-white text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)]"
              }`}
            >
              {t.word}
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
            {isCorrect ? "✓ Correct!" : <>Answer: <span className="ru-text">{correctOrder.join(" ")}</span></>}
          </p>
          {translationEn && <p className="text-sm italic text-[var(--color-text)]">{translationEn}</p>}
          {explanationEn && <p className="text-sm mt-1 text-[var(--color-text)]">{explanationEn}</p>}
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
