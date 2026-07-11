"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { buttonClasses } from "@/components/ui";
import HumanCheck, { type HumanState } from "@/components/auth/HumanCheck";
import DateOfBirthPicker, { computeAge } from "@/components/auth/DateOfBirthPicker";

// Block-until-verified signup: this page only creates the ACCOUNT (name/email/password).
// The server sends a verification email and issues NO session; the learner confirms via
// the emailed link, then signs in and completes onboarding (segment/level) at /onboarding.
// (A bot with no reachable inbox can't get past this.)

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /failed to fetch|networkerror|load failed|fetch|server_unavailable|internal server/i.test(err.message))
  );
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // ISO "YYYY-MM-DD" birth date — the authoritative age signal. Under 18 → a guardian
  // sets this up and consents on the child's behalf (the child can't consent in law).
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // "check your email" state
  const [resent, setResent] = useState(false);
  const [human, setHuman] = useState<HumanState>({ ok: false });
  const [checkKey, setCheckKey] = useState(0);
  // Inline "already taken" flags, checked on blur so the user finds out immediately.
  const [taken, setTaken] = useState<{ email?: boolean; name?: boolean }>({});
  // Two SEPARATE, standalone acceptances (152-FZ amended 1 Sept 2025 — data-processing
  // consent must not be bundled with the Terms).
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedData, setAgreedData] = useState(false);

  async function checkEmail() {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    try {
      const r = await api.checkAvailability({ email: e });
      setTaken((t) => ({ ...t, email: r.emailAvailable === false }));
    } catch {
      /* availability is best-effort; the submit-time check is the real guard */
    }
  }
  async function checkName() {
    const n = name.trim();
    if (n.length < 2) return;
    try {
      const r = await api.checkAvailability({ name: n });
      setTaken((t) => ({ ...t, name: r.nameAvailable === false }));
    } catch {
      /* best-effort */
    }
  }

  function rearmHuman() {
    setHuman({ ok: false });
    setCheckKey((k) => k + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2 || name.trim().length > 40) {
      setError("Please choose a display name (2–40 characters).");
      return;
    }
    if (!dob) {
      setError("Please enter your date of birth.");
      return;
    }
    if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must be at least 10 characters and include letters and numbers.");
      return;
    }
    if (!agreedTerms || !agreedData) {
      setError("Please accept the Terms and give consent to processing your personal data to continue.");
      return;
    }
    setLoading(true);
    try {
      // Fresh browser session so a prior user's flags can't leak into this signup.
      auth.clear();
      const res = await api.register(email.trim(), password, name.trim(), agreedTerms, agreedData, dob, human.token);
      if (res.verificationRequired) {
        setSent(true); // account created; wait for email confirmation
        return;
      }
      // Verification disabled server-side: we got a session — go straight to onboarding.
      if (res.tokens) {
        auth.setTokens(res.tokens.accessToken, res.tokens.refreshToken);
        window.location.href = "/onboarding";
      }
    } catch (err) {
      rearmHuman();
      const msg = err instanceof Error ? err.message : "";
      if (msg === "human_verification_required") {
        setError("Please complete the human check again, then continue.");
      } else if (/already registered/i.test(msg)) {
        setError("That email is already registered. Try signing in instead.");
      } else if (/already taken/i.test(msg)) {
        setError("That display name is already taken — please choose another.");
      } else if (isNetworkError(err)) {
        setError("Can't reach the server right now. Please try again in a moment.");
      } else {
        setError(msg || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      await api.resendVerification(email.trim());
    } catch {
      /* server always-200 */
    }
    setResent(true);
  }

  // Under 18 → the data-processing consent below is given by the account holder as the
  // child's parent/legal guardian (a minor cannot consent under 152-FZ).
  const age = computeAge(dob);
  const isMinor = age !== null && age < 18;

  const inputCls =
    "w-full px-4 py-3 border border-[var(--color-border-strong)] rounded-[var(--radius-control)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none";

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-[var(--color-surface)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link href="/" className="text-3xl font-bold text-[var(--color-primary)] display">
            РУССКИЙ
          </Link>
          <p className="mt-2 text-[var(--color-text-muted)]">
            {sent ? "One more step — confirm your email." : "Start your Russian journey today."}
          </p>
        </div>

        <div className="bg-white rounded-[var(--radius-card)] shadow-sm border border-[var(--color-border)] p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-3" aria-hidden>📬</div>
              <h1 className="text-lg font-bold text-[var(--color-primary)]">Check your email</h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                We sent a confirmation link to <strong className="break-all">{email.trim()}</strong>. Click it to
                activate your account, then sign in to pick your level.
              </p>
              <div className="mt-5">
                {resent ? (
                  <p className="text-sm text-[var(--color-success)]">Sent again — check your inbox (and spam).</p>
                ) : (
                  <button onClick={resend} className={`${buttonClasses("secondary", "md")} w-full`}>
                    Didn&apos;t get it? Resend
                  </button>
                )}
              </div>
              <p className="mt-4 text-sm">
                <Link href="/login" className="text-[var(--color-primary)] font-medium hover:underline">
                  Go to sign in
                </Link>
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="mb-4 p-3 rounded-[var(--radius-control)] text-sm"
                  style={{ backgroundColor: "var(--color-danger-surface)", color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
                >
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="name" className="block text-sm font-medium mb-1">Display Name</label>
                  <input id="name" type="text" value={name} onChange={(e) => { setName(e.target.value); setTaken((t) => ({ ...t, name: undefined })); }} onBlur={checkName} required minLength={2} maxLength={40} className={inputCls} placeholder="How should we call you?" />
                  {taken.name && <p className="mt-1 text-xs text-[var(--color-accent)]">That display name is already taken — please choose another.</p>}
                </div>
                <div className="mb-4">
                  <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
                  <input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setTaken((t) => ({ ...t, email: undefined })); }} onBlur={checkEmail} required className={inputCls} placeholder="you@example.com" />
                  {taken.email && (
                    <p className="mt-1 text-xs text-[var(--color-accent)]">
                      That email is already registered.{" "}
                      <Link href="/login" className="underline font-medium">Sign in instead</Link>.
                    </p>
                  )}
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Date of birth</label>
                  <DateOfBirthPicker onChange={setDob} />
                  {isMinor && (
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      This account is for someone under 18, so a parent or legal guardian needs to set it up
                      and give consent below.
                    </p>
                  )}
                </div>
                <div className="mb-4">
                  <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
                  <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} className={inputCls} placeholder="At least 10 characters, with letters and numbers" />
                </div>
                <HumanCheck key={checkKey} onChange={setHuman} />

                {/* Two SEPARATE consents (152-FZ). Neither pre-ticked. */}
                <label className="mt-1 mb-2 flex items-start gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" required />
                  <span>
                    I accept the{" "}
                    <Link href="/legal/terms" target="_blank" className="text-[var(--color-primary)] underline">Terms of Service</Link>{" "}
                    and the{" "}
                    <Link href="/legal/cookies" target="_blank" className="text-[var(--color-primary)] underline">Cookie Policy</Link>.
                  </span>
                </label>
                <label className="mb-3 flex items-start gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input type="checkbox" checked={agreedData} onChange={(e) => setAgreedData(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" required />
                  {isMinor ? (
                    <span>
                      I am this person&apos;s parent or legal guardian, I am 18 or older, and — since a minor
                      cannot consent in law — I give my{" "}
                      <Link href="/legal/consent" target="_blank" className="text-[var(--color-primary)] underline">consent, on their behalf, to the processing of their personal data</Link>{" "}
                      in accordance with the{" "}
                      <Link href="/legal/privacy" target="_blank" className="text-[var(--color-primary)] underline">Privacy Policy</Link> (152-ФЗ).
                    </span>
                  ) : (
                    <span>
                      I give my{" "}
                      <Link href="/legal/consent" target="_blank" className="text-[var(--color-primary)] underline">consent to the processing of my personal data</Link>{" "}
                      in accordance with the{" "}
                      <Link href="/legal/privacy" target="_blank" className="text-[var(--color-primary)] underline">Privacy Policy</Link> (152-ФЗ).
                    </span>
                  )}
                </label>

                <button type="submit" disabled={!human.ok || loading || !dob || taken.email || taken.name || !agreedTerms || !agreedData} className={`${buttonClasses("primary", "md")} w-full disabled:opacity-50`}>
                  {loading ? "Creating…" : "Create account"}
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
                Already have an account?{" "}
                <Link href="/login" className="text-[var(--color-primary)] font-medium hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
