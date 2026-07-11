"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Challenge } from "@/lib/api";

// A self-hosted "are you human?" check shown on the login + signup pages. It fetches
// a "tap all the X" emoji challenge, and on a correct solve reports a single-use pass
// token to the parent, which sends it with the register/login request.
//
// Fails CLOSED on the web (which needs a connection anyway): if the challenge can't be
// fetched it shows a Retry and keeps the form blocked, rather than letting an unsolved
// request through. The ONE intended skip is the server-side kill-switch — when the gate
// is disabled the server returns {disabled:true} and the check reports ok=true (no token).
//
// To force a fresh challenge (e.g. after a failed login consumes the pass), the parent
// remounts this component with a changing `key`.

export interface HumanState {
  ok: boolean;
  token?: string;
}

// "disabled" = server kill-switch (skip, ok=true). "error" = couldn't load/verify
// (blocked, ok=false, offer Retry).
type Status = "loading" | "ready" | "verifying" | "solved" | "disabled" | "error";

export default function HumanCheck({
  onChange,
  dark = false,
}: {
  onChange: (s: HumanState) => void;
  dark?: boolean;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState(false);
  // A persistent screen-reader announcement (miss / solved / error), read from a
  // stable aria-live region so the message survives the grid's remount on retry.
  const [announce, setAnnounce] = useState("");
  // Keep the latest onChange without making the fetch effect depend on its identity.
  const emit = useRef(onChange);
  emit.current = onChange;
  // After a wrong answer reloads the grid, move keyboard focus onto the new puzzle
  // (a fresh grid unmounts the button the user just pressed, dropping focus to body).
  const firstTileRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (status === "ready" && missed) firstTileRef.current?.focus();
  }, [status, missed]);

  const load = useCallback(async () => {
    setStatus("loading");
    setSelected(new Set());
    emit.current({ ok: false });
    try {
      const c = await api.getChallenge();
      if (c.disabled) {
        // Server kill-switch: the gate is off, so no check is needed.
        setStatus("disabled");
        emit.current({ ok: true });
        return;
      }
      if (!c.id || !c.tiles?.length) {
        setAnnounce("Couldn't load the verification. Retry to try again.");
        setStatus("error"); // malformed challenge — block and offer retry
        return;
      }
      setChallenge(c);
      setStatus("ready");
    } catch {
      // Couldn't reach the check. Web needs a connection anyway, so block (fail
      // closed) and let the learner retry rather than waving an unsolved request through.
      setAnnounce("Couldn't load the verification. Retry to try again.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: string) {
    setMissed(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function verify() {
    if (!challenge?.id || selected.size === 0) return;
    setStatus("verifying");
    try {
      const res = await api.verifyChallenge(challenge.id, [...selected]);
      if (res.ok && res.token) {
        setAnnounce("Verified — thank you.");
        setStatus("solved");
        emit.current({ ok: true, token: res.token });
        return;
      }
      // Wrong (or expired) → the challenge is single-attempt, so fetch a new one.
      setAnnounce("That wasn't right. Here's a new set of pictures — tap the matching ones.");
      setMissed(true);
      await load();
    } catch {
      // Verification round-trip failed — block and let them retry.
      setAnnounce("Couldn't verify. Check your connection and retry.");
      setStatus("error");
      emit.current({ ok: false });
    }
  }

  // Nothing to render when the server gate is off — the parent already treats ok=true.
  if (status === "disabled") return null;

  const border = dark ? "border-slate-700" : "border-[var(--color-border)]";
  const surface = dark ? "bg-slate-800/60" : "bg-[var(--color-surface-2)]";
  const muted = dark ? "text-slate-400" : "text-[var(--color-text-muted)]";
  const text = dark ? "text-slate-200" : "text-[var(--color-text)]";
  const busy = status === "verifying";

  const body = (() => {
    if (status === "solved") {
      return (
        <div className={`mb-4 flex items-center gap-2 rounded-[var(--radius-control)] border ${border} ${surface} px-3 py-2.5 text-sm`}>
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: "var(--color-success)" }}
            aria-hidden
          >
            ✓
          </span>
          <span className={text}>Verified — thanks!</span>
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div className={`mb-4 flex items-center gap-2 rounded-[var(--radius-control)] border ${border} ${surface} px-3 py-3 text-sm ${muted}`}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          Checking you&apos;re human…
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className={`mb-4 flex items-center justify-between gap-2 rounded-[var(--radius-control)] border ${border} ${surface} px-3 py-2.5 text-sm`}>
          <span className={text}>Couldn&apos;t load the verification. Check your connection.</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-light)]"
          >
            Retry
          </button>
        </div>
      );
    }
    // ready / verifying — the interactive challenge.
    return (
      <div
        role="group"
        aria-label="Human verification"
        className={`mb-4 rounded-[var(--radius-control)] border ${border} ${surface} p-3`}
      >
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p id="human-check-prompt" className={`text-sm font-medium ${text}`}>{challenge?.prompt}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`text-xs ${muted} hover:underline`}
            aria-label="Get a new challenge"
          >
            ↻ New
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2" aria-describedby="human-check-prompt human-check-hint">
          {challenge?.tiles?.map((tile, i) => {
            const on = selected.has(tile.key);
            return (
              <button
                key={tile.key}
                ref={i === 0 ? firstTileRef : undefined}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tile.key)}
                disabled={busy}
                className={`flex aspect-square items-center justify-center rounded-[var(--radius-control)] border-2 text-3xl transition-colors disabled:opacity-60 ${
                  on
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]"
                    : `${dark ? "border-slate-600 hover:border-slate-400" : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"}`
                }`}
              >
                <span aria-hidden>{tile.emoji}</span>
              </button>
            );
          })}
        </div>

        <p id="human-check-hint" className={`mt-2 text-xs ${missed ? "" : muted}`} style={missed ? { color: "var(--color-accent)" } : undefined}>
          {missed ? "Not quite — here's a fresh set. Tap the matching ones." : "Tap every matching picture, then verify."}
        </p>

        <button
          type="button"
          onClick={() => void verify()}
          disabled={busy || selected.size === 0}
          className="mt-2 w-full rounded-[var(--radius-control)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-light)] disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
      </div>
    );
  })();

  return (
    <>
      {/* Stable polite live region — announces miss / solved / error across the grid's
          remount, so screen-reader users aren't left in silence after a wrong answer. */}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {body}
    </>
  );
}
