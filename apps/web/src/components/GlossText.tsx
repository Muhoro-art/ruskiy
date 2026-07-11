"use client";

import { useState } from "react";
import { glossRegex, lookupTerm, type GlossEntry } from "@/lib/glossary";

// Whether grammar-term glossing is on. Driven by the learner's English-comfort
// choice at signup ("fluent" turns it off); defaults ON so the jargon-unfamiliar
// learner is helped by default. Toggleable in the sidebar.
export function glossEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("gloss_grammar") !== "0";
}

function Term({ word, entry }: { word: string; entry: GlossEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        // Calm affordance for a tap-to-explain term: a subtle dotted bottom-border
        // (navy, low prominence) — NOT a crimson underline that reads as a spelling
        // error. Brightens to full primary on hover to signal interactivity.
        className="border-b border-dotted border-[var(--color-gloss-underline)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] rounded-sm cursor-help"
        title={entry.plain}
        aria-label={`What is "${word}"? ${entry.plain}`}
      >
        {word}
      </button>
      {open && (
        <span
          className="absolute z-30 left-0 top-full mt-1 w-64 bg-[var(--color-primary)] text-white text-sm font-normal not-italic rounded-lg shadow-lg p-3 text-left normal-case"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block font-semibold capitalize mb-0.5">{entry.term}</span>
          <span className="block leading-snug">{entry.plain}</span>
          {entry.example && (
            <span className="block mt-1 text-blue-200 text-xs">e.g. {entry.example}</span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="absolute top-1 right-2 text-blue-200 hover:text-white"
            aria-label="Close"
          >
            ×
          </button>
        </span>
      )}
    </span>
  );
}

/**
 * Renders `text`, auto-highlighting any grammar jargon as tap-to-explain terms.
 * When glossing is off (fluent learners) it renders the plain text unchanged.
 */
export function GlossText({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null;
  if (!glossEnabled()) return <span className={className}>{text}</span>;

  const parts: Array<string | { word: string; entry: GlossEntry }> = [];
  const re = glossRegex();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const entry = lookupTerm(m[0]);
    if (entry) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push({ word: m[0], entry });
      last = m.index + m[0].length;
    }
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((p, i) =>
        typeof p === "string" ? <span key={i}>{p}</span> : <Term key={i} word={p.word} entry={p.entry} />
      )}
    </span>
  );
}
