"use client";

import { useState } from "react";

// The classic three-dropdown birth-date picker (Day / Month / Year) used at registration.
// It owns its own three-part UI state and reports the assembled ISO "YYYY-MM-DD" string
// upward (or "" while the date is incomplete or impossible, e.g. 31 February). The parent
// uses that date as the authoritative age signal for the under-18 / guardian determination.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// computeAge returns the age in whole years for an ISO "YYYY-MM-DD" date, or null when the
// string is empty, malformed, or names a day that doesn't exist.
export function computeAge(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dob = new Date(y, m - 1, d);
  // Reject dates the constructor silently rolled over (e.g. 2001-02-31 → 3 March).
  if (dob.getFullYear() !== y || dob.getMonth() !== m - 1 || dob.getDate() !== d) return null;
  const now = new Date();
  if (dob > now) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() < m - 1 || (now.getMonth() === m - 1 && now.getDate() < d)) age--;
  return age;
}

export default function DateOfBirthPicker({
  onChange,
  idPrefix = "dob",
}: {
  // Receives the ISO date once all three parts form a real date, or "" otherwise.
  onChange: (iso: string) => void;
  idPrefix?: string;
}) {
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => thisYear - i); // most recent 100 years
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  function update(d: string, m: string, y: string) {
    setDay(d);
    setMonth(m);
    setYear(y);
    if (d && m && y) {
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      onChange(computeAge(iso) === null ? "" : iso);
    } else {
      onChange("");
    }
  }

  const selCls =
    "px-2 py-3 border border-[var(--color-border-strong)] rounded-[var(--radius-control)] outline-none focus:ring-2 focus:ring-[var(--color-primary)] bg-white text-sm";

  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Date of birth">
      <select id={`${idPrefix}-day`} aria-label="Day" value={day} onChange={(e) => update(e.target.value, month, year)} className={selCls} required>
        <option value="" disabled>Day</option>
        {days.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select id={`${idPrefix}-month`} aria-label="Month" value={month} onChange={(e) => update(day, e.target.value, year)} className={selCls} required>
        <option value="" disabled>Month</option>
        {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
      </select>
      <select id={`${idPrefix}-year`} aria-label="Year" value={year} onChange={(e) => update(day, month, e.target.value)} className={selCls} required>
        <option value="" disabled>Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
