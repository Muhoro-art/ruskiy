// Shared visual language for ALL learner exercise components, so the family reads as
// one system: one selected / correct / incorrect treatment, one focus ring, one tile
// radius, one feedback banner + canonical copy. Backed entirely by the brand tokens
// in globals.css (no raw Tailwind green/red/blue). Import these instead of
// re-implementing per component.
import React from "react";

export const TILE_RADIUS = "rounded-[var(--radius-control)]";
export const OPTION_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2";

// Option / tile state border+background classes. Compose with a base tile class
// (border-2, padding, etc.). idle → navy-tint hover; selected → navy; correct →
// success (green); incorrect → crimson danger.
export const OPTION = {
  idle: "border-[var(--color-border-strong)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)]",
  selected: "border-[var(--color-primary)] bg-[var(--color-primary-tint)]",
  correct: "border-[var(--color-success)] bg-[var(--color-success-surface)]",
  incorrect: "border-[var(--color-accent)] bg-[var(--color-danger-surface)]",
  disabled: "opacity-60 pointer-events-none",
} as const;

// Canonical result banner used across MultipleChoice / FillBlank / Matching / etc.,
// so "Correct!" and "Not quite — the answer is X" look and read identically.
export function FeedbackBanner({
  correct,
  answer,
  explanation,
}: {
  correct: boolean;
  answer?: string;
  explanation?: React.ReactNode;
}) {
  return React.createElement(
    "div",
    {
      className: "rounded-[var(--radius-control)] px-4 py-3 text-sm",
      style: {
        backgroundColor: correct ? "var(--color-success-surface)" : "var(--color-danger-surface)",
        color: correct ? "var(--color-success)" : "var(--color-accent)",
      },
    },
    React.createElement(
      "p",
      { className: "font-semibold" },
      correct
        ? "✓ Correct!"
        : answer
          ? React.createElement(React.Fragment, null, "Not quite — the answer is ", React.createElement("span", { className: "ru-text font-bold" }, answer))
          : "Not quite."
    ),
    explanation ? React.createElement("p", { className: "mt-1 text-[var(--color-text)]" }, explanation) : null
  );
}
