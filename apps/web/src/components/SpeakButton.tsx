"use client";

import { speak, isTTSAvailable } from "@/lib/tts";

// A small "tap to hear" button that reads Russian text aloud. Renders nothing
// when speech synthesis is unavailable, so callers can drop it in unconditionally.
export function SpeakButton({
  text,
  rate = 0.9,
  className = "",
  label = "Listen",
}: {
  text: string;
  rate?: number;
  className?: string;
  label?: string;
}) {
  if (!isTTSAvailable() || !text) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        speak(text, rate);
      }}
      aria-label={`${label}: ${text}`}
      title="Tap to hear"
      className={`inline-flex items-center justify-center rounded-full text-[var(--color-primary)] hover:bg-[var(--color-primary-tint)] transition-colors ${className}`}
    >
      <span aria-hidden className="text-lg leading-none">🔊</span>
    </button>
  );
}
