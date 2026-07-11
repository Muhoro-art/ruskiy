"use client";

// Watermark: a faint repeated learner-identity overlay on assessed content.
// Deterrence, not prevention: browsers cannot block OS screenshots, so test
// surfaces carry the student's name — any leaked screenshot is traceable.
// Rendered behind the exercise (zIndex 1) and ignored by pointer events.
export function Watermark({ text }: { text: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none" style={{ zIndex: 1 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          className="absolute text-[11px] font-semibold whitespace-nowrap"
          style={{
            color: "rgba(30, 41, 59, 0.05)",
            transform: "rotate(-24deg)",
            top: `${8 + i * 18}%`,
            left: `${(i % 2) * 30 + 8}%`,
          }}
        >
          {text} · {text} · {text}
        </span>
      ))}
    </div>
  );
}
