"use client";

import { useMemo, useState } from "react";
import { buttonClasses } from "../ui";

interface Pair {
  ru: string;
  en: string;
}

interface MemoryMatchProps {
  promptEn: string;
  pairs: Pair[];
  explanationEn?: string;
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

interface Card {
  id: number;
  pairKey: number; // which pair this card belongs to
  text: string;
  side: "ru" | "en";
}

function buildCards(pairs: Pair[]): Card[] {
  const cards: Card[] = [];
  pairs.forEach((p, k) => {
    cards.push({ id: k * 2, pairKey: k, text: p.ru, side: "ru" });
    cards.push({ id: k * 2 + 1, pairKey: k, text: p.en, side: "en" });
  });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function MemoryMatch({ promptEn, pairs, explanationEn, onSubmit, onContinue }: MemoryMatchProps) {
  const cards = useMemo(() => buildCards(pairs), [pairs]);
  const [flipped, setFlipped] = useState<number[]>([]); // currently face-up card ids (max 2)
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const allMatched = matched.size === cards.length;

  function flip(card: Card) {
    if (busy || done || matched.has(card.id) || flipped.includes(card.id)) return;
    const next = [...flipped, card.id];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next.map((id) => cards.find((c) => c.id === id)!);
      if (a.pairKey === b.pairKey) {
        const nm = new Set(matched);
        nm.add(a.id);
        nm.add(b.id);
        setMatched(nm);
        setFlipped([]);
        if (nm.size === cards.length) {
          setDone(true);
          onSubmit(`matched:${pairs.length}`, true, 0);
        }
      } else {
        setBusy(true);
        setTimeout(() => {
          setFlipped([]);
          setBusy(false);
        }, 800);
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-lg text-[var(--color-text-muted)] text-center mb-1">{promptEn}</p>
      <p className="text-xs text-center text-[var(--color-text-muted)] mb-5">
        Flip two cards to match the Russian word with its meaning.
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
        {cards.map((card) => {
          const isUp = flipped.includes(card.id) || matched.has(card.id);
          const isMatched = matched.has(card.id);
          return (
            <button
              key={card.id}
              onClick={() => flip(card)}
              disabled={isMatched || done}
              className={`h-20 rounded-[var(--radius-control)] border-2 flex items-center justify-center text-center px-1 text-sm font-medium transition-all ${
                isMatched
                  ? "border-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]"
                  : isUp
                    ? card.side === "ru"
                      ? "ru-text border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary)] text-base font-bold"
                      : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                    : "border-transparent bg-[var(--color-primary)] text-white"
              }`}
            >
              {isUp ? card.text : "?"}
            </button>
          );
        })}
      </div>

      {/* Result */}
      {done && (
        <div
          className="mb-6 p-4 rounded-[var(--radius-control)] border text-center"
          style={{ backgroundColor: "var(--color-success-surface)", borderColor: "var(--color-success)" }}
        >
          <p className="font-bold" style={{ color: "var(--color-success)" }}>All matched in {moves} moves! 🎉</p>
          {explanationEn && <p className="text-sm mt-1 text-[var(--color-text)]">{explanationEn}</p>}
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="text-sm text-[var(--color-text-muted)] tabular-nums">
          {matched.size / 2}/{pairs.length} pairs · {moves} moves
        </span>
        {done ? (
          <button onClick={() => onContinue?.()} className={buttonClasses("navy", "lg")}>
            Continue →
          </button>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">{allMatched ? "" : "Keep matching…"}</span>
        )}
      </div>
    </div>
  );
}
