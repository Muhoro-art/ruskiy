"use client";

// Отчёт за период: the teacher's (and dean's) day/week/month view of one
// group — per student: how many assignments they finished (of those assigned),
// their score over the period, practice volume (adaptive + Path), XP earned in
// the period and lifetime — plus teacher commentary pinned to the period.

import { Fragment, useCallback, useEffect, useState } from "react";
import { api, type CohortReport, type ReportRow } from "@/lib/api";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESETS = [
  { key: "day", label: "Сегодня", days: 0 },
  { key: "week", label: "7 дней", days: 6 },
  { key: "month", label: "30 дней", days: 29 },
] as const;

export function CohortReportView({ cohortId }: { cohortId: string }) {
  const today = isoDate(new Date());
  const weekAgo = isoDate(new Date(Date.now() - 6 * 86400e3));
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Комментарий: which student's comment box is open + its draft text.
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError("");
    try {
      setReport(await api.getCohortReport(cohortId, f, t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось построить отчёт");
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  function applyPreset(days: number) {
    const f = isoDate(new Date(Date.now() - days * 86400e3));
    const t = isoDate(new Date());
    setFrom(f);
    setTo(t);
    load(f, t);
  }

  async function saveComment(learnerId: string) {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      await api.addReportComment(cohortId, learnerId, from, to, text);
      setDraft("");
      setCommentFor(null);
      load(from, to);
    } catch {
      /* keep the box open so the text isn't lost */
    } finally {
      setSaving(false);
    }
  }

  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "—";

  return (
    <div>
      {/* period picker */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.days)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-slate-700 hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
        <span className="text-sm text-[var(--color-text-muted)] ml-2">с</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <span className="text-sm text-[var(--color-text-muted)]">по</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <button onClick={() => load(from, to)}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-light)]">
          Показать
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm mb-4">{error}</div>}
      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">Строим отчёт…</p>
      ) : !report ? null : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm text-[var(--color-text-muted)]">
            Период: <strong className="text-[var(--color-text)]">{fmtDate(report.from)} — {fmtDate(report.to)}</strong> ·{" "}
            {report.rows.length} учен. · XP за период = занятия + вопросы Пути (по 2) + задания (+10 верно / −5 мимо, +20 за практику)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 px-4 font-medium">Ученик</th>
                  <th className="py-2 px-3 font-medium text-right">Заданий выполнено</th>
                  <th className="py-2 px-3 font-medium text-right">Балл за период</th>
                  <th className="py-2 px-3 font-medium text-right">Упражнений</th>
                  <th className="py-2 px-3 font-medium text-right">Вопросов Пути</th>
                  <th className="py-2 px-3 font-medium text-right">XP за период</th>
                  <th className="py-2 px-3 font-medium text-right">XP всего</th>
                  <th className="py-2 px-3 font-medium">Активность</th>
                  <th className="py-2 px-3 font-medium">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r: ReportRow) => (
                  <Fragment key={r.learnerId}>
                    <tr className="border-b border-gray-50 align-top">
                      <td className="py-2 px-4 font-medium text-slate-800 whitespace-nowrap">{r.name}</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {r.completed}
                        <span className="text-gray-400"> из {r.assignedTotal}</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {r.scoreTotal > 0 ? (
                          <span className={r.scoreCorrect / r.scoreTotal >= 0.6 ? "text-green-700" : "text-red-600"}>
                            {r.scoreCorrect}/{r.scoreTotal}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {r.exercises > 0 ? `${r.exercisesOk}/${r.exercises}` : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {r.pathQuestions > 0 ? r.pathQuestions : <span className="text-gray-400">—</span>}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.xpEarned > 0 ? "text-green-700" : r.xpEarned < 0 ? "text-red-600" : "text-gray-400"}`}>
                        {r.xpEarned > 0 ? `+${r.xpEarned}` : r.xpEarned || "—"}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{r.totalXp.toLocaleString("ru-RU")}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-[var(--color-text-muted)]">{fmtDate(r.lastActive)}</td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => { setCommentFor(commentFor === r.learnerId ? null : r.learnerId); setDraft(""); }}
                          className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
                        >
                          💬 {r.comments.length > 0 ? `${r.comments.length}` : "добавить"}
                        </button>
                      </td>
                    </tr>
                    {(r.comments.length > 0 || commentFor === r.learnerId) && (
                      <tr className="border-b border-gray-50 bg-gray-50/50">
                        <td colSpan={9} className="px-4 py-2">
                          {r.comments.map((c) => (
                            <p key={c.id} className="text-xs text-slate-600 mb-1">
                              <span className="text-gray-400">
                                {new Date(c.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · {c.teacherEmail}:
                              </span>{" "}
                              {c.comment}
                            </p>
                          ))}
                          {commentFor === r.learnerId && (
                            <div className="flex gap-2 mt-1">
                              <input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveComment(r.learnerId); }}
                                placeholder={`Комментарий к отчёту (${fmtDate(report.from)} — ${fmtDate(report.to)})…`}
                                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg"
                                autoFocus
                              />
                              <button
                                onClick={() => saveComment(r.learnerId)}
                                disabled={saving || !draft.trim()}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-primary)] text-white disabled:opacity-50"
                              >
                                {saving ? "…" : "Сохранить"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-[var(--color-text-muted)] mt-3">
        «Балл за период» — сумма по заданиям, выполненным в выбранный период. «Упражнений» — верно/всего в адаптивном режиме.
        Комментарии привязаны к выбранному периоду — откройте тот же диапазон, чтобы увидеть их снова.
      </p>
    </div>
  );
}
