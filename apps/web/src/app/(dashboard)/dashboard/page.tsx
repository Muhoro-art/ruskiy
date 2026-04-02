"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type LearnerStats, type LearnerSkillState, type SessionHistory } from "@/lib/api";

const FALLBACK_STATS: LearnerStats = {
  streakDays: 0, longestStreak: 0, totalXp: 0, level: 1,
  totalSessions: 0, skillsMastered: 0, skillsLearning: 0,
  totalSkills: 0, currentLevel: "A1", learnerId: "",
};

export default function DashboardHome() {
  const [stats, setStats] = useState<LearnerStats>(FALLBACK_STATS);
  const [weakSkills, setWeakSkills] = useState<LearnerSkillState[]>([]);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, ws, sh] = await Promise.allSettled([
          api.getStats(),
          api.getWeakSkills(),
          api.getSessionHistory(),
        ]);
        if (s.status === "fulfilled") setStats(s.value);
        if (ws.status === "fulfilled") setWeakSkills(ws.value.slice(0, 5));
        if (sh.status === "fulfilled") setSessions(sh.value.slice(0, 5));
      } catch {
        // API unavailable — stay on fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const displayName = typeof window !== "undefined" ? localStorage.getItem("display_name") || "Learner" : "Learner";

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">
            Привет, {displayName}!
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            {stats.streakDays > 0
              ? `You're on a ${stats.streakDays}-day streak. Keep going!`
              : "Start practicing to build your streak!"}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              {(typeof window !== "undefined" && localStorage.getItem("learner_segment")) || "learner"}
            </span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Level {stats.currentLevel || "A1"}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-400">Adaptive • Prerequisite-gated</span>
          </div>
        </div>
        <Link
          href="/dashboard/learn"
          className="bg-[var(--color-accent)] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[var(--color-accent-light)] transition-colors"
        >
          Start Today&apos;s Session
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Current Level", value: stats.currentLevel || "A1", sub: `Level ${stats.level}` },
          { label: "Total XP", value: stats.totalXp.toLocaleString(), sub: `${stats.totalSessions} sessions` },
          { label: "Skills", value: `${stats.skillsMastered} mastered`, sub: `${stats.skillsLearning} learning · ${stats.totalSkills} total` },
          { label: "Streak", value: `${stats.streakDays} days`, sub: `Best: ${stats.longestStreak} days` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl p-5 border border-gray-200"
          >
            <p className="text-sm text-[var(--color-text-muted)]">{stat.label}</p>
            <p className="text-2xl font-bold text-[var(--color-primary)] mt-1">
              {loading ? "..." : stat.value}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Weak Skills */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Skills Needing Attention</h2>
            <Link
              href="/dashboard/learn"
              className="text-sm text-[var(--color-primary)] font-medium hover:underline"
            >
              Practice now
            </Link>
          </div>
          {weakSkills.length === 0 && !loading ? (
            <p className="text-[var(--color-text-muted)] text-sm">
              No weak skills yet. Start a session to begin tracking!
            </p>
          ) : (
            <div className="space-y-4">
              {weakSkills.map((skill) => (
                <div key={skill.skillId} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{skill.skillId.split(".").pop()?.replace(/_/g, " ")}</span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {Math.round(skill.confidence * 100)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(skill.confidence * 100, 3)}%`,
                          backgroundColor:
                            skill.confidence < 0.4 ? "#dc2626" : "#f59e0b",
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-[var(--color-text-muted)] bg-gray-100 px-2 py-1 rounded">
                    {skill.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-4">Recent Sessions</h2>
          {sessions.length === 0 && !loading ? (
            <p className="text-[var(--color-text-muted)] text-sm">
              No sessions yet. Start your first lesson!
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(session.startedAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {Math.round(session.duration / 60)}m · {Math.round(session.accuracyRate * 100)}% accuracy
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--color-primary)]">
                      +{session.totalXp} XP
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {session.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
