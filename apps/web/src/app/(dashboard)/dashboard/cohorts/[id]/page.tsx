"use client";

import Link from "next/link";
import { useState } from "react";

const SKILLS = [
  "Nom. Case",
  "Acc. Case",
  "Gen. Case",
  "Dat. Case",
  "Verb Conj.",
  "Aspect",
  "Phonetics",
  "Vocabulary",
];

const MOCK_STUDENTS = [
  { id: "s1", name: "Anna K.", scores: [0.92, 0.78, 0.45, 0.31, 0.85, 0.52, 0.67, 0.88], active: true },
  { id: "s2", name: "Boris M.", scores: [0.88, 0.65, 0.38, 0.42, 0.71, 0.33, 0.55, 0.72], active: true },
  { id: "s3", name: "Clara S.", scores: [0.95, 0.91, 0.72, 0.68, 0.93, 0.78, 0.82, 0.94], active: true },
  { id: "s4", name: "Dmitri V.", scores: [0.55, 0.42, 0.21, 0.15, 0.48, 0.22, 0.38, 0.51], active: false },
  { id: "s5", name: "Elena R.", scores: [0.82, 0.73, 0.58, 0.52, 0.79, 0.61, 0.72, 0.85], active: true },
  { id: "s6", name: "Felix T.", scores: [0.78, 0.61, 0.35, 0.28, 0.65, 0.41, 0.48, 0.69], active: true },
  { id: "s7", name: "Greta W.", scores: [0.91, 0.85, 0.65, 0.59, 0.88, 0.72, 0.78, 0.91], active: false },
  { id: "s8", name: "Hugo L.", scores: [0.45, 0.32, 0.18, 0.12, 0.38, 0.15, 0.25, 0.42], active: true },
];

function getHeatColor(value: number): string {
  if (value >= 0.8) return "bg-green-100 text-green-800";
  if (value >= 0.6) return "bg-green-50 text-green-700";
  if (value >= 0.4) return "bg-yellow-50 text-yellow-700";
  if (value >= 0.25) return "bg-orange-50 text-orange-700";
  return "bg-red-50 text-red-700";
}

function getHeatBg(value: number): string {
  if (value >= 0.8) return "#22c55e";
  if (value >= 0.6) return "#86efac";
  if (value >= 0.4) return "#fde047";
  if (value >= 0.25) return "#fb923c";
  return "#ef4444";
}

