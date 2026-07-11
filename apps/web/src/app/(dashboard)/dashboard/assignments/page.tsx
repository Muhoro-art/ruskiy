"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Assignment } from "@/lib/api";
import { T } from "@/lib/ru";

export default function AssignmentsPage() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setItems(await api.getAssignments());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить задания");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const denied = /permission|forbidden|unauthorized/i.test(error);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">{T.assignmentsTitle}</h1>
          <p className="text-[var(--color-text-muted)] mt-1">{T.assignmentsSubtitle}</p>
        </div>
        <Link
          href="/dashboard/assignments/new"
          className="bg-[var(--color-primary)] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors"
        >
          {T.newAssignment}
        </Link>
      </div>

      {loading ? (
        <div className="text-[var(--color-text-muted)] py-12 text-center">{T.loading}</div>
      ) : denied ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <p className="font-semibold text-[var(--color-primary)]">{T.teacherAccessRequired}</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{T.askAdminForRole}</p>
        </div>
      ) : error ? (
        <div className="text-[var(--color-text-muted)] py-12 text-center">{error}</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-[var(--color-text-muted)]">
          {T.noAssignmentsYet}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">{a.title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {a.cohortName ? `${a.cohortName} · ` : ""}
                    <span className={a.targetCount > 0 ? "text-[var(--color-primary)] font-medium" : ""}>
                      {a.targetCount > 0 ? T.forNStudents(a.targetCount) : T.forWholeCohort}
                    </span>{" "}
                    · {a.deadline ? `${T.due} ${new Date(a.deadline).toLocaleDateString("ru-RU")}` : T.noDeadline} · {T.minExercises(a.minExercises)}
                    {a.contentCount > 0 ? (
                      <span className="ml-1 text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 text-xs">
                        {a.contentCount} матер. из Студии
                      </span>
                    ) : null}
                  </p>
                  {a.targetSkills.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {a.targetSkills.map((skill) => (
                        <span key={skill} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs text-[var(--color-text-muted)]">{new Date(a.createdAt).toLocaleDateString("ru-RU")}</span>
                  {/* Reuse: open the create form prefilled from this assignment. */}
                  <Link
                    href={`/dashboard/assignments/new?from=${a.id}`}
                    className="text-sm font-medium text-[var(--color-primary)] border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
                  >
                    {T.reuse}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
