"use client";

import Link from "next/link";

const MOCK_COHORTS = [
  {
    id: "c1",
    name: "Russian 101 — Spring 2026",
    students: 24,
    avgProficiency: 0.42,
    activeToday: 18,
    weakestSkill: "Genitive Case",
    trend: "up",
  },
  {
    id: "c2",
    name: "Intensive Russian — Medical Track",
    students: 12,
    avgProficiency: 0.61,
    activeToday: 9,
    weakestSkill: "Verbal Aspect",
    trend: "up",
  },
  {
    id: "c3",
    name: "Russian for Engineers — Fall 2026",
    students: 18,
    avgProficiency: 0.35,
    activeToday: 5,
    weakestSkill: "Accusative Case",
    trend: "down",
  },
];

export default function CohortsPage() {
  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">
            Cohorts
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Manage your classes and track student progress
          </p>
        </div>
        <button className="bg-[var(--color-primary)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors">
          + New Cohort
        </button>
      </div>

      <div className="grid gap-4">
        {MOCK_COHORTS.map((cohort) => (
          <Link
            key={cohort.id}
            href={`/dashboard/cohorts/${cohort.id}`}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow block"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{cohort.name}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-[var(--color-text-muted)]">
                  <span>{cohort.students} students</span>
                  <span>·</span>
                  <span>{cohort.activeToday} active today</span>
                  <span>·</span>
                  <span>Weakest: {cohort.weakestSkill}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-[var(--color-primary)]">
                    {Math.round(cohort.avgProficiency * 100)}%
                  </span>
                  <span
                    className={`text-lg ${cohort.trend === "up" ? "text-green-500" : "text-red-500"}`}
                  >
                    {cohort.trend === "up" ? "↑" : "↓"}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  avg proficiency
                </p>
              </div>
            </div>

            {/* Mini proficiency bar */}
            <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${cohort.avgProficiency * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
