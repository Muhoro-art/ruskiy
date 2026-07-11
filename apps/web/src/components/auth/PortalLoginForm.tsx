"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import type { PortalConfig } from "@/lib/portal";
import HumanCheck, { type HumanState } from "./HumanCheck";

const isNetworkErr = (m: string) =>
  /failed to fetch|networkerror|load failed|server_unavailable|internal server/i.test(m);

// Per-portal accent. The admin portal uses a dark card so it's visually obvious
// you are entering the operations area; the rest sit on the light auth card.
const THEME: Record<
  PortalConfig["id"],
  { dark: boolean; badge: string; badgeCls: string; button: string; ring: string }
> = {
  learner: {
    dark: false,
    badge: "",
    badgeCls: "",
    button: "bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-white",
    ring: "focus:ring-[var(--color-primary)]",
  },
  teacher: {
    dark: false,
    badge: "Teacher portal",
    badgeCls: "bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
    button: "bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-white",
    ring: "focus:ring-[var(--color-primary)]",
  },
  dean: {
    dark: false,
    badge: "Dean portal",
    badgeCls: "bg-[var(--color-gold)]/15 text-[var(--color-gold-strong,#8a6d1f)]",
    button: "bg-[var(--color-gold)] hover:brightness-95 text-[#3a2e05]",
    ring: "focus:ring-[var(--color-gold)]",
  },
  admin: {
    dark: true,
    badge: "Admin portal",
    badgeCls: "bg-white/10 text-slate-200",
    button: "bg-white text-slate-900 hover:bg-slate-100",
    ring: "focus:ring-white/60",
  },
};

