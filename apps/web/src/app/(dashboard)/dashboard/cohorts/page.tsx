"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Cohort } from "@/lib/api";
import { T } from "@/lib/ru";

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    try {
      setCohorts(await api.getCohorts());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить группы");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!newName.trim()) return;
    try {
      await api.createCohort(newName.trim());
      setNewName("");
      setCreating(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать группу");
    }
  }

  const teacherDenied = /permission|unauthorized|forbidden/i.test(error);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">{T.cohortsTitle}</h1>
          <p className="text-[var(--color-text-muted)] mt-1">{T.cohortsSubtitle}</p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-[var(--color-primary)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors"
        >
          {T.newCohort}
        </button>
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={T.cohortNamePh}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          <button onClick={create} className="bg-[var(--color-accent)] text-white font-semibold px-5 rounded-lg">
            {T.create}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-[var(--color-text-muted)] py-12 text-center">{T.loading}</div>
      ) : teacherDenied ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <p className="font-semibold text-[var(--color-primary)]">{T.teacherAccessRequired}</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{T.askAdminForRole}</p>
        </div>
      ) : error ? (
        <div className="text-[var(--color-text-muted)] py-12 text-center">{error}</div>
      ) : cohorts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-[var(--color-text-muted)]">
          {T.noCohortsYet}
        </div>
      ) : (
        <div className="grid gap-4">
          {cohorts.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/cohorts/${c.id}`}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow block"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{c.name}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {T.studentsN(c.studentCount)} · {T.createdOn} {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <span className="text-[var(--color-primary)] font-semibold">{T.viewHeatmap}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
