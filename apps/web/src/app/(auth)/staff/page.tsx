"use client";

import Link from "next/link";
import { STAFF_PORTALS } from "@/lib/portal";

const ICONS: Record<string, string> = { teacher: "🧭", dean: "🏛️", admin: "🛠️" };

// Staff & admin entry point. Each role signs in through its OWN portal; this page
// just routes them to the right door. The server binds every login to one role,
// so choosing the wrong card here fails safely at sign-in.
export default function StaffChooserPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-[var(--color-primary)]">
            РУССКИЙ
          </Link>
          <p className="mt-2 text-[var(--color-text-muted)]">Staff &amp; admin sign-in</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 space-y-2">
          {STAFF_PORTALS.map((p) => (
            <Link
              key={p.id}
              href={p.loginPath}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors"
            >
              <span className="text-2xl" aria-hidden>
                {ICONS[p.id]}
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-[var(--color-text)]">{p.label}</span>
                <span className="block text-xs text-[var(--color-text-muted)]">{p.subtitle}</span>
              </span>
              <span className="text-[var(--color-text-muted)]">→</span>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
          Are you a learner?{" "}
          <Link href="/login" className="text-[var(--color-primary)] font-medium hover:underline">
            Learner sign-in
          </Link>
        </p>
      </div>
    </div>
  );
}