export default function CohortDetailPage() {
  const [selectedCell, setSelectedCell] = useState<{
    student: string;
    skill: string;
    score: number;
  } | null>(null);

  const columnAverages = SKILLS.map((_, colIdx) => {
    const sum = MOCK_STUDENTS.reduce((acc, s) => acc + s.scores[colIdx], 0);
    return sum / MOCK_STUDENTS.length;
  });

  return (
    <div className="max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard/cohorts" className="hover:text-[var(--color-primary)]">
          Cohorts
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">Russian 101 — Spring 2026</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">
            Russian 101 — Spring 2026
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            24 students · 18 active today · Avg proficiency: 62%
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/assignments/new"
            className="bg-[var(--color-primary)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors"
          >
            + New Assignment
          </Link>
          <button className="border border-gray-300 text-gray-700 font-medium px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      {/* Weakness Heat Map */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Skill Weakness Heat Map</h2>
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-500" /> Struggling (&lt;25%)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-400" /> Weak (25-40%)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-400" /> Developing (40-60%)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-300" /> Good (60-80%)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" /> Strong (&gt;80%)
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-3 pr-4 w-36">
                  Student
                </th>
                {SKILLS.map((skill) => (
                  <th
                    key={skill}
                    className="text-center text-xs font-medium text-[var(--color-text-muted)] pb-3 px-1"
                  >
                    {skill}
                  </th>
                ))}
                <th className="text-center text-xs font-medium text-[var(--color-text-muted)] pb-3 px-2">
                  Avg
                </th>
              </tr>
            </thead>
            <tbody>
              {MOCK_STUDENTS.map((student) => {
                const avg =
                  student.scores.reduce((a, b) => a + b, 0) /
                  student.scores.length;
                return (
                  <tr key={student.id} className="group">
                    <td className="py-1 pr-4">
                      <Link
                        href={`/dashboard/students/${student.id}`}
                        className="flex items-center gap-2 hover:text-[var(--color-primary)]"
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${student.active ? "bg-green-500" : "bg-gray-300"}`}
                        />
                        <span className="text-sm font-medium">
                          {student.name}
                        </span>
                      </Link>
                    </td>
                    {student.scores.map((score, i) => (
                      <td key={i} className="py-1 px-1">
                        <button
                          onClick={() =>
                            setSelectedCell({
                              student: student.name,
                              skill: SKILLS[i],
                              score,
                            })
                          }
                          className={`w-full py-2 rounded text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-[var(--color-primary)] transition-all ${getHeatColor(score)}`}
                          style={{ opacity: 0.6 + score * 0.4 }}
                        >
                          {Math.round(score * 100)}
                        </button>
                      </td>
                    ))}
                    <td className="py-1 px-2">
                      <span className="text-sm font-bold text-[var(--color-primary)]">
                        {Math.round(avg * 100)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Column averages */}
              <tr className="border-t-2 border-gray-200">
                <td className="py-2 pr-4 text-xs font-bold text-[var(--color-text-muted)]">
                  Class Avg
                </td>
                {columnAverages.map((avg, i) => (
                  <td key={i} className="py-2 px-1 text-center">
                    <div
                      className="text-xs font-bold rounded py-1"
                      style={{
                        backgroundColor: getHeatBg(avg) + "30",
                        color: getHeatBg(avg),
                      }}
                    >
                      {Math.round(avg * 100)}
                    </div>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Drill-down panel */}
        {selectedCell && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--color-primary)]">
                  {selectedCell.student} — {selectedCell.skill}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Confidence: {Math.round(selectedCell.score * 100)}% ·
                  {selectedCell.score < 0.4
                    ? " Primary error: L1 transfer (using nominative where case marking needed)"
                    : selectedCell.score < 0.7
                      ? " Developing — needs more interleaved practice"
                      : " On track — continue spaced review"}
                </p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-red-600 mb-2">At Risk Students</h3>
          <div className="space-y-2">
            {MOCK_STUDENTS.filter(
              (s) =>
                s.scores.reduce((a, b) => a + b, 0) / s.scores.length < 0.4
            ).map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/students/${s.id}`}
                className="block text-sm hover:text-[var(--color-primary)]"
              >
                {s.name} —{" "}
                {Math.round(
                  (s.scores.reduce((a, b) => a + b, 0) / s.scores.length) * 100
                )}
                % avg
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-orange-600 mb-2">
            Weakest Skills (Class)
          </h3>
          <div className="space-y-2">
            {columnAverages
              .map((avg, i) => ({ skill: SKILLS[i], avg }))
              .sort((a, b) => a.avg - b.avg)
              .slice(0, 3)
              .map((item) => (
                <p key={item.skill} className="text-sm">
                  {item.skill} —{" "}
                  <span className="font-semibold text-orange-600">
                    {Math.round(item.avg * 100)}%
                  </span>
                </p>
              ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-bold text-green-600 mb-2">Top Performers</h3>
          <div className="space-y-2">
            {MOCK_STUDENTS.sort(
              (a, b) =>
                b.scores.reduce((x, y) => x + y, 0) -
                a.scores.reduce((x, y) => x + y, 0)
            )
              .slice(0, 3)
              .map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/students/${s.id}`}
                  className="block text-sm hover:text-[var(--color-primary)]"
                >
                  {s.name} —{" "}
                  {Math.round(
                    (s.scores.reduce((a, b) => a + b, 0) / s.scores.length) *
                      100
                  )}
                  % avg
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
