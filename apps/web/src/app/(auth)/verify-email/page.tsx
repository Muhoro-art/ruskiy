"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Landing page for the verification link emailed at signup. It reads ?token, confirms it
// with the API, and shows success (→ sign in) or an expired/invalid state (→ resend).
export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"verifying" | "ok" | "bad">("verifying");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setStatus("bad");
      return;
    }
    api
      .verifyEmail(token)
      .then((r) => setStatus(r.verified ? "ok" : "bad"))
      .catch(() => setStatus("bad"));
  }, []);

  async function resend() {
    if (!email) return;
    try {
      await api.resendVerification(email.trim());
    } catch {
      /* always-200 server-side; ignore */
    }
    setResent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--color-surface)]">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="text-3xl font-bold text-[var(--color-primary)] display">
          РУССКИЙ
        </Link>
        <div className="mt-6 bg-white rounded-[var(--radius-card)] shadow-sm border border-[var(--color-border)] p-8">
          {status === "verifying" && (
            <>
              <div className="text-4xl mb-3" aria-hidden>⏳</div>
              <h1 className="text-lg font-bold text-[var(--color-primary)]">Confirming your email…</h1>
            </>
          )}

          {status === "ok" && (
            <>
              <div className="text-4xl mb-3" aria-hidden>✅</div>
              <h1 className="text-lg font-bold text-[var(--color-primary)]">Email confirmed!</h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Your account is active. You can sign in now.</p>
              <Link
                href="/login"
                className="mt-5 inline-block rounded-[var(--radius-control)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-light)]"
              >
                Sign in →
              </Link>
            </>
          )}

          {status === "bad" && (
            <>
              <div className="text-4xl mb-3" aria-hidden>⚠️</div>
              <h1 className="text-lg font-bold text-[var(--color-primary)]">This link is invalid or has expired</h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Verification links expire after 24 hours. Enter your email to get a fresh one.
              </p>
              {resent ? (
                <p className="mt-4 text-sm text-[var(--color-success)]">
                  If that email is registered and not yet verified, a new link is on its way.
                </p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 px-3 py-2 border border-[var(--color-border-strong)] rounded-[var(--radius-control)] text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                  <button
                    onClick={resend}
                    disabled={!email}
                    className="shrink-0 rounded-[var(--radius-control)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-light)] disabled:opacity-50"
                  >
                    Resend
                  </button>
                </div>
              )}
              <p className="mt-4 text-sm">
                <Link href="/login" className="text-[var(--color-primary)] font-medium hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
