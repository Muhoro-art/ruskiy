"use client";

import Link from "next/link";
import { useState } from "react";

const SEGMENTS = [
  { value: "kid", label: "Kid (6-12)", desc: "Story world learning" },
  { value: "teen", label: "Teen (13-17)", desc: "Social & identity-driven" },
  { value: "uni_prep", label: "University Prep (17-25)", desc: "Intensive academic track" },
  { value: "migrant", label: "Daily Life (25-65)", desc: "Survival-first utility" },
  { value: "senior", label: "Senior (65+)", desc: "Travel & culture" },
];

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setStep(2);
  }

  async function handleCreateProfile() {
    if (!segment) {
      setError("Please select who you are");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Register
      const regRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/v1/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const regData = await regRes.json();
      if (!regRes.ok) {
        setError(regData.error || "Registration failed");
        setLoading(false);
        return;
      }

      const token = regData.tokens.accessToken;
      localStorage.setItem("access_token", token);
      localStorage.setItem("refresh_token", regData.tokens.refreshToken);

      // Create profile
      const profileRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/v1/profiles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            displayName: name || email.split("@")[0],
            segment,
            targetLevel: "B1",
            weeklyHours: 5,
          }),
        }
      );

      if (!profileRes.ok) {
        const profileData = await profileRes.json();
        setError(profileData.error || "Failed to create profile");
        return;
      }

      // Store profile data for the dashboard and session generation
      const profileInfo = await profileRes.json();
      localStorage.setItem("display_name", profileInfo.displayName || name || email.split("@")[0]);
      localStorage.setItem("learner_id", profileInfo.id);
      localStorage.setItem("learner_segment", profileInfo.segment || segment);

      // Send to placement assessment first so the engine knows their level
      window.location.href = "/dashboard/placement";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-[var(--color-primary)]">
            РУССКИЙ
          </Link>
          <p className="mt-2 text-[var(--color-text-muted)]">
            {step === 1
              ? "Start your Russian journey today."
              : "Tell us about yourself."}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={`h-1 flex-1 rounded ${step >= 1 ? "bg-[var(--color-primary)]" : "bg-gray-200"}`} />
            <div className={`h-1 flex-1 rounded ${step >= 2 ? "bg-[var(--color-primary)]" : "bg-gray-200"}`} />
          </div>

          {step === 1 && (
            <form onSubmit={handleCreateAccount}>
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  Display Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
                  placeholder="How should we call you?"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
                  placeholder="you@example.com"
                />
              </div>

              <div className="mb-6">
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
                  placeholder="At least 8 characters"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[var(--color-accent)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--color-accent-light)] transition-colors"
              >
                Continue
              </button>
            </form>
          )}

          {step === 2 && (
            <div>
              <h3 className="font-semibold mb-4">I am a...</h3>
              <div className="space-y-3 mb-6">
                {SEGMENTS.map((seg) => (
                  <button
                    key={seg.value}
                    type="button"
                    onClick={() => setSegment(seg.value)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                      segment === seg.value
                        ? "border-[var(--color-primary)] bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="font-medium">{seg.label}</span>
                    <span className="block text-sm text-[var(--color-text-muted)] mt-0.5">
                      {seg.desc}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreateProfile}
                  disabled={loading || !segment}
                  className="flex-1 bg-[var(--color-accent)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--color-accent-light)] transition-colors disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Start Learning"}
                </button>
              </div>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-[var(--color-primary)] font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
