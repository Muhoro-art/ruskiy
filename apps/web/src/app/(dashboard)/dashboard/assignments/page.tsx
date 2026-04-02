"use client";

import Link from "next/link";

const MOCK_ASSIGNMENTS = [
  {
    id: "a1",
    title: "Genitive Case Practice",
    cohort: "Russian 101",
    targetSkills: ["Gen. Singular", "Gen. Plural"],
    deadline: "Mar 22, 2026",
    completions: 18,
    total: 24,
    avgScore: 72,
    status: "active",
  },
  {
    id: "a2",
    title: "Verbal Aspect Introduction",
    cohort: "Russian 101",
    targetSkills: ["Aspect Intro", "Aspect Pairs"],
    deadline: "Mar 29, 2026",
    completions: 5,
    total: 24,
    avgScore: 61,
    status: "active",
  },
  {
    id: "a3",
    title: "Medical Vocabulary A1",
    cohort: "Medical Track",
    targetSkills: ["Anatomy Terms", "Patient Interaction"],
    deadline: "Mar 15, 2026",
    completions: 12,
    total: 12,
    avgScore: 85,
    status: "completed",
  },
];

export default function AssignmentsPage() {
  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">Assignments</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Create and track adaptive assignments for your cohorts
          </p>
        </div>
        <Link
          href="/dashboard/assignments/new"
          className="bg-[var(--color-primary)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors"
        >
          + New Assignment
        </Link>
      </div>

      <div className="space-y-4">
        {MOCK_ASSIGNMENTS.map((a) => (
          <div
            key={a.id}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">{a.title}</h3>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      a.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {a.cohort} · Due: {a.deadline}
                </p>
                <div className="flex gap-2 mt-2">
                  {a.targetSkills.map((skill) => (
                    <span
                      key={skill}
                      className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[var(--color-primary)]">
                  {a.completions}/{a.total}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  completed · {a.avgScore}% avg
                </p>
              </div>
            </div>
            <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${(a.completions / a.total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
