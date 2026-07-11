"use client";

import { useEffect, useState } from "react";
import { api, type AnalyticsOverview, type RouteUsage } from "@/lib/api";
import { StatCard, HBars, Panel, AdminDenied, PageHeader, TimeSeries, fmtMs, fmtNum, routeLabel } from "./_ui";

export default function AdminOverviewPage() {
  const [days, setDays] = useState(14);
  const [ov, setOv] = useState<AnalyticsOverview | null>(null);
  const [routes, setRoutes] = useState<RouteUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getAnalyticsOverview(days), api.getAnalyticsRoutes(days)])
      .then(([o, r]) => {
        if (cancelled) return;
        setOv(o);
        setRoutes(r);
        setError("");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.message === "insufficient_permissions") setDenied(true);
        else setError("Couldn't load analytics. Is the API running?");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (denied) return <AdminDenied />;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Platform Overview"
        subtitle={`Usage over the last ${days} days · adult learners only (minors excluded).`}
        days={days}
        onDays={setDays}
      />

      {error && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">{error}</div>}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Active learners" value={fmtNum(ov?.totalUsers ?? 0)} sub={`unique · ${days}d`} loading={loading} />
        <StatCard label="Sessions" value={fmtNum(ov?.totalSessions ?? 0)} loading={loading} />
        <StatCard label="Events" value={fmtNum(ov?.totalEvents ?? 0)} loading={loading} />
        <StatCard label="Avg session" value={fmtMs(ov?.avgSessionMs ?? 0)} sub="first → last event" loading={loading} />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2">
          <Panel title="Activity">
            {loading ? (
              <div className="h-48 bg-gray-50 rounded animate-pulse" />
            ) : (
              <TimeSeries points={ov?.daily ?? []} />
            )}
          </Panel>
        </div>
        <Panel title="Event mix">
          {loading ? (
            <div className="h-40 bg-gray-50 rounded animate-pulse" />
          ) : (
            <HBars rows={(ov?.eventsByType ?? []).map((t) => ({ label: t.type, value: t.count }))} color="#0ea5e9" empty="No events yet." />
          )}
        </Panel>
      </div>

      <Panel title="Feature usage by route" right={<span className="text-xs text-gray-400">most used first · least-touched at the bottom</span>}>
        {routes.length === 0 && !loading ? (
          <p className="text-sm text-gray-400">No route views yet — browse the app signed in as an adult learner to populate this.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Route</th>
                <th className="py-2 font-medium text-right">Views</th>
                <th className="py-2 font-medium text-right">Unique learners</th>
                <th className="py-2 font-medium text-right">Avg time on page</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r, i) => {
                const leastUsed = routes.length > 3 && i === routes.length - 1;
                return (
                  <tr key={r.route} className="border-b border-gray-50 last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{routeLabel(r.route)}</span>
                        {leastUsed && <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">least used</span>}
                      </div>
                      <span className="font-mono text-[11px] text-gray-400">{r.route}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtNum(r.views)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtNum(r.users)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{fmtMs(r.avgTimeMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
