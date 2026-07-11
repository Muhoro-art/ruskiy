"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cross-tab idle auto-logout for shared/lab computers. Any user interaction — in ANY
// open tab — refreshes a shared `last_activity` timestamp in localStorage; a per-tab
// 1s ticker checks the elapsed idle time against the limit and, WARNING_MS before it,
// shows a countdown modal the user can dismiss. At the limit it calls onLogout.
//
// The warning modal (not an abrupt logout) is essential here: this is a language app
// where a learner may READ or LISTEN for minutes without touching the page, so a silent
// kick would be hostile. Any activity — or the explicit "Stay" button — resets it.
//
// Duration is NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES (default 30). Because activity is a shared
// localStorage timestamp, being active in one tab keeps every tab alive (no surprise
// logout of a tab you weren't looking at).

const ACT_KEY = "last_activity";
const DEFAULT_MINUTES = 30;
const WARNING_MS = 60_000; // show the countdown this long before logout
const TICK_MS = 1_000;
const WRITE_THROTTLE_MS = 5_000; // don't hammer localStorage on every mousemove

function limitMs(): number {
  const env = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES);
  const mins = Number.isFinite(env) && env > 0 ? env : DEFAULT_MINUTES;
  return mins * 60_000;
}

export default function IdleLogout({
  onLogout,
  staff = false,
}: {
  onLogout: () => void;
  staff?: boolean;
}) {
  // remaining = ms left while the warning is showing; null = modal hidden.
  const [remaining, setRemaining] = useState<number | null>(null);
  // Keep the latest onLogout without making the once-only effect depend on its identity.
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  const lastWrite = useRef(0);
  const fired = useRef(false);
  const LIMIT = useRef(limitMs());

  const write = (t: number) => {
    try {
      localStorage.setItem(ACT_KEY, String(t));
    } catch {
      /* private mode / quota — idle logic simply degrades to per-tab */
    }
  };

  const markActive = useCallback(() => {
    const now = Date.now();
    if (now - lastWrite.current >= WRITE_THROTTLE_MS) {
      lastWrite.current = now;
      write(now);
    }
  }, []);

  // "Stay signed in" — reset immediately (bypass the throttle) and hide the modal.
  const stay = useCallback(() => {
    const now = Date.now();
    lastWrite.current = now;
    write(now);
    setRemaining(null);
  }, []);

  useEffect(() => {
    stay(); // seed activity so a fresh mount isn't instantly considered idle

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click", "wheel"];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    const id = window.setInterval(() => {
      let last = Number(localStorage.getItem(ACT_KEY));
      if (!Number.isFinite(last) || last <= 0) {
        last = Date.now();
        write(last);
      }
      const left = LIMIT.current - (Date.now() - last);
      if (left <= 0) {
        if (!fired.current) {
          fired.current = true;
          window.clearInterval(id);
          onLogoutRef.current();
        }
        return;
      }
      // setRemaining(null) when out of the warning window is a no-op re-render (null===null).
      setRemaining(left <= WARNING_MS ? left : null);
    }, TICK_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      window.clearInterval(id);
    };
  }, [markActive, stay]);

  if (remaining === null) return null;
  const secs = Math.max(1, Math.ceil(remaining / 1000));

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-title"
      className="fixed inset-0 bg-[var(--color-scrim)] flex items-center justify-center z-[60] p-4"
    >
      <div className="bg-white rounded-[var(--radius-card)] p-6 max-w-sm w-full text-center shadow-xl">
        <div className="text-3xl mb-2" aria-hidden>⏳</div>
        <h2 id="idle-title" className="text-lg font-bold text-[var(--color-primary)]">
          {staff ? "Вы всё ещё здесь?" : "Are you still there?"}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1 mb-4" aria-live="polite">
          {staff
            ? `Из-за бездействия сессия завершится через ${secs} с.`
            : `You'll be signed out in ${secs}s due to inactivity.`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onLogoutRef.current()}
            className="flex-1 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            {staff ? "Выйти" : "Sign out"}
          </button>
          <button
            autoFocus
            onClick={stay}
            className="flex-1 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-light)] transition-colors"
          >
            {staff ? "Остаться" : "Stay signed in"}
          </button>
        </div>
      </div>
    </div>
  );
}
