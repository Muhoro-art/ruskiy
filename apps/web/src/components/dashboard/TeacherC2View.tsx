"use client";

import Link from "next/link";
import { StatCard, Panel, Meter, fmtNum, fmtPct, fmtDate } from "./ui";
import { T, riskLabel } from "@/lib/ru";
import type { TeacherC2, Assignment } from "@/lib/api";

// Renders one teacher's command center (KPIs + cohorts + at-risk students +
// recent assignments). Shared by the teacher's own page and the dean's
// per-teacher drill-down. STAFF surface → Russian copy (see lib/ru.ts).
//
// Honest statistics: "avg mastery" is EARNED mastery averaged over students who
// actually started (the card says over how many), and the started/total split is
// always visible so an average can never hide an empty class.
export function TeacherC2View({
  data,
  loading,
  assignments,
}: {
  data: TeacherC2 | null;
  loading: boolean;
  assignments?: Assignment[];
}) {
  const cohorts = data?.cohortRows ?? [];
  const risk = data?.riskStudents ?? [];
  const activePct = data && data.students > 0 ? data.activeStudents / data.students : 0;
  const started = data?.startedStudents ?? 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatCard label={T.students} value={fmtNum(data?.students ?? 0)} loading={loading} />
        <StatCard
          label={T.active7d}
          value={fmtNum(data?.activeStudents ?? 0)}
          sub={data ? `${fmtPct(activePct)} ${T.ofStudents}` : undefined}
          loading={loading}
        />
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
        <StatCard
          label={T.atRisk}
          value={fmtNum(data?.atRisk ?? 0)}
          tone={data && data.atRisk > 0 ? "warn" : "default"}
          sub={data ? `${fmtNum(data.cohorts)} ${T.cohortsPanel.toLowerCase()} · ${T.assignmentsCount(data.assignments)}` : undefined}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* min-w-0 lets each column shrink below its content width — without it
            the cohort table (join-code chips, numbers) spills out of the grid. */}
        <div className="space-y-6 min-w-0">
          <Panel title={T.cohortsPanel}>
            {cohorts.length === 0 && !loading ? (
              <p className="text-sm text-gray-400">{T.noCohorts}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">{T.cohortCol}</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{T.students}</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{T.startedCol}</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{T.activeCol}</th>
                    <th className="py-2 pl-3 font-medium whitespace-nowrap">{T.masteryCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/cohorts/${c.id}`} className="text-indigo-600 hover:underline">
                          {c.name}
                        </Link>
                        {c.joinCode ? (
                          <span className="ml-2 font-mono text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5" title={T.joinCode}>
                            {c.joinCode}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmtNum(c.students)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmtNum(c.started)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmtNum(c.active)}</td>
                      <td className="py-2 pl-3 min-w-[110px]">
                        {c.started > 0 ? <Meter value={c.avgConfidence} /> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Panel>

          {assignments && (
            <Panel
              title={T.assignmentsPanel}
              right={
                <Link href="/dashboard/assignments" className="text-xs text-indigo-600 hover:underline">
                  {T.viewAll}
                </Link>
              }
            >
              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400">{T.noAssignments}</p>
              ) : (
                <div className="space-y-2">
                  {assignments.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-slate-700 truncate">{a.title}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {a.cohortName || "—"} · {a.targetCount > 0 ? T.nStudents(a.targetCount) : T.wholeCohort}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                        {a.deadline ? `${T.due} ${new Date(a.deadline).toLocaleDateString("ru-RU")}` : T.noDeadline}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="min-w-0">
        <Panel title={T.attentionPanel} right={<span className="text-xs text-gray-400">{T.worstFirst}</span>}>
          {risk.length === 0 && !loading ? (
            <p className="text-sm text-gray-400">{T.allOnTrack}</p>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-y-auto -mx-2">
              {/* The list is capped server-side (top-25 worst); the KPI counts ALL
                  flagged students, so surface the truncated tail explicitly. */}
              {risk.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/students/${s.id}`}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {s.cohort} · {T.lastActive} {s.lastActive ? fmtDate(s.lastActive) : T.never}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        s.reason === "not_started" ? "text-amber-700 bg-amber-50" : "text-red-600 bg-red-50"
                      }`}
                    >
                      {riskLabel(s.reason)}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500 w-9 text-right">
                      {s.reason === "not_started" ? "—" : fmtPct(s.avgConfidence)}
                    </span>
                  </div>
                </Link>
              ))}
              {data && data.atRisk > risk.length && (
                <p className="px-2 pt-2 text-xs text-gray-400">{T.andNMore(data.atRisk - risk.length)}</p>
              )}
            </div>
          )}
        </Panel>
        </div>
      </div>
    </>
  );
}
