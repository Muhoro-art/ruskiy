"use client";

import { useEffect, useState } from "react";
import { api, type AnalyticsEngagement } from "@/lib/api";
import { Panel, AdminDenied, HBars, StatCard, StackBar, PageHeader, fmtMs, fmtNum, routeLabel } from "../_ui";

export default function EngagementPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<AnalyticsEngagement | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getAnalyticsEngagement(days)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => {
        if (e.message === "insufficient_permissions") setDenied(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (denied) return <AdminDenied />;

  const funnel = data?.taskFunnel ?? [];
  const exits = data?.exitRoutes ?? [];
  const totalStarts = funnel.reduce((s, f) => s + f.starts, 0);
  const totalCompletes = funnel.reduce((s, f) => s + f.completes, 0);
  const completionRate = totalStarts ? Math.round((totalCompletes / totalStarts) * 100) : 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Engagement & Drop-off"
        subtitle={`Where learners finish, abandon a task, and leave — over the last ${days} days.`}
        days={days}
        onDays={setDays}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Avg session" value={fmtMs(data?.avgSessionMs ?? 0)} sub="first → last event" loading={loading} />
        <StatCard label="Tasks started" value={fmtNum(totalStarts)} sub={`${fmtNum(totalCompletes)} completed`} loading={loading} />
        <StatCard label="Completion rate" value={`${completionRate}%`} sub="completed ÷ started" loading={loading} />
      </div>

      <div className="mb-6">
        <Panel
          title="Task completion vs. abandonment"
          right={
            <span className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-600" />completed</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600" />abandoned</span>
            </span>
          }
        >
          {funnel.length === 0 && !loading ? (
            <p className="text-sm text-gray-400">No task activity yet — complete or leave a lesson (signed in as an adult) to populate this.</p>
          ) : (
            <div className="space-y-3">
              {funnel.map((f) => {
                const rate = f.starts ? f.abandons / f.starts : 0;
                const hot = rate >= 0.4 && f.starts >= 3;
                return (
                  <div key={f.task}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-700 truncate max-w-md" title={f.task}>{f.task}</span>
                      <span className="text-gray-400 tabular-nums shrink-0 ml-3">
                        {fmtNum(f.starts)} started ·{" "}
                        <span className={hot ? "text-red-600 font-medium" : "text-slate-500"}>{Math.round(rate * 100)}% abandoned</span>
                      </span>
                    </div>
                    <StackBar a={f.completes} b={f.abandons} max={f.starts} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Where sessions end (exit points)" right={<span className="text-xs text-gray-400">last screen before leaving</span>}>
        {loading ? (
          <div className="h-24 bg-gray-50 rounded animate-pulse" />
        ) : (
          <HBars rows={exits.slice(0, 12).map((e) => ({ label: routeLabel(e.route), value: e.count }))} color="#f97316" empty="No sessions recorded yet." />
        )}
      </Panel>
    </div>
  );
}
