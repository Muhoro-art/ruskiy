"use client";

import { useEffect, useRef, useState } from "react";
import { api, type HeatmapGrid, type RouteUsage } from "@/lib/api";
import { Panel, AdminDenied, PageHeader, fmtNum, routeLabel } from "../_ui";

// Blue → cyan → yellow → red by normalized weight.
function heat(t: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [
    [37, 99, 235],
    [34, 211, 238],
    [250, 204, 21],
    [239, 68, 68],
  ];
  const seg = Math.min(Math.floor(t * 3), 2);
  const f = t * 3 - seg;
  const a = stops[seg];
  const b = stops[seg + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export default function HeatmapPage() {
  const [days, setDays] = useState(14);
  const [routes, setRoutes] = useState<RouteUsage[]>([]);
  const [route, setRoute] = useState("");
  const [grid, setGrid] = useState<HeatmapGrid | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api
      .getAnalyticsRoutes(days)
      .then((rs) => {
        setRoutes(rs);
        setRoute((prev) => prev || rs[0]?.route || "");
      })
      .catch((e: Error) => {
        if (e.message === "insufficient_permissions") setDenied(true);
      });
  }, [days]);

  useEffect(() => {
    if (!route) {
      setGrid(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getAnalyticsHeatmap(route, days)
      .then((g) => !cancelled && setGrid(g))
      .catch((e: Error) => {
        if (e.message === "insufficient_permissions") setDenied(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [route, days]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !grid) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { width: W, height: H } = c;
    ctx.clearRect(0, 0, W, H);
    // Light "screen" background + faint reference grid.
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#eef2f7";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 6) * i, 0);
      ctx.lineTo((W / 6) * i, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (H / 6) * i);
      ctx.lineTo(W, (H / 6) * i);
      ctx.stroke();
    }
    // Soft density blobs: draw coldest first so hot spots layer on top.
    const cw = W / grid.gridW;
    const ch = H / grid.gridH;
    const radius = Math.max(cw, ch) * 2.2;
    const cells = [...grid.cells].sort((a, b) => a.w - b.w);
    for (const cell of cells) {
      const t = grid.maxW ? cell.w / grid.maxW : 0;
      const cx = (cell.gx + 0.5) * cw;
      const cy = (cell.gy + 0.5) * ch;
      const [r, g, b] = heat(t);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${(0.35 + t * 0.45).toFixed(2)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [grid]);

  if (denied) return <AdminDenied />;

  const totalClicks = grid ? grid.cells.reduce((s, c) => s + c.w, 0) : 0;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Click Heatmap"
        subtitle="Where learners click on each screen — warmer = more clicks."
        days={days}
        onDays={setDays}
      />

      <Panel
        title="Screen"
        right={
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 max-w-xs"
          >
            {routes.length === 0 && <option value="">No screens yet</option>}
            {routes.map((r) => (
              <option key={r.route} value={r.route}>
                {routeLabel(r.route)} ({fmtNum(r.views)} views)
              </option>
            ))}
          </select>
        }
      >
        {!route && !loading ? (
          <p className="text-sm text-gray-400">No click data yet — browse the app as a signed-in adult learner to populate it.</p>
        ) : (
          <>
            {/* Screen frame with orientation guides */}
            <div className="relative">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 text-center mb-1">top of screen</div>
              <div className="flex items-stretch gap-1">
                <div className="flex items-center text-[10px] uppercase tracking-wide text-gray-400" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>left</div>
                <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 bg-slate-50">
                  {loading ? (
                    <div className="w-full animate-pulse bg-gray-100" style={{ aspectRatio: "16 / 10" }} />
                  ) : (
                    <canvas ref={canvasRef} width={960} height={600} className="w-full block" style={{ aspectRatio: "16 / 10" }} />
                  )}
                </div>
                <div className="flex items-center text-[10px] uppercase tracking-wide text-gray-400" style={{ writingMode: "vertical-rl" }}>right</div>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 text-center mt-1">bottom of screen</div>
            </div>

            <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
              <span>
                <span className="font-semibold text-slate-700 tabular-nums">{fmtNum(totalClicks)}</span> clicks on{" "}
                <span className="font-medium text-slate-700">{routeLabel(route)}</span>
                <span className="font-mono text-gray-400 ml-1.5">{route}</span>
              </span>
              <span className="flex items-center gap-2">
                fewer
                <span className="inline-block h-2.5 w-32 rounded" style={{ background: "linear-gradient(90deg, rgb(37,99,235), rgb(34,211,238), rgb(250,204,21), rgb(239,68,68))" }} />
                more
              </span>
            </div>
          </>
        )}
      </Panel>

      <p className="text-xs text-gray-400 mt-4">
        Positions are viewport-normalized (0–1) and aggregated into a density grid — no individual pointer trails, no PII, and the kid segment is excluded entirely.
      </p>
    </div>
  );
}
