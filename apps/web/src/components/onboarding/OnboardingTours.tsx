"use client";

import { useEffect, useRef, useState } from "react";
import GuidedTour, { type TourStep, tourSeen, markTourSeen } from "./GuidedTour";
import { welcomeTourFor } from "./tours";

const EVT = "russkiy:start-tour";

/** Launch a tour immediately (used by the replay ‘?’ button). */
export function startTour(id: string, steps: TourStep[]) {
  window.dispatchEvent(new CustomEvent(EVT, { detail: { id, steps } }));
}
/** Launch a tour only the FIRST time (used by pages for contextual, progressive tours). */
export function startTourOnce(id: string, steps: TourStep[]) {
  if (typeof window !== "undefined" && !tourSeen(id)) startTour(id, steps);
}

// Mounted once in the dashboard layout. Auto-starts the role's welcome tour on a new
// user's first visit, and renders any tour launched via startTour()/startTourOnce().
export default function OnboardingTours({ role, enabled }: { role: string; enabled: boolean }) {
  const [active, setActive] = useState<{ id: string; steps: TourStep[] } | null>(null);
  const started = useRef(false);

  // First-visit welcome tour for this role.
  useEffect(() => {
    if (!enabled || !role || started.current) return;
    const { id, steps } = welcomeTourFor(role);
    if (tourSeen(id)) return;
    started.current = true;
    const t = setTimeout(() => setActive({ id, steps }), 700); // let the nav paint first
    return () => clearTimeout(t);
  }, [role, enabled]);

  // Explicit launches (replay button + contextual page tours).
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { id: string; steps: TourStep[] } | undefined;
      if (d?.steps?.length) setActive({ id: d.id, steps: d.steps });
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);

  if (!active) return null;
  return (
    <GuidedTour
      steps={active.steps}
      onClose={() => {
        markTourSeen(active.id); // mark seen whether finished or skipped, so it won't nag
        setActive(null);
      }}
    />
  );
}
