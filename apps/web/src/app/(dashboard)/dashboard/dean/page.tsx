"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type DeanOverview, type TeacherPerf, type TeacherExamPerf, type ActivityEvent, type ActivityCount } from "@/lib/api";
import { StatCard, Panel, PageHeader, Denied, Meter, fmtNum, fmtPct } from "@/components/dashboard/ui";
import { T } from "@/lib/ru";

type SortKey = "students" | "activeStudents" | "started" | "avgConfidence" | "cohorts" | "assignments";

const COLS: Array<{ key: SortKey; label: string }> = [
  { key: "cohorts", label: T.cohorts },
  { key: "students", label: T.students },
  { key: "started", label: T.started },
  { key: "activeStudents", label: T.active7d },
  { key: "assignments", label: T.assignmentsTitle },
];

export default function DeanPage() {
  const [data, setData] = useState<DeanOverview | null>(null);
  const [examPerf, setExamPerf] = useState<Record<string, TeacherExamPerf>>({});
  const [activityCounts, setActivityCounts] = useState<Record<string, ActivityCount>>({});
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [sort, setSort] = useState<SortKey>("students");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getDeanOverview(),
      api.getInstitutionExamPerformance().catch(() => [] as TeacherExamPerf[]),
      api.getInstitutionActivityCounts().catch(() => [] as ActivityCount[]),
      api.getInstitutionActivity().catch(() => [] as ActivityEvent[]),
    ])
      .then(([d, ep, ac, af]) => {
        if (cancelled) return;
        setData(d);
        setExamPerf(Object.fromEntries((ep as TeacherExamPerf[]).map((p) => [p.teacherId, p])));
        setActivityCounts(Object.fromEntries((ac as ActivityCount[]).map((c) => [c.actorId, c])));
        setFeed(af as ActivityEvent[]);
      })
      .catch((e: Error) => {
        if (e.message === "insufficient_permissions") setDenied(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const ACTION_LABEL: Record<string, string> = {
    assignment_created: "создал(а) задание",
    exam_assigned: "назначил(а) экзамен",
    cohort_created: "создал(а) группу",
    content_created: "создал(а) материал",
    staff_invited: "пригласил(а)",
    student_enrolled: "зачислил(а) студента",
  };

  const rows = useMemo(
    () => [...(data?.teacherRows ?? [])].sort((a, b) => (b[sort] as number) - (a[sort] as number)),
    [data, sort]
  );

  if (denied) return <Denied role="dean" />;

  const activePct = data && data.students > 0 ? data.activeStudents / data.students : 0;
  const started = data?.startedStudents ?? 0;
  const shortName = (email: string) => email.split("@")[0];

  return (
    <div className="max-w-6xl">
      <PageHeader title={T.deanTitle} subtitle={T.deanSubtitle} />

      {/* Honest stats contract: avg mastery is over STARTED students only, so the
          denominator is always on screen and an idle institution reads as "—". */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label={T.teachers} value={fmtNum(data?.teachers ?? 0)} sub={data ? `${fmtNum(data.cohorts)} ${T.cohortsPanel.toLowerCase()}` : undefined} loading={loading} />
        <StatCard label={T.students} value={fmtNum(data?.students ?? 0)} loading={loading} />
        <StatCard label={T.active7d} value={fmtNum(data?.activeStudents ?? 0)} sub={data ? `${fmtPct(activePct)} ${T.ofStudents}` : undefined} loading={loading} />
        <StatCard
          label={T.started}
          value={data ? `${fmtNum(started)}/${fmtNum(data.students)}` : "—"}
          tone={data && data.students > 0 && started === 0 ? "warn" : "default"}
          loading={loading}
        />
        <StatCard
          label={T.avgMastery}
          value={started > 0 ? fmtPct(data?.avgConfidence ?? 0) : "—"}
          sub={data ? (started > 0 ? T.avgMasteryNote(started) : T.noneStarted) : undefined}
          tone={data && started > 0 && data.avgConfidence < 0.4 ? "warn" : "default"}
          loading={loading}
        />
      </div>

      <Panel title={T.teacherPerformance} right={<span className="text-xs text-gray-400">{T.sortHint}</span>}>
        {rows.length === 0 && !loading ? (
          <p className="text-sm text-gray-400">{T.noTeachersYet}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">{T.teacherCol}</th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => setSort(c.key)}
                    className={`py-2 font-medium text-right cursor-pointer select-none hover:text-slate-600 ${sort === c.key ? "text-slate-700" : ""}`}
                  >
                    {c.label}{sort === c.key ? " ▾" : ""}
                  </th>
                ))}
                <th className="py-2 font-medium text-right" title="Действий за последние 30 дней (задания, экзамены, группы, материалы)">Активность</th>
                <th className="py-2 font-medium text-right" title="Средний балл студентов по назначенным экзаменам">Экзамены</th>
                <th onClick={() => setSort("avgConfidence")} className={`py-2 font-medium cursor-pointer select-none hover:text-slate-600 ${sort === "avgConfidence" ? "text-slate-700" : ""}`}>
                  {T.avgMastery}{sort === "avgConfidence" ? " ▾" : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t: TeacherPerf) => (
                <tr key={t.teacherId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="py-2">
                    <Link href={`/dashboard/dean/teachers/${t.teacherId}`} className="text-indigo-600 hover:underline" title={t.name}>
                      {shortName(t.name)}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{fmtNum(t.cohorts)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtNum(t.students)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtNum(t.started)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtNum(t.activeStudents)}</td>
                  <td className="py-2 text-right tabular-nums">{fmtNum(t.assignments)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {(() => {
                      const c = activityCounts[t.teacherId];
                      const n = c?.count ?? 0;
                      return (
                        <span
                          className={n === 0 ? "text-amber-600" : "text-slate-700 font-medium"}
                          title={c ? `последнее: ${new Date(c.lastAt).toLocaleString("ru-RU")}` : "нет активности за 30 дней"}
                        >
                          {n === 0 ? "пассив" : fmtNum(n)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {(() => {
                      const p = examPerf[t.teacherId];
                      return p && p.results > 0 ? (
                        <span title={`${p.results} результ. · ${Math.round(p.passRate * 100)}% сдали · ${p.exams} экз.`} className={p.avgScore < 0.5 ? "text-amber-600" : "text-slate-700"}>
                          {Math.round(p.avgScore * 100)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      );
                    })()}
                  </td>
                  <td className="py-2">
                    {t.started > 0 ? <Meter value={t.avgConfidence} /> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Активность преподавателей" right={<span className="text-xs text-gray-400">кто что делает</span>} className="mt-6">
        {feed.length === 0 ? (
          <p className="text-sm text-gray-400">Пока нет активности. Действия преподавателей (задания, экзамены, группы, материалы) появятся здесь.</p>
        ) : (
          <ul className="space-y-1.5">
            {feed.map((ev) => (
              <li key={ev.id} className="flex items-baseline gap-2 text-sm">
                <span className="text-slate-700 font-medium shrink-0">{ev.actorEmail.split("@")[0]}</span>
                <span className="text-gray-500 shrink-0">{ACTION_LABEL[ev.action] || ev.action}</span>
                {ev.detail && <span className="text-gray-400 truncate">«{ev.detail}»</span>}
                <span className="ml-auto text-[11px] text-gray-300 shrink-0">
                  {new Date(ev.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
