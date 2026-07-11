"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type LearnerExam } from "@/lib/api";

// The learner's dean-assigned exams: pending ones to take + completed ones with scores.
export default function MyExams() {
  const [exams, setExams] = useState<LearnerExam[] | null>(null);

  useEffect(() => {
    api.getMyExams().then(setExams).catch(() => setExams([]));
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--color-primary)] mb-1">Экзамены</h1>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">Экзамены, назначенные вашим учебным заведением.</p>

      {exams === null ? (
        <p className="text-sm text-gray-400">Загрузка…</p>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-8 text-center text-sm text-gray-400">
          Назначенных экзаменов пока нет.
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => {
            const done = !!e.completedAt;
            const overdue = !done && e.dueAt && new Date(e.dueAt) < new Date();
            return (
              <div key={e.id} className="bg-white rounded-xl border border-[var(--color-border)] p-4 flex items-center gap-3">
                <span className="text-2xl" aria-hidden>{done ? (e.passed ? "🏆" : "📄") : "📝"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{e.title}</p>
                  <p className="text-xs text-gray-500">
                    Уровень {e.level} · {e.cohortName}
                    {e.dueAt && (
                      <span className={overdue ? "text-red-500" : ""}> · до {new Date(e.dueAt).toLocaleDateString("ru-RU")}</span>
                    )}
                  </p>
                </div>
                {done ? (
                  <span className={`text-sm font-semibold tabular-nums ${e.passed ? "text-green-600" : "text-slate-500"}`}>
                    {e.correct}/{e.total}{e.passed ? " ✓" : ""}
                  </span>
                ) : (
                  <Link
                    href={`/dashboard/exams/${e.id}`}
                    className="shrink-0 bg-[var(--color-primary)] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[var(--color-primary-light)]"
                  >
                    Пройти →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
