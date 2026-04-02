"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/v1/auth/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // Store tokens
      localStorage.setItem("access_token", data.tokens.accessToken);
      localStorage.setItem("refresh_token", data.tokens.refreshToken);

      // Fetch profile to store learner_id and display name
      try {
        const profileRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/v1/profiles`,
          {
            headers: { Authorization: `Bearer ${data.tokens.accessToken}` },
          }
        );
        if (profileRes.ok) {
          const profiles = await profileRes.json();
          if (Array.isArray(profiles) && profiles.length > 0) {
            localStorage.setItem("learner_id", profiles[0].id);
            localStorage.setItem("display_name", profiles[0].displayName || "Learner");
            localStorage.setItem("learner_segment", profiles[0].segment || "");
            // Returning users have already done placement (or were pre-existing)
            localStorage.setItem("placement_completed", "true");
            localStorage.setItem("current_level", profiles[0].currentLevel || "A1");
          }
        }
      } catch {
        // Non-fatal
      }

      // Redirect to dashboard
      window.location.href = "/dashboard";
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
            Welcome back. Continue learning.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
        >
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

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
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-primary)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-[var(--color-primary)] font-medium hover:underline"
            >
              Start free
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
