"use client";

import Link from "next/link";

const STUDENT = {
  name: "Hugo L.",
  segment: "University Prep",
  level: "A1",
  targetLevel: "B2",
  targetDate: "Sep 2026",
  domain: "Engineering",
  streakDays: 3,
  totalXP: 890,
  joinedDays: 42,
  sessionsTotal: 31,
  avgAccuracy: 54,
  learningVelocity: 1.2,
  predictedPlateau: "Genitive Case (B1 level)",
};

const SKILL_GRAPH = [
  { skill: "Cyrillic Reading", confidence: 0.88, status: "mastered", trend: "stable" },
  { skill: "Nominative Case", confidence: 0.72, status: "review", trend: "up" },
  { skill: "Accusative Case", confidence: 0.45, status: "learning", trend: "up" },
  { skill: "Prepositional Case", confidence: 0.32, status: "learning", trend: "flat" },
  { skill: "Genitive Singular", confidence: 0.18, status: "new", trend: "flat" },
  { skill: "Basic Vocabulary", confidence: 0.65, status: "review", trend: "up" },
  { skill: "Numbers 1-100", confidence: 0.58, status: "learning", trend: "up" },
  { skill: "Verb Conjugation (1st)", confidence: 0.38, status: "learning", trend: "down" },
  { skill: "Soft Consonants", confidence: 0.25, status: "learning", trend: "down" },
  { skill: "Greetings", confidence: 0.91, status: "mastered", trend: "stable" },
];

const ERROR_HISTORY = [
  { date: "Mar 17", skill: "Accusative Case", error: "буханка instead of буханку", type: "Transfer", hint: "English doesn't mark object case" },
  { date: "Mar 16", skill: "Verb Conjugation", error: "говорить instead of говорю", type: "Transfer", hint: "Used infinitive where conjugated form needed" },
  { date: "Mar 16", skill: "Soft Consonants", error: "тэ instead of те", type: "Transfer", hint: "English has no soft/hard consonant distinction" },
  { date: "Mar 15", skill: "Genitive Singular", error: "книга instead of книги", type: "Transfer", hint: "No case marking after нет" },
  { date: "Mar 14", skill: "Accusative Case", error: "книга instead of книгу", type: "Transfer", hint: "Repeated nominative-for-accusative error" },
];

const INTERVENTIONS = [
  "Schedule a focused case system review session (15 min on Acc/Gen contrast)",
  "Increase exposure to case-marked nouns in natural dialogue contexts",
  "Consider pairing with Clara S. for peer practice (strong in grammar)",
];

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    mastered: "bg-green-100 text-green-700",
    review: "bg-blue-100 text-blue-700",
    learning: "bg-yellow-100 text-yellow-700",
    new: "bg-gray-100 text-gray-600",
    fossilized: "bg-red-100 text-red-700",
  };
  return colors[status] || colors.new;
}

export default function StudentDetailPage() {
  return (
    <div className="max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard/cohorts" className="hover:text-[var(--color-primary)]">Cohorts</Link>
        <span>/</span>
        <Link href="/dashboard/cohorts/c1" className="hover:text-[var(--color-primary)]">Russian 101</Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">{STUDENT.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-xl font-bold">
            ХЛ
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-primary)]">{STUDENT.name}</h1>
            <p className="text-[var(--color-text-muted)]">
              {STUDENT.segment} · {STUDENT.domain} · Target: {STUDENT.targetLevel} by {STUDENT.targetDate}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="bg-[var(--color-primary)] text-white font-medium px-4 py-2 rounded-lg text-sm">
            Create Assignment
          </button>
          <button className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm">
            Export Report
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {[
          { label: "Current", value: STUDENT.level },
          { label: "Streak", value: `${STUDENT.streakDays}d` },
          { label: "Sessions", value: STUDENT.sessionsTotal },
          { label: "Accuracy", value: `${STUDENT.avgAccuracy}%` },
          { label: "Velocity", value: `${STUDENT.learningVelocity}x` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
            <p className="text-xl font-bold text-[var(--color-primary)] mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Predicted Plateau Warning */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <p className="font-bold text-orange-800">Predicted Plateau</p>
          <p className="text-sm text-orange-700">
            Based on current trajectory, this student will likely stall at:{" "}
            <strong>{STUDENT.predictedPlateau}</strong>. Transfer errors on case
            system are persistent and increasing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Knowledge Graph */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-4">Knowledge Graph</h2>
          <div className="space-y-3">
            {SKILL_GRAPH.map((skill) => (
              <div key={skill.skill} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{skill.skill}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(skill.status)}`}>
                        {skill.status}
                      </span>
                      <span className={`text-xs ${skill.trend === "up" ? "text-green-500" : skill.trend === "down" ? "text-red-500" : "text-gray-400"}`}>
                        {skill.trend === "up" ? "↑" : skill.trend === "down" ? "↓" : "→"}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${skill.confidence * 100}%`,
                        backgroundColor:
                          skill.confidence >= 0.8 ? "#22c55e" :
                          skill.confidence >= 0.6 ? "#86efac" :
                          skill.confidence >= 0.4 ? "#eab308" :
                          skill.confidence >= 0.25 ? "#f97316" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error History */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-4">Recent Errors</h2>
          <div className="space-y-3">
            {ERROR_HISTORY.map((err, i) => (
              <div key={i} className="border-b border-gray-100 pb-3 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{err.skill}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                      {err.type}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{err.date}</span>
                  </div>
                </div>
                <p className="text-sm text-red-600 mt-1 font-mono">{err.error}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{err.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Intervention Suggestions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold mb-4">Suggested Interventions</h2>
        <div className="space-y-3">
          {INTERVENTIONS.map((intervention, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="text-blue-500 font-bold">{i + 1}.</span>
              <p className="text-sm text-blue-900">{intervention}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
