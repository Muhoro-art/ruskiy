"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "cookie_consent"; // "all" | "essential"

/** The user's cookie choice, or null if not yet made. Read by analytics to gate itself. */
export function cookieConsent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// Site-wide cookie banner shown until the user makes a choice. "Essential only" keeps
// strictly-necessary (auth) cookies; "Accept all" additionally allows optional analytics.
export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* private mode — banner just won't persist */
    }
  }, []);

  function choose(v: "all" | "essential") {
    try {
      localStorage.setItem(KEY, v);
    } catch {}
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[150] p-3">
      <div className="mx-auto max-w-3xl rounded-[var(--radius-card,12px)] bg-white shadow-2xl border border-black/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs text-[var(--color-text-muted,#555)] flex-1 leading-relaxed">
          We use strictly-necessary cookies to sign you in and keep your session secure, and optional
          analytics to improve the service (never for minors). See our{" "}
          <Link href="/legal/cookies" className="text-[var(--color-primary,#1e3a5f)] underline">Cookie Policy</Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="text-[var(--color-primary,#1e3a5f)] underline">Privacy Policy</Link>.
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => choose("essential")}
            className="rounded-[var(--radius-control,8px)] border border-[var(--color-border-strong,#cbd5e1)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted,#555)] hover:bg-black/5"
          >
            Essential only
          </button>
          <button
            onClick={() => choose("all")}
            className="rounded-[var(--radius-control,8px)] bg-[var(--color-primary,#1e3a5f)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