export default function PortalLoginForm({ portal }: { portal: PortalConfig }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<React.ReactNode>("");
  const [loading, setLoading] = useState(false);
  // Human-verification gate: `human.ok` unlocks the button; `human.token` is the
  // single-use pass. `checkKey` remounts the widget (fresh challenge) after a failed
  // attempt, since the server consumes the pass on every try.
  const [human, setHuman] = useState<HumanState>({ ok: false });
  const [checkKey, setCheckKey] = useState(0);
  const t = THEME[portal.id];

  function rearmHumanCheck() {
    setHuman({ ok: false });
    setCheckKey((k) => k + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Clear any prior session on this browser before signing a new user in.
      auth.clear();

      const { tokens, user } = await api.login(email.trim(), password, portal.id, human.token);
      auth.setTokens(tokens.accessToken, tokens.refreshToken);
      // Keep the account's display name so onboarding + the dashboard have it even
      // before a learner profile exists.
      if (user?.displayName) auth.setProfile({ displayName: user.displayName });

      // A teacher who signed up with an institution invite couldn't accept it then (no
      // session until verified) — apply the stashed code now, on their first sign-in.
      if (portal.id === "teacher") {
        try {
          const code = localStorage.getItem("pending_teacher_invite");
          if (code) {
            localStorage.removeItem("pending_teacher_invite");
            await api.acceptInvite(code);
            await api.refreshSession(); // token now carries the invited role (teacher/dean)
          }
        } catch {
          /* invite invalid/expired — they can re-enter it from their console */
        }
      }

      // Learners carry a profile (display name, segment, placement). Staff sign in
      // straight to their console — no learner profile to hydrate.
      if (!portal.staff) {
        try {
          const profiles = await api.getProfiles();
          if (Array.isArray(profiles) && profiles.length > 0) {
            const p = profiles[0];
            auth.setProfile({
              id: p.id,
              displayName: p.displayName || user?.displayName || "Learner",
              segment: p.segment || "",
              currentLevel: p.currentLevel || "A1",
            });
            auth.setPlacementCompleted(true);
          } else {
            // Verified account, first sign-in, no profile yet → finish onboarding.
            window.location.href = "/onboarding";
            return;
          }
        } catch {
          /* non-fatal — fall through to the portal home */
        }
      }

      window.location.href = portal.home;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // The pass is single-use and consumed on every attempt — re-arm the check so
      // the next try has a fresh proof.
      rearmHumanCheck();
      if (err instanceof TypeError || isNetworkErr(msg)) {
        setError("Can't reach the server right now. It may be starting up — try again in a moment.");
      } else if (msg === "human_verification_required") {
        setError("Please complete the human check below, then sign in.");
      } else if (msg === "email_not_verified") {
        // Correct password, but the email isn't confirmed yet. The server just re-sent a
        // link; offer a manual resend too.
        setError(
          <>
            Please confirm your email first — we&apos;ve sent a fresh link to{" "}
            <strong>{email.trim()}</strong>. Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => api.resendVerification(email.trim()).catch(() => {})}
              className="underline font-medium"
            >
              Resend
            </button>
            .
          </>
        );
      } else if (msg === "wrong_portal") {
        // Valid credentials, wrong door. Point them at the right entrances.
        setError(
          <>
            Those credentials aren&apos;t for the {portal.label.toLowerCase()} portal. Learners{" "}
            <Link href="/login" className="underline font-medium">
              sign in here
            </Link>
            ; staff use the{" "}
            <Link href="/staff" className="underline font-medium">
              staff sign-in
            </Link>
            .
          </>
        );
      } else if (msg === "unknown_portal") {
        setError("This sign-in link is misconfigured. Please contact support.");
      } else if (msg === "account_locked") {
        setError("Too many attempts — this account is temporarily locked. Try again in a few minutes.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  }

  const card = t.dark
    ? "bg-slate-900 border-slate-700 text-slate-100"
    : "bg-white border-gray-200";
  const inputCls = t.dark
    ? "w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:ring-2 focus:border-transparent"
    : "w-full px-4 py-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:border-transparent";

  return (
    <div className={`min-h-screen flex items-center justify-center px-6 ${t.dark ? "bg-slate-950" : "bg-gray-50"}`}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className={`text-3xl font-bold ${t.dark ? "text-white" : "text-[var(--color-primary)]"}`}>
            РУССКИЙ
          </Link>
          <p className={`mt-2 ${t.dark ? "text-slate-400" : "text-[var(--color-text-muted)]"}`}>{portal.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className={`rounded-2xl shadow-sm border p-8 ${card}`}>
          {t.badge && (
            <span className={`inline-block mb-4 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${t.badgeCls}`}>
              {t.badge}
            </span>
          )}
          <h1 className={`text-xl font-bold mb-1 ${t.dark ? "text-white" : "text-[var(--color-text)]"}`}>{portal.title}</h1>

          {error && (
            <div
              className={`mt-4 mb-2 p-3 rounded-lg text-sm ${
                t.dark ? "bg-red-500/10 border border-red-500/30 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {error}
            </div>
          )}

          <div className="mt-4 mb-4">
            <label htmlFor="email" className={`block text-sm font-medium mb-1 ${t.dark ? "text-slate-300" : ""}`}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={`${inputCls} ${t.ring}`}
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className={`block text-sm font-medium mb-1 ${t.dark ? "text-slate-300" : ""}`}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={`${inputCls} ${t.ring}`}
              placeholder="Enter your password"
            />
          </div>

          <HumanCheck key={checkKey} dark={t.dark} onChange={setHuman} />

          <button
            type="submit"
            disabled={loading || !human.ok}
            className={`w-full font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 ${t.button}`}
          >
            {loading ? "Signing in…" : `Sign in${portal.staff ? ` as ${portal.label.toLowerCase()}` : ""}`}
          </button>

          {portal.staff ? (
            portal.id === "teacher" ? (
              <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
                New here?{" "}
                <Link href="/signup/teacher" className="text-[var(--color-primary)] font-medium hover:underline">
                  Create a teacher account
                </Link>
              </p>
            ) : (
              <p className={`mt-4 text-center text-xs ${t.dark ? "text-slate-400" : "text-[var(--color-text-muted)]"}`}>
                Dean &amp; admin accounts are provisioned by your administrator.{" "}
                <Link href="/login" className={`font-medium hover:underline ${t.dark ? "text-slate-200" : "text-[var(--color-primary)]"}`}>
                  Learner sign-in
                </Link>
              </p>
            )
          ) : (
            <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-[var(--color-primary)] font-medium hover:underline">
                Start free
              </Link>
            </p>
          )}
        </form>

        {!portal.staff && (
          <p className="mt-6 text-center text-xs text-[var(--color-text-muted)]/70">
            Teacher, dean or admin?{" "}
            <Link href="/staff" className="font-medium hover:text-[var(--color-primary)] hover:underline">
              Staff &amp; admin sign-in →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
