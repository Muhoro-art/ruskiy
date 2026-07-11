"use client";

import { useEffect, useState } from "react";
import { api, type LeaderboardEntry, type LearnerStats } from "@/lib/api";
import { auth } from "@/lib/auth";
import { Card, Chip, Tabs, EmptyState } from "@/components/ui";

type Tab = "weekly" | "challenges" | "achievements";

interface Achievement {
  icon: string;
  name: string;
  desc: string;
  earned: boolean;
}

// Achievements derived from the learner's REAL stats — no fabricated progress.
// `level` is the curriculum-derived level (same one Home/Learn show), so the
// Scholar badge tracks actual progress, not the server's ML-only estimate.
function deriveAchievements(stats: LearnerStats | null, level: string): Achievement[] {
  const s = stats;
  return [
    { icon: "📝", name: "First Steps", desc: "Complete your first session", earned: !!s && s.totalSessions >= 1 },
    { icon: "🔥", name: "On Fire", desc: "Reach a 7-day streak", earned: !!s && s.longestStreak >= 7 },
    { icon: "🗣️", name: "Linguist", desc: "Master 10 skills", earned: !!s && s.skillsMastered >= 10 },
    { icon: "⭐", name: "Rising Star", desc: "Earn 1,000 XP", earned: !!s && s.totalXp >= 1000 },
    { icon: "💎", name: "Dedicated", desc: "Reach a 30-day streak", earned: !!s && s.longestStreak >= 30 },
    { icon: "🎓", name: "Scholar", desc: "Reach level B1", earned: ["B1", "B2", "C1", "C2"].includes(level) },
  ];
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("weekly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [resetsIn, setResetsIn] = useState("");
  const [stats, setStats] = useState<LearnerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const myName = typeof window !== "undefined" ? auth.getDisplayName() : null;
  const [level, setLevel] = useState("A1");

  useEffect(() => {
    setLevel(auth.getWorkingLevel() || "A1");
  }, []);

  useEffect(() => {
    async function load() {
      const [lb, st] = await Promise.allSettled([api.getLeaderboard("global"), api.getStats()]);
      if (lb.status === "fulfilled") {
        setEntries(lb.value.leaderboard || []);
        setResetsIn(lb.value.resetsIn || "");
      } else {
        setError("Couldn't load the leaderboard. Check your connection and try again.");
      }
      if (st.status === "fulfilled") setStats(st.value);
      setLoading(false);
    }
    load();
  }, []);

  const achievements = deriveAchievements(stats, level);
  const podium = entries.slice(0, 3);

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-2 display">Leaderboard</h1>
      <p className="text-[var(--color-text-muted)] mb-6">
        Compete with other learners. {resetsIn ? `Rankings reset in ${resetsIn}.` : "Rankings reset weekly."}
      </p>

      <div className="mb-8">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "weekly", label: "Ranking" },
            { value: "challenges", label: "Team Challenges" },
            { value: "achievements", label: "Achievements" },
          ]}
        />
      </div>

      {/* Weekly ranking */}
      {tab === "weekly" && (
        <Card padding="none">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-[var(--color-surface-2)] rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Couldn't load the leaderboard" body={error} />
          ) : entries.length === 0 ? (
            <EmptyState icon="🏁" title="No rankings yet" body="Complete a session to get on the board!" />
          ) : (
            <>
              {/* Top 3 podium */}
              {podium.length === 3 && (
                <div className="flex items-end justify-center gap-4 pt-8 pb-6 border-b border-[var(--color-border)]">
                  {[podium[1], podium[0], podium[2]].map((user, i) => {
                    const heights = ["h-20", "h-28", "h-16"];
                    const medals = ["🥈", "🥇", "🥉"];
                    return (
                      <div key={user.rank} className="flex flex-col items-center">
                        <span className="text-2xl mb-1">{medals[i]}</span>
                        <p className="text-sm font-bold">{user.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)] tabular-nums">{user.xp} XP</p>
                        <div className={`${heights[i]} w-20 bg-[var(--color-primary)] rounded-t-lg mt-2 flex items-center justify-center`}>
                          <span className="text-white font-bold">{user.rank}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Full list */}
              <div className="divide-y divide-[var(--color-border)]">
                {entries.map((user) => {
                  const isUser = !!myName && user.name === myName;
                  return (
                    <div key={`${user.rank}-${user.name}`} className={`flex items-center px-6 py-4 ${isUser ? "bg-[var(--color-primary-tint)]" : ""}`}>
                      <span className="w-8 text-lg font-bold text-[var(--color-text-muted)] tabular-nums">{user.rank}</span>
                      <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-sm font-bold mr-3">
                        {user.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {user.name}
                          {isUser && <Chip tone="brand" className="ml-2">You</Chip>}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {user.level} · {user.streakDays} day streak
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[var(--color-primary)] tabular-nums">{user.xp.toLocaleString()} XP</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Team Challenges — not yet backed by an API */}
      {tab === "challenges" && (
        <Card>
          <EmptyState
            icon="🤝"
            title="Team Challenges are coming soon"
            body="Cooperative cohort challenges aren't available yet. In the meantime, climb the individual ranking and unlock achievements."
          />
        </Card>
      )}

      {/* Achievements — derived from real stats */}
      {tab === "achievements" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((a) => (
            <div
              key={a.name}
              className={`bg-white rounded-[var(--radius-card)] border p-6 text-center ${
                a.earned ? "border-[var(--color-gold)] shadow-sm" : "border-[var(--color-border)] opacity-60"
              }`}
            >
              <div className="text-4xl mb-3">{a.icon}</div>
              <h3 className="font-bold mb-1">{a.name}</h3>
              <p className="text-xs text-[var(--color-text-muted)]">{a.desc}</p>
              <div className="mt-2">
                <Chip tone={a.earned ? "gold" : "neutral"}>{a.earned ? "Earned" : "Locked"}</Chip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
