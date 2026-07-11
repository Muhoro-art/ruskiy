"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type StudentReport } from "@/lib/api";
import { T } from "@/lib/ru";

function confColor(c: number): string {
  if (c >= 0.8) return "#22c55e";
  if (c >= 0.6) return "#86efac";
  if (c >= 0.4) return "#eab308";
  if (c >= 0.25) return "#f97316";
  return "#ef4444";
}

export default function StudentReportPage() {
  const params = useParams();
  const id = String(params.id);
  const [rep, setRep] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setRep(await api.getStudentReport(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="text-[var(--color-text-muted)] py-12 text-center">{T.loadingReport}</div>;
  if (error || !rep)
    return (
      <div className="max-w-2xl">
        <Link href="/dashboard/cohorts" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">{T.back}</Link>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center mt-4">
          <p className="font-semibold text-[var(--color-primary)]">
            {/permission|forbidden|cohorts/i.test(error) ? T.notYourStudent : T.reportLoadFail}
          </p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{error}</p>
        </div>
      </div>
    );

  // «Уроков пройдено» is the earned-Path count that explains a non-zero headline
  // for a Path-only learner (whose Sessions/XP are adaptive-only and read 0).
  const stats = [
    { label: T.levelLabel, value: rep.level || "A1" },
    { label: T.avgConfidenceLabel, value: `${Math.round(rep.avgConfidence * 100)}%` },
    { label: T.lessonsWorked, value: String(rep.curriculumLessons) },
    { label: T.skillsAttempted, value: String(rep.skillsTracked) },
    { label: T.mastered, value: String(rep.masteredCount) },
    { label: T.sessions, value: String(rep.totalSessions) },
    { label: T.totalXp, value: rep.totalXp.toLocaleString() },
  ];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard/cohorts" className="hover:text-[var(--color-primary)]">{T.cohortsTitle}</Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">{T.reportBreadcrumb}</span>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-xl font-bold">
          {rep.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">{rep.name}</h1>
          <p className="text-[var(--color-text-muted)]">{T.levelLabel} {rep.level || "A1"}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-7 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
            <p className="text-xl font-bold text-[var(--color-primary)] mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold mb-1">{T.weakAreasTitle}</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">{T.weakAreasSub}</p>
        {rep.weakSkills.length === 0 ? (
          <p className="text-[var(--color-text-muted)] text-sm">{T.noAttemptedSkills}</p>
        ) : (
          <div className="space-y-4">
            {rep.weakSkills.map((w) => (
              <div key={w.name} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{w.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{Math.round(w.confidence * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(w.confidence * 100, 3)}%`, backgroundColor: confColor(w.confidence) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
