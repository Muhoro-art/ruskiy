"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { SEGMENT_PROFILE } from "@/curriculum/segments";
import type { Segment } from "@/curriculum/types";
import { buttonClasses } from "@/components/ui";

// Post-verification onboarding: shown after a learner's FIRST verified sign-in (they have
// no profile yet). It collects segment + level and creates the learner profile — the part
// of signup that used to run before email verification. Staff never see this.

function canonicalSegment(raw: string): Segment {
  return (raw === "migrant" ? "daily_life" : raw) as Segment;
}

const SEGMENTS = [
  { value: "kid", label: "Kid (6-12)", desc: "Story world learning" },
  { value: "teen", label: "Teen (13-17)", desc: "Social & identity-driven" },
  { value: "uni_prep", label: "University Prep (17-25)", desc: "Intensive academic track" },
  { value: "migrant", label: "Daily Life (25-65)", desc: "Survival-first utility" },
  { value: "senior", label: "Senior (65+)", desc: "Travel & culture" },
];

const LEVELS = [
  { value: "A1", label: "Complete beginner", desc: "Little or no Russian" },
  { value: "A2", label: "Elementary", desc: "Alphabet + basic words" },
  { value: "B1", label: "Intermediate", desc: "Simple conversations" },
  { value: "B2", label: "Upper-intermediate", desc: "Comfortable most of the time" },
  { value: "C1", label: "Advanced", desc: "Near-fluent" },
];

const RANK: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

