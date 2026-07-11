"use client";

// Learner design kit — brand-tokened primitives (navy #1e3a5f / crimson #c41e3a /
// gold #d4a843) shared across every LEARNER surface (Home, Path, lessons/exams,
// Library, Leaderboard, exercises). Kept separate from components/dashboard/ui.tsx
// (the STAFF kit, which is slate/indigo) so each half is internally consistent while
// both share the token layer in globals.css. Every class here references the CSS
// vars — no raw Tailwind palette colours.

import React from "react";

// ---------------- Button ----------------
type Variant = "primary" | "navy" | "exam" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

// Colour-by-ROLE, not by taste: primary=crimson main CTA, navy=progression/continue,
// exam=gold, secondary=outline, ghost=text link.
const VARIANT: Record<Variant, string> = {
  primary: "bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] text-white",
  navy: "bg-[var(--color-primary)] hover:bg-[var(--color-primary-light)] text-white",
  exam: "bg-[var(--color-gold)] hover:bg-[var(--color-gold-light)] text-white",
  secondary: "border border-[var(--color-border-strong)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
  ghost: "text-[var(--color-primary)] hover:underline",
};
const SIZE: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-2.5",
  lg: "px-8 py-3 text-lg",
};
const BTN_BASE =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-control)] transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2";

/** Class string for the same button styling on a Link/<a>. */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `${BTN_BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

// ---------------- Card ----------------
export function Card({
  padding = "md",
  hover = false,
  className = "",
  children,
}: {
  padding?: "md" | "sm" | "none";
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const pad = padding === "sm" ? "p-5" : padding === "none" ? "" : "p-6";
  const h = hover ? "transition hover:shadow-md hover:border-[var(--color-primary)]" : "";
  return <div className={`bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] ${pad} ${h} ${className}`}>{children}</div>;
}

// ---------------- StatCard (learner-branded: navy value) ----------------
export function StatCard({ label, value, sub, loading }: { label: string; value: React.ReactNode; sub?: string; loading?: boolean }) {
  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)] font-medium">{label}</p>
      {loading ? (
        <div className="h-8 w-16 bg-[var(--color-surface-2)] rounded mt-2 animate-pulse" />
      ) : (
        <p className="text-2xl font-bold mt-1 tabular-nums text-[var(--color-primary)]">{value}</p>
      )}
      {sub && <p className="text-xs text-[var(--color-text-muted)] mt-1">{sub}</p>}
    </div>
  );
}

// ---------------- Headings ----------------
export function PageHeader({
  title,
  subtitle,
  right,
  display = false,
}: {
  title: React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;
  display?: boolean;
}) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 className={`text-3xl font-bold text-[var(--color-primary)] ${display ? "display" : ""}`}>{title}</h1>
        {subtitle && <p className="text-sm text-[var(--color-text-muted)] mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function SectionHeading({ children, right, className = "" }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-4 gap-3 ${className}`}>
      <h2 className="text-lg font-semibold text-[var(--color-primary)]">{children}</h2>
      {right}
    </div>
  );
}

// ---------------- Chip ----------------
type ChipTone = "neutral" | "brand" | "gold" | "success" | "info";
const CHIP: Record<ChipTone, string> = {
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
  brand: "bg-[var(--color-primary-tint)] text-[var(--color-primary)]",
  info: "bg-[var(--color-primary-tint)] text-[var(--color-primary)]",
  gold: "bg-[var(--color-gold-tint)] text-[var(--color-primary)]",
  success: "bg-[var(--color-success-surface)] text-[var(--color-success)]",
};
export function Chip({ tone = "neutral", className = "", children }: { tone?: ChipTone; className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${CHIP[tone]} ${className}`}>{children}</span>;
}

// ---------------- ProgressBar ----------------
export function ProgressBar({
  value,
  tone = "accent",
  onDark = false,
  className = "",
}: {
  value: number; // 0..1
  tone?: "accent" | "navy" | "exam";
  onDark?: boolean;
  className?: string;
}) {
  const fill = onDark ? "#ffffff" : tone === "exam" ? "var(--color-gold)" : tone === "navy" ? "var(--color-primary)" : "var(--color-accent)";
  const track = onDark ? "bg-white/20" : "bg-[var(--color-surface-2)]";
  return (
    <div className={`h-2 ${track} rounded-full overflow-hidden ${className}`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, backgroundColor: fill }} />
    </div>
  );
}

// ---------------- Callout / Hint ----------------
export function Callout({ tone = "info", className = "", children }: { tone?: "info" | "hint"; className?: string; children: React.ReactNode }) {
  const isHint = tone === "hint";
  return (
    <div
      className={`rounded-[var(--radius-card)] border px-4 py-3 text-sm text-[var(--color-primary)] ${className}`}
      style={{
        backgroundColor: isHint ? "var(--color-gold-tint)" : "var(--color-primary-tint)",
        borderColor: isHint ? "color-mix(in srgb, var(--color-gold) 45%, white)" : "color-mix(in srgb, var(--color-primary) 20%, white)",
      }}
    >
      {children}
    </div>
  );
}
export function Hint({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Callout tone="hint" className={className}>
      {children}
    </Callout>
  );
}

// ---------------- EmptyState ----------------
export function EmptyState({ icon, title, body }: { icon?: React.ReactNode; title: string; body?: string }) {
  return (
    <div className="text-center py-10">
      {icon && <div className="text-3xl mb-2">{icon}</div>}
      <p className="font-semibold text-[var(--color-primary)]">{title}</p>
      {body && <p className="text-sm text-[var(--color-text-muted)] mt-1">{body}</p>}
    </div>
  );
}

// ---------------- Tabs (segmented control) ----------------
export function Tabs<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-[var(--color-surface-2)] p-1 rounded-[var(--radius-control)] w-fit">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            value === o.value ? "bg-white shadow-sm text-[var(--color-primary)] font-medium" : "text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// CEFR band → brand ramp colour (navy→gold). Used by level badges everywhere,
// replacing the old per-file green/lime/yellow/orange/red CEFR_COLORS maps.
const CEFR_KEYS = ["a1", "a2", "b1", "b2", "c1", "c2"];
export function cefrColor(level: string): string {
  const k = (level || "").toLowerCase();
  return `var(--cefr-${CEFR_KEYS.includes(k) ? k : "b1"})`;
}
