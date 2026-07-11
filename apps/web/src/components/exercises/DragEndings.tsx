"use client";

import { useMemo, useState } from "react";
import { buttonClasses } from "../ui";
import { OPTION_FOCUS } from "./styles";

interface Slot {
  stem: string;
  correct: string;
}

interface DragEndingsProps {
  promptEn: string;
  templateRu: string; // sentence with {0},{1}… markers
  slots: Slot[];
  endingBank: string[];
  explanationEn?: string;
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

type Token = { type: "text"; value: string } | { type: "slot"; index: number };

function parseTemplate(t: string): Token[] {
  const tokens: Token[] = [];
  const re = /\{(\d+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: t.slice(last, m.index) });
    tokens.push({ type: "slot", index: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < t.length) tokens.push({ type: "text", value: t.slice(last) });
  return tokens;
}

export function DragEndings({
  promptEn,
  templateRu,
  slots,
  endingBank,
  explanationEn,
  onSubmit,
  onContinue,
}: DragEndingsProps) {
  const tokens = useMemo(() => parseTemplate(templateRu), [templateRu]);
  const [placed, setPlaced] = useState<(string | null)[]>(() => slots.map(() => null));
  const [focused, setFocused] = useState<number | null>(0);
  const [submitted, setSubmitted] = useState(false);

  const allFilled = placed.every((p) => p !== null);
  const isCorrect = placed.every((p, i) => p === slots[i].correct);

  function assign(slotIndex: number, ending: string) {
    if (submitted) return;
    setPlaced((prev) => {
      const next = [...prev];
      next[slotIndex] = ending;
      return next;
    });
    // advance focus to the next empty slot
    const nextEmpty = placed.findIndex((p, i) => i !== slotIndex && p === null);
    setFocused(nextEmpty === -1 ? null : nextEmpty);
  }

  function clearSlot(slotIndex: number) {
    if (submitted) return;
    setPlaced((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
    setFocused(slotIndex);
  }

  function tileClick(ending: string) {
    if (submitted || focused === null) return;
    assign(focused, ending);
  }

  function check() {
    if (!allFilled) return;
    setSubmitted(true);
    onSubmit(placed.join("+"), isCorrect, 0);
  }

  function slotStyle(i: number): string {
    if (submitted) {
      return placed[i] === slots[i].correct
        ? "border-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]"
        : "border-[var(--color-accent)] bg-[var(--color-danger-surface)] text-[var(--color-accent)]";
    }
    if (focused === i) return "border-[var(--color-primary)] bg-[var(--color-primary-tint)] ring-2 ring-[var(--color-primary)]";
    return placed[i] ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]" : "border-[var(--color-border-strong)] border-dashed bg-[var(--color-surface-2)]";
  }

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-lg text-[var(--color-text-muted)] text-center mb-6">{promptEn}</p>

      {/* Sentence with stems + drop slots */}
      <div className="ru-text text-2xl font-medium text-[var(--color-primary)] leading-relaxed text-center mb-8 flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
        {tokens.map((tok, ti) =>
          tok.type === "text" ? (
            <span key={ti} className="whitespace-pre">{tok.value}</span>
          ) : (
            <span
              key={ti}
              onClick={() => (placed[tok.index] ? clearSlot(tok.index) : setFocused(tok.index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const ending = e.dataTransfer.getData("text/plain");
                if (ending) assign(tok.index, ending);
              }}
              className={`inline-flex items-center justify-center min-w-12 h-9 mx-0.5 px-2 rounded-lg border-2 text-xl cursor-pointer align-middle transition-all ${slotStyle(tok.index)}`}
            >
              {placed[tok.index] || "·"}
            </span>
          )
        )}
      </div>

      {/* Ending tiles tray */}
      {!submitted && (
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {endingBank.map((ending, i) => (
            <button
              key={`${i}-${ending}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", ending)}
              onClick={() => tileClick(ending)}
              className={`ru-text px-4 py-2 rounded-[var(--radius-control)] border-2 border-[var(--color-border-strong)] bg-white text-lg font-bold text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] cursor-grab active:cursor-grabbing transition-all ${OPTION_FOCUS}`}
            >
              {ending}
            </button>
          ))}
        </div>
      )}
      {!submitted && (
        <p className="text-xs text-center text-[var(--color-text-muted)] mb-4">
          Drag an ending onto each gap — or tap a gap, then tap an ending.
        </p>
      )}

      {/* Result */}
      {submitted && (
        <div
          className="mb-6 p-4 rounded-[var(--radius-control)] border"
          style={{ backgroundColor: isCorrect ? "var(--color-success-surface)" : "var(--color-danger-surface)", borderColor: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}
        >
          <p className="font-bold mb-1" style={{ color: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}>
            {isCorrect ? "✓ Correct!" : "Not quite."}
            {!isCorrect && (
              <span className="font-normal ru-text"> Answer: {slots.map((s) => s.stem + s.correct).join(", ")}</span>
            )}
          </p>
          {explanationEn && <p className="text-sm text-[var(--color-text)]">{explanationEn}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        {!submitted ? (
          <button
            onClick={check}
            disabled={!allFilled}
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
