"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { homeForRole } from "@/lib/portal";
import { buttonClasses } from "@/components/ui";
import HumanCheck, { type HumanState } from "@/components/auth/HumanCheck";
import DateOfBirthPicker from "@/components/auth/DateOfBirthPicker";

// Teacher self-registration. A teacher can register to teach INDEPENDENTLY (their
// own cohorts, no institution) or JOIN an institution using the invite code their
// dean emailed them. Founding a new institution stays admin-provisioned, so it is
// deliberately NOT an option here. Role="teacher" is set server-side (whitelisted);
// a dean invite can upgrade the role on accept, after which we refresh the token.

const isNetworkErr = (m: string) =>
  /failed to fetch|networkerror|load failed|server_unavailable|internal server/i.test(m);

export default function TeacherSignupPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState(""); // ISO "YYYY-MM-DD" — required at registration
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // "check your email" state
  const [resent, setResent] = useState(false);
  const [human, setHuman] = useState<HumanState>({ ok: false });
  const [checkKey, setCheckKey] = useState(0);
  const [taken, setTaken] = useState<{ email?: boolean; name?: boolean }>({});
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedData, setAgreedData] = useState(false);

  function rearmHumanCheck() {
    setHuman({ ok: false });
    setCheckKey((k) => k + 1);
  }

  async function checkEmail() {
    const e = email.trim().toLowerCase();
    if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    try {
      const r = await api.checkAvailability({ email: e });
      setTaken((t) => ({ ...t, email: r.emailAvailable === false }));
    } catch {}
  }
  async function checkName() {
    const n = name.trim();
    if (n.length < 2) return;
    try {
      const r = await api.checkAvailability({ name: n });
      setTaken((t) => ({ ...t, name: r.nameAvailable === false }));
    } catch {}
  }

  function handleAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2 || name.trim().length > 40) {
      setError("Please enter your name (2–40 characters).");
      return;
    }
    if (taken.email || taken.name) {
      setError(taken.email ? "That email is already registered." : "That name is already taken.");
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
    setStep(2);
  }

  // mode: "solo" (independent) | "join" (institution via invite code)
  async function createTeacher(mode: "solo" | "join") {
    if (mode === "join" && !inviteCode.trim()) {
      setError("Enter the invitation code your institution's dean sent you.");
      return;
    }
    setLoading(true);
    setError("");
    const displayName = name.trim() || email.split("@")[0];
    try {
      // Fresh browser session for the new account.
      auth.clear();

      const res = await api.register(email.trim(), password, name.trim(), agreedTerms, agreedData, dob, human.token, "teacher");
      if (res.verificationRequired) {
        // Block-until-verified: no session yet. Stash the invite code so it's applied
        // automatically after the teacher confirms their email and signs in.
        if (mode === "join" && inviteCode.trim()) {
          try {
            localStorage.setItem("pending_teacher_invite", inviteCode.trim());
          } catch {
            /* private mode — they can re-enter the code from the console */
          }
        }
        setSent(true);
        setLoading(false);
        return;
      }
      // Verification disabled server-side — sign in immediately as before.
      if (res.tokens) {
        auth.setTokens(res.tokens.accessToken, res.tokens.refreshToken);
        auth.setProfile({ displayName });
        let role = "teacher";
        if (mode === "join") {
          const r = await api.acceptInvite(inviteCode.trim());
          role = r.role || "teacher";
          await api.refreshSession();
        }
        window.location.href = homeForRole(role);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // The pass is single-use and consumed per attempt — re-arm for a retry.
      rearmHumanCheck();
      if (err instanceof TypeError || isNetworkErr(msg)) {
        setError("Can't reach the server right now. Please try again in a moment.");
      } else if (msg === "human_verification_required") {
        setError("Please complete the human check again, then continue.");
        setStep(1);
      } else if (msg === "email already registered") {
        setError("That email is already registered. Try signing in instead.");
        setStep(1);
      } else if (/already taken/i.test(msg)) {
        setError("That name is already taken — please choose another.");
        setStep(1);
      } else if (/invite/i.test(msg) || msg === "Unauthorized") {
        // acceptInvite errors: bad/expired token, wrong email, already in another institution.
        setError("That invitation code isn't valid for this email (it may be expired or for a different address). Check with your dean.");
      } else {
        setError("Couldn't create your teacher account. Please try again.");
      }
      setLoading(false);
    }
  }

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
            {step === 1 ? "Create your teacher account." : "How will you teach?"}
          </p>
        </div>

        <div className="bg-white rounded-[var(--radius-card)] shadow-sm border border-[var(--color-border)] p-8">
          <span className="inline-block mb-4 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            Teacher registration
          </span>

          {error && (
            <div
              className="mb-4 p-3 rounded-[var(--radius-control)] text-sm"
              style={{ backgroundColor: "var(--color-danger-surface)", color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}
            >
              {error}
            </div>
          )}

          {sent && (
            <div className="text-center">
              <div className="text-4xl mb-3" aria-hidden>📬</div>
              <h1 className="text-lg font-bold text-[var(--color-primary)]">Check your email</h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                We sent a confirmation link to <strong className="break-all">{email.trim()}</strong>. Click it to
                activate your teacher account, then sign in.
              </p>
              <div className="mt-5">
                {resent ? (
                  <p className="text-sm text-[var(--color-success)]">Sent again — check your inbox (and spam).</p>
                ) : (
                  <button
                    onClick={async () => { try { await api.resendVerification(email.trim()); } catch {} setResent(true); }}
                    className={`${buttonClasses("secondary", "md")} w-full`}
                  >
                    Didn&apos;t get it? Resend
                  </button>
                )}
              </div>
              <p className="mt-4 text-sm">
                <Link href="/staff/teacher" className="text-[var(--color-primary)] font-medium hover:underline">Go to sign in</Link>
              </p>
            </div>
          )}

          {/* Step indicator */}
          {!sent && (
            <div className="flex items-center gap-2 mb-6">
              {[1, 2].map((i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${step >= i ? "bg-[var(--color-primary)]" : "bg-[var(--color-surface-2)]"}`} />
              ))}
            </div>
          )}

          {!sent && step === 1 && (
            <form onSubmit={handleAccount}>
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium mb-1">Full name</label>
                <input id="name" type="text" value={name} onChange={(e) => { setName(e.target.value); setTaken((t) => ({ ...t, name: undefined })); }} onBlur={checkName} required minLength={2} maxLength={40} className={inputCls} placeholder="How your students see you" />
                {taken.name && <p className="mt-1 text-xs text-[var(--color-accent)]">That name is already taken — please choose another.</p>}
              </div>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
                <input id="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setTaken((t) => ({ ...t, email: undefined })); }} onBlur={checkEmail} required autoComplete="email" className={inputCls} placeholder="you@school.edu" />
                {taken.email && (
                  <p className="mt-1 text-xs text-[var(--color-accent)]">
                    That email is already registered.{" "}
                    <Link href="/staff/teacher" className="underline font-medium">Sign in instead</Link>.
                  </p>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Date of birth</label>
                <DateOfBirthPicker onChange={setDob} idPrefix="teacher-dob" />
              </div>
              <div className="mb-4">
                <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" className={inputCls} placeholder="At least 10 characters, with letters and numbers" />
              </div>
              <HumanCheck key={checkKey} onChange={setHuman} />

              <label className="mt-1 mb-2 flex items-start gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" required />
                <span>
                  I accept the{" "}
                  <Link href="/legal/terms" target="_blank" className="text-[var(--color-primary)] underline">Terms</Link> and the{" "}
                  <Link href="/legal/cookies" target="_blank" className="text-[var(--color-primary)] underline">Cookie Policy</Link>.
                </span>
              </label>
              <label className="mb-3 flex items-start gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                <input type="checkbox" checked={agreedData} onChange={(e) => setAgreedData(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" required />
                <span>
                  I give my{" "}
                  <Link href="/legal/consent" target="_blank" className="text-[var(--color-primary)] underline">consent to the processing of my personal data</Link>{" "}
                  per the{" "}
                  <Link href="/legal/privacy" target="_blank" className="text-[var(--color-primary)] underline">Privacy Policy</Link> (152-ФЗ).
                </span>
              </label>

              <button type="submit" disabled={!human.ok || !dob || taken.email || taken.name || !agreedTerms || !agreedData} className={`${buttonClasses("primary", "md")} w-full disabled:opacity-50`}>
                Continue
              </button>
            </form>
          )}

          {!sent && step === 2 && (
            <div>
              <div className="space-y-3">
                {/* Independent */}
                <button
                  type="button"
                  onClick={() => createTeacher("solo")}
                  disabled={loading}
                  className="w-full text-left rounded-[var(--radius-control)] border-2 border-[var(--color-border-strong)] hover:border-[var(--color-primary)] p-4 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>🧑‍🏫</span>
                    <div className="flex-1">
                      <p className="font-semibold text-[var(--color-primary)] text-sm">Teach independently</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Create your own classes and assignments. No institution needed.</p>
                    </div>
                    <span className="text-[var(--color-primary)] text-lg font-bold">→</span>
                  </div>
                </button>

                {/* Join institution */}
                <div className="rounded-[var(--radius-control)] border-2 border-[var(--color-border-strong)] p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl" aria-hidden>🏫</span>
                    <div className="flex-1">
                      <p className="font-semibold text-[var(--color-primary)] text-sm">Join my institution</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Enter the invitation code your dean emailed you.</p>
                    </div>
                  </div>
                  <input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.trim())}
                    placeholder="Invitation code"
                    className="w-full px-3 py-2 mb-2 border-2 border-[var(--color-border-strong)] rounded-[var(--radius-control)] text-sm font-mono outline-none focus:border-[var(--color-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => createTeacher("join")}
                    disabled={loading || !inviteCode.trim()}
                    className={`${buttonClasses("navy", "md")} w-full disabled:opacity-50`}
                  >
                    {loading ? "Creating…" : "Join & continue"}
                  </button>
                </div>
              </div>

              <button type="button" onClick={() => setStep(1)} disabled={loading} className="mt-4 text-sm text-[var(--color-text-muted)] hover:underline disabled:opacity-50">
                ← Back
              </button>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            Already have a teacher account?{" "}
            <Link href="/staff/teacher" className="text-[var(--color-primary)] font-medium hover:underline">Sign in</Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-text-muted)]/70">
          Looking to learn Russian?{" "}
          <Link href="/signup" className="font-medium hover:text-[var(--color-primary)] hover:underline">Create a learner account →</Link>
        </p>
      </div>
    </div>
  );
}
