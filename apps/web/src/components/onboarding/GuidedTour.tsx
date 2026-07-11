"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A dependency-free guided product tour: dims the page, spotlights one element at a time,
// and shows a tooltip with Back / Next / Skip + step progress. Steps target a CSS selector
// (use a stable [data-tour="…"] attribute); a step with no target renders a centered
// welcome/finish card. Used for progressive onboarding — each surface starts its own short
// tour the first time a new user reaches it (see tourSeen / markTourSeen).

export type TourStep = {
  /** CSS selector for the element to highlight (e.g. '[data-tour="nav-path"]'). Omit for a centered card. */
  target?: string;
  title: string;
  body: string;
  /** Preferred tooltip side relative to the target. Auto-flips if there's no room. */
  placement?: "top" | "bottom" | "left" | "right";
};

const SEEN_PREFIX = "tour_done_";

export function tourSeen(id: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_PREFIX + id) === "1";
  } catch {
    return false;
  }
}
export function markTourSeen(id: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + id, "1");
  } catch {
    /* private mode — tour may re-show, harmless */
  }
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8; // spotlight padding around the target
const GAP = 14; // gap between target and tooltip
const TOOLTIP_W = 340;

export default function GuidedTour({
  steps,
  onClose,
}: {
  steps: TourStep[];
  /** Called when the tour finishes or is skipped; `completed` distinguishes the two. */
  onClose: (completed: boolean) => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number; place: string }>({ top: 0, left: 0, place: "center" });

  const step = steps[i];
  const isLast = i === steps.length - 1;

  useEffect(() => setMounted(true), []);

  // Find + measure the current target (and scroll it into view).
  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Scroll the target into view when the step changes, then measure.
  useEffect(() => {
    if (step?.target) {
      const el = document.querySelector(step.target) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
    const t = setTimeout(measure, step?.target ? 320 : 0); // wait out the smooth scroll
    return () => clearTimeout(t);
  }, [step, measure]);

  // Keep the highlight aligned on scroll / resize.
  useEffect(() => {
    const on = () => measure();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [measure]);

  // Position the tooltip relative to the target (or center it when there's none).
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const th = tipRef.current?.offsetHeight ?? 180;
    if (!rect) {
      setTipPos({ top: Math.max(24, vh / 2 - th / 2), left: vw / 2 - TOOLTIP_W / 2, place: "center" });
      return;
    }
    const want = step?.placement ?? "bottom";
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - th;
    const canBelow = below + th < vh - 12;
    const canAbove = above > 12;
    let place = want;
    if ((want === "bottom" && !canBelow && canAbove)) place = "top";
    else if (want === "top" && !canAbove && canBelow) place = "bottom";
    else if (!canBelow && !canAbove) place = "bottom";

    let top: number, left: number;
    if (place === "top") top = above;
    else if (place === "bottom") top = below;
    else top = Math.min(Math.max(12, rect.top + rect.height / 2 - th / 2), vh - th - 12);

    if (place === "left") left = rect.left - GAP - TOOLTIP_W;
    else if (place === "right") left = rect.left + rect.width + GAP;
    else left = rect.left + rect.width / 2 - TOOLTIP_W / 2;

    left = Math.min(Math.max(12, left), vw - TOOLTIP_W - 12);
    top = Math.min(Math.max(12, top), vh - th - 12);
    setTipPos({ top, left, place });
  }, [rect, step, i]);

  const finish = (completed: boolean) => onClose(completed);
  const next = () => (isLast ? finish(true) : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  // Keyboard: Esc skips, →/Enter advances, ← goes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, isLast]);

  if (!mounted || !step) return null;

  const overlay = (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Dim + spotlight. With a target we use a box-shadow "hole"; without one, a flat scrim. */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
            border: "2px solid var(--color-gold, #d4af37)",
          }}
        />
      ) : (
        <div className="fixed inset-0" style={{ backgroundColor: "rgba(15, 23, 42, 0.62)" }} />
      )}

      {/* Click-catcher so the page underneath isn't interactable mid-tour (but clicks do
          nothing — advancing is via the buttons, avoiding accidental skips). */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Tooltip card */}
      <div
        ref={tipRef}
        className="fixed rounded-[var(--radius-card,12px)] bg-white shadow-2xl border border-black/5 p-5"
        style={{ top: tipPos.top, left: tipPos.left, width: TOOLTIP_W, maxWidth: "calc(100vw - 24px)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-primary,#1e3a5f)]">
            Step {i + 1} of {steps.length}
          </span>
          <button onClick={() => finish(false)} className="text-xs text-gray-400 hover:text-gray-600" aria-label="Skip tour">
            Skip ✕
          </button>
        </div>
        <h3 className="text-base font-bold text-[var(--color-text,#111)] mb-1">{step.title}</h3>
        <p className="text-sm text-[var(--color-text-muted,#555)] leading-relaxed">{step.body}</p>

        {/* progress dots */}
        <div className="mt-4 flex items-center gap-1.5">
          {steps.map((_, k) => (
            <span
              key={k}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: k === i ? 18 : 6,
                backgroundColor: k === i ? "var(--color-primary, #1e3a5f)" : "var(--color-border-strong, #cbd5e1)",
              }}
            />
          ))}
          <div className="ml-auto flex items-center gap-2">
            {i > 0 && (
              <button onClick={back} className="text-sm font-medium text-[var(--color-text-muted,#555)] hover:text-[var(--color-text,#111)] px-2 py-1">
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-[var(--radius-control,8px)] bg-[var(--color-primary,#1e3a5f)] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {isLast ? "Got it!" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
