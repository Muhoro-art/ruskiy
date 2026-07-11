"use client";

import { useEffect, useMemo, useState } from "react";
import { buttonClasses } from "../ui";
import { OPTION, OPTION_FOCUS } from "./styles";

interface ListeningProps {
  promptEn: string;
  textRu: string; // spoken aloud
  correctAnswer: string;
  distractors: string[];
  explanationEn?: string;
  onSubmit: (response: string, isCorrect: boolean, hintLevel: number) => void;
  onContinue?: () => void;
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ru-RU";
  u.rate = 0.9;
  const ru = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ru"));
  if (ru) u.voice = ru;
  window.speechSynthesis.speak(u);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Listening({
  promptEn,
  textRu,
  correctAnswer,
  distractors,
  explanationEn,
  onSubmit,
  onContinue,
}: ListeningProps) {
  const options = useMemo(() => shuffle([correctAnswer, ...distractors]), [correctAnswer, distractors]);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isCorrect = selected === correctAnswer;

  // Speak once on mount (voices may load async, so retry shortly).
  useEffect(() => {
    speak(textRu);
    const t = setTimeout(() => {
      if (typeof window !== "undefined" && window.speechSynthesis && !window.speechSynthesis.speaking) speak(textRu);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function check() {
    if (!selected) return;
    setSubmitted(true);
    onSubmit(selected, isCorrect, 0);
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <p className="text-lg text-[var(--color-text-muted)] mb-6">{promptEn}</p>

      {/* Play button */}
      <button
        onClick={() => speak(textRu)}
        className="w-20 h-20 rounded-full bg-[var(--color-primary)] text-white text-3xl flex items-center justify-center mx-auto mb-2 hover:bg-[var(--color-primary-light)] transition-colors"
        aria-label="Play audio"
      >
        🔊
      </button>
      <button onClick={() => speak(textRu)} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] mb-6 block mx-auto">
        Play again
      </button>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 text-left">
        {options.map((option, i) => {
          let style: string = OPTION.idle;
          if (submitted) {
            if (option === correctAnswer) style = `${OPTION.correct} text-[var(--color-success)]`;
            else if (option === selected) style = `${OPTION.incorrect} text-[var(--color-accent)]`;
            else style = "border-[var(--color-border)] opacity-50";
          } else if (option === selected) {
            style = OPTION.selected;
          }
          return (
            <button
              key={`${i}-${option}`}
              onClick={() => !submitted && setSelected(option)}
              disabled={submitted}
              className={`ru-text p-4 rounded-[var(--radius-control)] border-2 font-medium transition-all ${OPTION_FOCUS} ${style}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Result */}
      {submitted && (
        <div
          className="mb-6 p-4 rounded-[var(--radius-control)] border text-left"
          style={{ backgroundColor: isCorrect ? "var(--color-success-surface)" : "var(--color-danger-surface)", borderColor: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}
        >
          <p className="font-bold mb-1" style={{ color: isCorrect ? "var(--color-success)" : "var(--color-accent)" }}>
            {isCorrect ? "✓ Correct!" : <>Incorrect — it was <span className="ru-text">&quot;{correctAnswer}&quot;</span></>}{" "}
            <button onClick={() => setReveal(true)} className="font-normal underline text-sm text-[var(--color-text)]">
              {reveal ? "" : "show text"}
            </button>
          </p>
          {reveal && <p className="text-lg font-medium ru-text text-[var(--color-text)]">{textRu}</p>}
          {explanationEn && <p className="text-sm mt-1 text-[var(--color-text)]">{explanationEn}</p>}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        {!submitted ? (
          <button
            onClick={check}
            disabled={!selected}
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
