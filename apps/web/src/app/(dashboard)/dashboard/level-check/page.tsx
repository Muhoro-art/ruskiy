"use client";

import dynamic from "next/dynamic";

// The level-check pulls in the full A1–C2 question bank to build its ladder, so
// load it as its own chunk after a light shell instead of bloating first load.
const LevelCheck = dynamic(() => import("./LevelCheck"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh] text-[var(--color-text-muted)]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--color-primary)] mx-auto mb-3" />
        Preparing your level check…
      </div>
    </div>
  ),
});

export default function LevelCheckPage() {
  return <LevelCheck />;
}
