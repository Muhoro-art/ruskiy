"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { startTourOnce } from "@/components/onboarding/OnboardingTours";
import { tourSeen } from "@/components/onboarding/GuidedTour";
import { LEARNER_PATH } from "@/components/onboarding/tours";

// The curriculum carries the full A1–C2 question bank, so load it as its own
// chunk after a light shell instead of bloating the route's first load.
const CurriculumPath = dynamic(() => import("./CurriculumPath"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh] text-[var(--color-text-muted)]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--color-primary)] mx-auto mb-3" />
        Loading your path…
      </div>
    </div>
  ),
});

export default function PathPage() {
  // Progressive onboarding: the first time a learner opens their path, run a short
  // contextual tour — but only AFTER the welcome tour, so a brand-new user isn't shown
  // two tours at once. (Fires on the next path visit if welcome was just completed.)
  useEffect(() => {
    if (!tourSeen("learner-welcome")) return;
    const t = setTimeout(() => startTourOnce("learner-path", LEARNER_PATH), 900);
    return () => clearTimeout(t);
  }, []);
  return <CurriculumPath />;
}