const ENGLISH_LEVELS = [
  { value: "fluent", label: "Grammar terms are fine", desc: "I know words like 'case', 'tense', 'preposition'." },
  { value: "conversational", label: "I speak English, skip the jargon", desc: "Explain grammar words in plain English." },
  { value: "basic", label: "Just enough English", desc: "Keep everything simple and explain the terms." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [segment, setSegment] = useState("");
  const [level, setLevel] = useState("A1");
  const [englishLevel, setEnglishLevel] = useState("conversational");
  const [consent, setConsent] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Guard: must be signed in; if a profile already exists, skip onboarding.
  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace("/login");
      return;
    }
    api
      .getProfiles()
      .then((ps) => {
        if (Array.isArray(ps) && ps.length > 0) {
          router.replace("/dashboard/path"); // already onboarded
        } else {
          setReady(true);
        }
      })
      .catch(() => setReady(true)); // if the check fails, let them onboard
  }, [router]);

  const seg = segment ? canonicalSegment(segment) : null;
  // Under 18 (kid + teen) — a guardian sets this up and consents on the child's behalf.
  const isMinor = seg === "kid" || seg === "teen";
  const cap = seg ? SEGMENT_PROFILE[seg].targetLevel : "C1";
  function startLevel(): string {
    if (!seg) return level;
    if (seg === "kid") return "A1";
    return RANK[level] > RANK[cap] ? cap : level;
  }

  async function finish(dest = "/dashboard/path") {
    if (!segment) {
      setError("Please select who you are.");
      return;
    }
    if (isMinor && !consent) {
      setError("As the parent or legal guardian, please confirm you consent to setting this up for a child under 18.");
      return;
    }
    setLoading(true);
    setError("");
    const displayName = auth.getDisplayName() || "Learner";
    try {
      const profileInfo = await api.createProfile({
        displayName,
        segment,
        targetLevel: SEGMENT_PROFILE[canonicalSegment(segment)].targetLevel,
        weeklyHours: 5,
        // Under 18 → the account holder (parent/guardian) consents on the child's behalf;
        // the server records an auditable guardian-consent (the child never signs anything).
        ...(isMinor ? { consent: { method: "guardian_checkbox", consenterEmail: "" } } : {}),
      });
      auth.setProfile({
        id: profileInfo.id,
        displayName: profileInfo.displayName || displayName,
        segment: profileInfo.segment || segment,
        currentLevel: startLevel(),
        englishLevel: seg === "kid" ? "basic" : englishLevel,
      });
      auth.setWorkingLevel(startLevel());
      auth.setPlacementCompleted(true);

      if (joinCode.trim()) {
        try {
          await api.joinInstitution(joinCode.trim());
        } catch {
          window.location.href = `/dashboard/join?code=${encodeURIComponent(joinCode.trim())}`;
          return;
        }
      }
      window.location.href = dest;
    } catch (err) {
      setError(err instanceof Error && err.message !== "Unauthorized" ? err.message : "Couldn't save your setup. Please try again.");
      setLoading(false);
    }
  }

  const cardCls = (on: boolean) =>
    `text-left rounded-[var(--radius-control)] border-2 transition-colors ${
      on ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]" : "border-[var(--color-border-strong)] hover:border-[var(--color-primary)]"
    }`;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" aria-label="Loading" />
      </div>
    );
  }

  const totalSteps = seg === "kid" ? 1 : 2;
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-[var(--color-surface)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-3xl font-bold text-[var(--color-primary)] display">РУССКИЙ</span>
          <p className="mt-2 text-[var(--color-text-muted)]">{step === 1 ? "Who's learning?" : "Where should we start you?"}</p>
        </div>

        <div className="bg-white rounded-[var(--radius-card)] shadow-sm border border-[var(--color-border)] p-8">
          {error && (
            <div className="mb-4 p-3 rounded-[var(--radius-control)] text-sm" style={{ backgroundColor: "var(--color-danger-surface)", color: "var(--color-accent)", border: "1px solid var(--color-accent)" }}>
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 mb-6">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${step >= i + 1 ? "bg-[var(--color-primary)]" : "bg-[var(--color-surface-2)]"}`} />
            ))}
          </div>

          {step === 1 && (
            <div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {SEGMENTS.map((s) => (
                  <button key={s.value} type="button" onClick={() => setSegment(s.value)} className={`${cardCls(segment === s.value)} p-3`}>
                    <span className="font-medium text-sm">{s.label}</span>
                    <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{s.desc}</span>
                  </button>
                ))}
              </div>

              {isMinor && (
                <label className="flex items-start gap-2 text-sm cursor-pointer rounded-[var(--radius-control)] p-3 mb-5" style={{ backgroundColor: "var(--color-primary-tint)", border: "1px solid color-mix(in srgb, var(--color-primary) 20%, white)" }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" />
                  <span>
                    This account is for a child under 18. I confirm that I am the child&apos;s parent or legal
                    guardian, that I am 18 or older, and — since a minor cannot legally give consent — I consent
                    on their behalf to the processing of their personal data for their use of Russkiy, in
                    accordance with the <a href="/legal/privacy" target="_blank" className="text-[var(--color-primary)] underline">Privacy Policy</a> (152-ФЗ).
                  </span>
                </label>
              )}

              {seg === "kid" ? (
                <button type="button" onClick={() => finish()} disabled={loading || !consent} className={`${buttonClasses("primary", "md")} w-full`}>
                  {loading ? "Saving…" : "Start Learning"}
                </button>
              ) : (
                <button type="button" onClick={() => segment && setStep(2)} disabled={!segment || (isMinor && !consent)} className={`${buttonClasses("navy", "md")} w-full`}>Next →</button>
              )}
            </div>
          )}

          {step === 2 && seg !== "kid" && (
            <div>
              <button type="button" onClick={() => finish("/dashboard/level-check")} disabled={loading} className="w-full mb-4 rounded-[var(--radius-control)] border-2 border-[var(--color-primary)] p-3 text-left disabled:opacity-50" style={{ backgroundColor: "var(--color-primary-tint)" }}>
                <p className="font-semibold text-[var(--color-primary)] text-sm">🎯 Find your exact level <span className="text-xs text-[var(--color-accent)]">· recommended</span></p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">A quick adaptive check (~3 min).</p>
              </button>

              <div className="flex items-center gap-3 my-3">
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <span className="text-xs text-[var(--color-text-muted)]">or set it yourself</span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>

              <h3 className="font-semibold text-sm mb-2 text-[var(--color-primary)]">How much Russian do you know?</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {LEVELS.filter((lv) => RANK[lv.value] <= RANK[cap]).map((lv) => (
                  <button key={lv.value} type="button" onClick={() => setLevel(lv.value)} className={`${cardCls(level === lv.value)} px-3 py-2 text-sm`}>
                    <span className="font-medium">{lv.label}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">{lv.desc}</span>
                  </button>
                ))}
              </div>

              <h3 className="font-semibold text-sm mb-1 text-[var(--color-primary)]">Your English</h3>
              <div className="space-y-2 mb-4">
                {ENGLISH_LEVELS.map((el) => (
                  <button key={el.value} type="button" onClick={() => setEnglishLevel(el.value)} className={`${cardCls(englishLevel === el.value)} w-full px-3 py-2 text-sm`}>
                    <span className="font-medium">{el.label}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">{el.desc}</span>
                  </button>
                ))}
              </div>

              <label className="block text-sm font-semibold mb-1 text-[var(--color-primary)]">
                Institution code <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
              </label>
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Have a code from your school?" className="w-full px-3 py-2 mb-5 border-2 border-[var(--color-border-strong)] rounded-[var(--radius-control)] text-sm font-mono tracking-widest outline-none focus:border-[var(--color-primary)]" />

              <div className="flex gap-3">
                <button type="button" onClick={() => setStep(1)} className={`${buttonClasses("secondary", "md")} flex-1`}>Back</button>
                <button type="button" onClick={() => finish()} disabled={loading} className={`${buttonClasses("primary", "md")} flex-1`}>
                  {loading ? "Saving…" : "Start Learning"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
