"use client";

import { useState } from "react";

const WEEKLY_LEADERBOARD = [
  { rank: 1, name: "Clara S.", xp: 1420, streak: 28, level: "A2", badge: "🔥", change: 0 },
  { rank: 2, name: "Elena R.", xp: 1285, streak: 15, level: "A2", badge: "⭐", change: 1 },
  { rank: 3, name: "Anna K.", xp: 1190, streak: 22, level: "A2", badge: "💪", change: -1 },
  { rank: 4, name: "You", xp: 1142, streak: 12, level: "A1", badge: null, change: 2, isUser: true },
  { rank: 5, name: "Greta W.", xp: 1050, streak: 9, level: "A2", badge: null, change: -1 },
  { rank: 6, name: "Boris M.", xp: 980, streak: 7, level: "A1", badge: null, change: 0 },
  { rank: 7, name: "Felix T.", xp: 890, streak: 5, level: "A1", badge: null, change: -2 },
  { rank: 8, name: "Hugo L.", xp: 720, streak: 3, level: "A1", badge: null, change: 1 },
  { rank: 9, name: "Dmitri V.", xp: 540, streak: 1, level: "A1", badge: null, change: -1 },
  { rank: 10, name: "Ivan P.", xp: 320, streak: 0, level: "A1", badge: null, change: 0 },
];

const TEAM_CHALLENGES = [
  {
    id: "tc1",
    name: "Translation Race",
    desc: "Translate 50 sentences faster than Team B",
    teamA: { name: "Team Москва", progress: 38, members: 4 },
    teamB: { name: "Team Питер", progress: 32, members: 4 },
    deadline: "2 days left",
  },
  {
    id: "tc2",
    name: "Case Master Challenge",
    desc: "First team to get 100 case exercises correct wins",
    teamA: { name: "Team Москва", progress: 72, members: 4 },
    teamB: { name: "Team Питер", progress: 65, members: 4 },
    deadline: "5 days left",
  },
];

const ACHIEVEMENTS = [
  { icon: "📝", name: "First Steps", desc: "Complete your first lesson", earned: true },
  { icon: "🔥", name: "On Fire", desc: "7-day streak", earned: true },
  { icon: "🗣️", name: "Linguist", desc: "Learn 100 words", earned: true },
  { icon: "🏆", name: "Case Master", desc: "Master all 6 cases", earned: false },
  { icon: "💎", name: "Polyglot", desc: "50-day streak", earned: false },
  { icon: "🎯", name: "Sharpshooter", desc: "95% accuracy in a session", earned: false },
];

type Tab = "weekly" | "challenges" | "achievements";

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("weekly");

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-2">
        Leaderboard
      </h1>
      <p className="text-[var(--color-text-muted)] mb-6">
        Compete with friends. Rankings reset weekly.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-8 w-fit">
        {([
          { key: "weekly", label: "Weekly Ranking" },
          { key: "challenges", label: "Team Challenges" },
          { key: "achievements", label: "Achievements" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white shadow-sm text-[var(--color-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Weekly */}
      {tab === "weekly" && (
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Top 3 podium */}
          <div className="flex items-end justify-center gap-4 pt-8 pb-6 border-b border-gray-100">
            {[WEEKLY_LEADERBOARD[1], WEEKLY_LEADERBOARD[0], WEEKLY_LEADERBOARD[2]].map(
              (user, i) => {
                const heights = ["h-20", "h-28", "h-16"];
                const medals = ["🥈", "🥇", "🥉"];
                return (
                  <div key={user.name} className="flex flex-col items-center">
                    <span className="text-2xl mb-1">{medals[i]}</span>
                    <p className="text-sm font-bold">{user.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{user.xp} XP</p>
                    <div
                      className={`${heights[i]} w-20 bg-[var(--color-primary)] rounded-t-lg mt-2 flex items-center justify-center`}
                    >
                      <span className="text-white font-bold">{user.rank}</span>
                    </div>
                  </div>
                );
              }
            )}
          </div>

          {/* Full list */}
          <div className="divide-y divide-gray-100">
            {WEEKLY_LEADERBOARD.map((user) => (
              <div
                key={user.name}
                className={`flex items-center px-6 py-4 ${
                  (user as { isUser?: boolean }).isUser ? "bg-blue-50" : ""
                }`}
              >
                <span className="w-8 text-lg font-bold text-[var(--color-text-muted)]">
                  {user.rank}
                </span>
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-sm font-bold mr-3">
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-medium">
                    {user.name}
                    {user.badge && <span className="ml-2">{user.badge}</span>}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {user.level} · {user.streak} day streak
                  </p>
                </div>
                <span className="text-sm font-bold text-[var(--color-primary)] mr-4">
                  {user.xp.toLocaleString()} XP
                </span>
                <span
                  className={`text-xs font-medium ${
                    user.change > 0
                      ? "text-green-500"
                      : user.change < 0
                        ? "text-red-500"
                        : "text-gray-400"
                  }`}
                >
                  {user.change > 0 ? `↑${user.change}` : user.change < 0 ? `↓${Math.abs(user.change)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Challenges */}
      {tab === "challenges" && (
        <div className="space-y-4">
          {TEAM_CHALLENGES.map((ch) => (
            <div
              key={ch.id}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold">{ch.name}</h3>
                <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full font-medium">
                  {ch.deadline}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">
                {ch.desc}
              </p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{ch.teamA.name}</span>
                    <span className="font-bold text-[var(--color-primary)]">
                      {ch.teamA.progress}%
                    </span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-primary)] rounded-full"
                      style={{ width: `${ch.teamA.progress}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{ch.teamB.name}</span>
                    <span className="font-bold text-[var(--color-accent)]">
                      {ch.teamB.progress}%
                    </span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-accent)] rounded-full"
                      style={{ width: `${ch.teamB.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Achievements */}
      {tab === "achievements" && (
        <div className="grid grid-cols-3 gap-4">
          {ACHIEVEMENTS.map((a) => (
            <div
              key={a.name}
              className={`bg-white rounded-xl border p-6 text-center ${
                a.earned
                  ? "border-[var(--color-gold)] shadow-sm"
                  : "border-gray-200 opacity-50"
              }`}
            >
              <div className="text-4xl mb-3">{a.icon}</div>
              <h3 className="font-bold mb-1">{a.name}</h3>
              <p className="text-xs text-[var(--color-text-muted)]">{a.desc}</p>
              {a.earned && (
                <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  Earned
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
