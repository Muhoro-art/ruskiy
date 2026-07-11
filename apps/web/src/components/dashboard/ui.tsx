"use client";

// Shared dashboard design system — used by the admin monitoring panel, the teacher
// command center, and the dean command & control, so every staff surface is
// consistent. No chart dependency: lightweight SVG primitives with shared formatting.

export function fmtNum(n: number): string {
  return (n ?? 0).toLocaleString();
}

export function fmtMs(ms: number): string {
  if (!ms || ms < 0) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtPct(fraction: number): string {
  return `${Math.round((fraction || 0) * 100)}%`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return "never";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function StatCard({ label, value, sub, loading, tone }: { label: string; value: string | number; sub?: string; loading?: boolean; tone?: "default" | "warn" | "good" }) {
  const valueColor = tone === "warn" ? "text-amber-600" : tone === "good" ? "text-green-600" : "text-slate-800";
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200">
      <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-gray-100 rounded mt-2 animate-pulse" />
      ) : (
        <p className={`text-2xl font-bold mt-1 tabular-nums ${valueColor}`}>{value}</p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function Panel({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6${className ? ` ${className}` : ""}`}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export function DaysTabs({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
      {[7, 14, 30, 90].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${value === d ? "bg-white shadow-sm text-slate-800 font-medium" : "text-gray-500 hover:text-slate-700"}`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

export function HBars({ rows, color = "#6366f1", fmt, empty = "No data yet." }: { rows: Array<{ label: string; value: number }>; color?: string; fmt?: (v: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-gray-400">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-52 shrink-0 text-sm text-slate-700 truncate font-mono text-xs" title={r.label}>{r.label}</div>
          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
            <div className="h-full rounded transition-all" style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, backgroundColor: color }} />
          </div>
          <div className="w-20 shrink-0 text-right text-sm font-medium text-slate-600 tabular-nums">{fmt ? fmt(r.value) : fmtNum(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

// A two-segment stacked bar (e.g. completed vs abandoned), scaled to `max`.
export function StackBar({ a, b, max, aColor = "#16a34a", bColor = "#dc2626" }: { a: number; b: number; max: number; aColor?: string; bColor?: string }) {
  const scale = max > 0 ? 100 / max : 0;
  return (
    <div className="flex h-4 w-full rounded overflow-hidden bg-gray-100">
      <div style={{ width: `${a * scale}%`, backgroundColor: aColor }} />
      <div style={{ width: `${b * scale}%`, backgroundColor: bColor }} />
    </div>
  );
}

// A confidence/percentage meter with red→amber→green tone by value.
export function Meter({ value }: { value: number }) {
  const pct = Math.round((value || 0) * 100);
  const color = value < 0.4 ? "#dc2626" : value < 0.7 ? "#f59e0b" : "#16a34a";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600 w-9">{pct}%</span>
    </div>
  );
}

export function TimeSeries({ points }: { points: Array<{ day: string; users: number; sessions: number; events: number }> }) {
  const W = 720, H = 190, padL = 30, padR = 10, padT = 12, padB = 22;
  const n = points.length;
  if (n === 0) return <p className="text-sm text-gray-400">No activity in this window yet.</p>;
  const maxV = Math.max(1, ...points.map((p) => Math.max(p.users, p.sessions)));
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v: number) => padT + ih - (v / maxV) * ih;
  const path = (key: "users" | "sessions") => points.map((p, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(" ");
  const area = `${path("users")} L${X(n - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${X(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;
  const ticks = Array.from(new Set([0, Math.round(maxV / 2), maxV]));
  const fmtDay = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} preserveAspectRatio="none">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} stroke="#eef2f7" strokeWidth={1} />
            <text x={padL - 6} y={Y(t) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">{t}</text>
          </g>
        ))}
        <path d={area} fill="#6366f1" opacity={0.1} />
        <path d={path("sessions")} fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" />
        <path d={path("users")} fill="none" stroke="#6366f1" strokeWidth={2} />
        {points.map((p, i) => (
          <circle key={i} cx={X(i)} cy={Y(p.users)} r={n > 40 ? 1.2 : 2.5} fill="#6366f1">
            <title>{`${fmtDay(p.day)} · ${p.users} learners · ${p.sessions} sessions · ${p.events} events`}</title>
          </circle>
        ))}
        <text x={padL} y={H - 6} fontSize={9} fill="#94a3b8">{fmtDay(points[0].day)}</text>
        <text x={W - padR} y={H - 6} fontSize={9} fill="#94a3b8" textAnchor="end">{fmtDay(points[n - 1].day)}</text>
      </svg>
      <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-indigo-500" />Active learners</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 border-t border-dashed border-gray-400" />Sessions</span>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, days, onDays, right }: { title: string; subtitle?: string; days?: number; onDays?: (d: number) => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {onDays && days !== undefined ? <DaysTabs value={days} onChange={onDays} /> : right}
    </div>
  );
}

// Access gate shown when a staff endpoint returns 403.
export function Denied({ role = "the required" }: { role?: string }) {
  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h1 className="text-xl font-bold text-slate-800">Access restricted</h1>
      <p className="text-sm text-gray-500 mt-2">
        This panel requires <code className="mx-1 px-1 bg-gray-100 rounded">{role}</code> role. Your account doesn&apos;t have it.
      </p>
    </div>
  );
}

// Back-compat alias for the admin panel.
export function AdminDenied() {
  return <Denied role="admin" />;
}
