"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type LearnerStats, type LearnerSkillState, type SessionHistory, type LearnerAssignment } from "@/lib/api";
import { auth } from "@/lib/auth";
import { subscribeEvents } from "@/lib/live";
import { Card, StatCard, SectionHeading, Chip, buttonClasses } from "@/components/ui";
import { useToasts, ToastStack } from "@/components/Toasts";

// Friendly labels so the segment chip never shows a raw key like "uni_prep".
const SEGMENT_LABELS: Record<string, string> = {
  kid: "Kid", teen: "Teen", uni_prep: "University Prep",
  migrant: "Daily Life", daily_life: "Daily Life", senior: "Senior", core: "General",
};

const FALLBACK_STATS: LearnerStats = {
  streakDays: 0, longestStreak: 0, totalXp: 0, level: 1,
  totalSessions: 0, skillsMastered: 0, skillsLearning: 0,
  totalSkills: 0, currentLevel: "A1", learnerId: "",
};

export default function DashboardHome() {
  const [stats, setStats] = useState<LearnerStats>(FALLBACK_STATS);
  const [weakSkills, setWeakSkills] = useState<LearnerSkillState[]>([]);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  // The level the learner is actually working at, kept in sync by the Path page.
  // Read after mount (avoids hydration mismatch) and preferred over the server's
  // ML-derived level so Home never disagrees with Learn.
  const [workingLevel, setWorkingLevel] = useState("");
  const [segment, setSegment] = useState("");
  const { toasts, push: pushToast, dismiss } = useToasts();
  const knownAssignments = useRef<Set<string>>(new Set());
  // Only toast for assignments that appear AFTER we have a baseline — never
  // for the initial page load (or a learner with zero assignments yet).
  const assignmentsPrimed = useRef(false);

  useEffect(() => {
    setWorkingLevel(auth.getWorkingLevel() || "");
    setSegment(auth.getSegment() || "");
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [s, ws, sh, asg] = await Promise.allSettled([
          api.getStats(),
          api.getWeakSkills(),
          api.getSessionHistory(),
          api.getMyAssignments(),
        ]);
        // Defensive: a fresh learner can get a JSON `null` body from these
        // endpoints; a naive .slice on it throws and (because this whole block is
        // in one try) silently killed every setState after it.
        if (s.status === "fulfilled" && s.value) setStats(s.value);
        if (ws.status === "fulfilled" && Array.isArray(ws.value)) setWeakSkills(ws.value.slice(0, 5));
        if (sh.status === "fulfilled" && Array.isArray(sh.value)) setSessions(sh.value.slice(0, 5));
        if (asg.status === "fulfilled" && Array.isArray(asg.value)) {
          setAssignments(asg.value);
          knownAssignments.current = new Set(asg.value.map((a) => a.id));
          assignmentsPrimed.current = true;
        }
      } catch {
        // API unavailable — stay on fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Live inbox: the server pushes an SSE poke the instant the teacher assigns
  // something; a 15s poll stays as the fallback (dropped stream, proxy hiccup).
  // Both paths run the SAME diff-based refresh, so the toast fires exactly once.
  useEffect(() => {
    const refresh = async () => {
      try {
        const fresh = await api.getMyAssignments();
        if (!Array.isArray(fresh)) return;
        if (assignmentsPrimed.current) {
          for (const a of fresh) {
            if (!knownAssignments.current.has(a.id)) {
              pushToast(`📚 New assignment from your teacher: «${a.title}»`);
            }
          }
        }
        knownAssignments.current = new Set(fresh.map((a) => a.id));
        assignmentsPrimed.current = true;
        setAssignments(fresh);
      } catch {
        /* transient network blip — the next tick retries */
      }
    };
    const iv = setInterval(refresh, 15000);
    const unsubscribe = subscribeEvents((e) => {
      if (e.type === "assignment_created") refresh();
    });
    return () => {
      clearInterval(iv);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = typeof window !== "undefined" ? localStorage.getItem("display_name") || "Learner" : "Learner";
  // Curriculum-derived level wins; fall back to the server stat, then A1.
  const level = workingLevel || stats.currentLevel || "A1";

  const statCards = [
    { label: "Current Level", value: level, sub: `${stats.skillsMastered + stats.skillsLearning} skills tracked` },
    { label: "Total XP", value: stats.totalXp.toLocaleString(), sub: `${stats.totalSessions} sessions` },
    { label: "Skills", value: `${stats.skillsMastered} mastered`, sub: `${stats.skillsLearning} learning · ${stats.totalSkills} total` },
    { label: "Streak", value: `${stats.streakDays} days`, sub: `Best: ${stats.longestStreak} days` },
  ];

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)] display">
            <span className="ru-text">Привет</span>, {displayName}!
          </h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            {stats.streakDays > 0
              ? `You're on a ${stats.streakDays}-day streak. Keep going!`
              : "Start practicing to build your streak!"}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Chip tone="brand">{SEGMENT_LABELS[segment] || segment || "learner"}</Chip>
            <Chip tone="gold">Level {level}</Chip>
            <span className="text-xs text-[var(--color-text-muted)]">Adaptive · Prerequisite-gated</span>
          </div>
        </div>
        <Link href="/dashboard/path" className={buttonClasses("primary", "lg")}>
          Continue Your Path
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} loading={loading} />
        ))}
      </div>

      {/* Assignments from the teacher — shown only when the learner has any. */}
      {assignments.length > 0 && (
        <Card className="mb-8">
          <SectionHeading
            right={
              <Link href="/dashboard/learn" className="text-sm text-[var(--color-primary)] font-medium hover:underline">
                Start practice
              </Link>
            }
          >
            Assignments from your teacher
          </SectionHeading>
          <div className="space-y-2">
            {assignments.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] last:border-0 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    {a.cohortName} · min {a.minExercises} exercises
                    {a.targetSkills.length > 0 ? ` · ${a.targetSkills.length} skill${a.targetSkills.length === 1 ? "" : "s"}` : ""}
                    {/* Practice assignments complete through Learn — show live progress. */}
                    {a.contentCount === 0 && !a.completedAt
                      ? ` · ${Math.min(a.practiceDone, a.minExercises)}/${a.minExercises} done`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.completedAt ? (
                    <span
                      className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5"
                      title={`Completed ${new Date(a.completedAt).toLocaleString()}`}
                    >
                      ✓ Done
                    </span>
                  ) : (
                    <Chip tone={a.deadline && new Date(a.deadline) < new Date(Date.now() + 3 * 86400e3) ? "gold" : "neutral"}>
                      {a.deadline ? `Due ${new Date(a.deadline).toLocaleDateString()}` : "No deadline"}
                    </Chip>
                  )}
                  {/* Playable materials attached → the task player; otherwise Learn. */}
                  {a.contentCount > 0 ? (
                    <Link
                      href={`/dashboard/tasks/${a.id}`}
                      className={buttonClasses(a.completedAt ? "secondary" : "primary", "sm")}
                    >
                      {a.completedAt ? "Results" : "Start →"}
                    </Link>
                  ) : (
                    <Link href="/dashboard/learn" className={buttonClasses("secondary", "sm")}>
                      Practice
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Weak Skills */}
        <Card className="col-span-2">
          <SectionHeading
            right={
              <Link href="/dashboard/path" className="text-sm text-[var(--color-primary)] font-medium hover:underline">
                Practice now
              </Link>
            }
          >
            Skills Needing Attention
          </SectionHeading>
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 bg-[var(--color-surface-2)] rounded animate-pulse" />
              ))}
            </div>
          ) : weakSkills.length === 0 ? (
            <p className="text-[var(--color-text-muted)] text-sm">No weak skills yet. Start a session to begin tracking!</p>
          ) : (
            <div className="space-y-4">
              {weakSkills.map((skill) => (
                <div key={skill.skillId} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{skill.skillId.split(".").pop()?.replace(/_/g, " ")}</span>
                      <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{Math.round(skill.confidence * 100)}%</span>
                    </div>
                    <div className="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(skill.confidence * 100, 3)}%`,
                          backgroundColor: skill.confidence < 0.4 ? "var(--color-danger)" : "var(--color-warning)",
                        }}
                      />
                    </div>
                  </div>
                  <Chip tone="neutral">{skill.status}</Chip>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Sessions */}
        <Card>
          <SectionHeading>Recent Sessions</SectionHeading>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 bg-[var(--color-surface-2)] rounded animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-[var(--color-text-muted)] text-sm">No sessions yet. Start your first lesson!</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                  <div>
                    <p className="text-sm font-medium">{new Date(session.startedAt).toLocaleDateString()}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {Math.round(session.duration / 60)}m · {Math.round(session.accuracyRate * 100)}% accuracy
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--color-primary)] tabular-nums">+{session.totalXp} XP</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{session.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
