"use client";

// Лист ответов: полноэкранный разбор ОДНОГО задания ОДНОГО ученика — каждый
// вопрос, ответ ученика и вердикт. Открывается из карточки ученика («Ответы ↗»)
// в новой вкладке, чтобы не терять вид класса.
//
// Материалы из Студии — записанные результаты единственной попытки.
// Практика — реальные ответы из адаптивного режима за окно задания
// (вопросы Пути считаются, но их ответы не записываются — честно говорим).

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type AnswerSheet, type PracticeAnswer } from "@/lib/api";
import { levels, type Question } from "@/curriculum";

// The curriculum ships in the client bundle, so question IDs from the
// student's Path history resolve to FULL question content right here — that's
// how work done before per-answer recording still shows its actual questions.
function buildCurriculumIndex() {
  const questionById = new Map<string, Question>();
  const lessonTitle = new Map<string, string>();
  for (const lvl of levels) {
    for (const mod of lvl.modules) {
      for (const lesson of mod.lessons) {
        lessonTitle.set(lesson.id, `${mod.title || mod.id} — урок ${lesson.index + 1}: ${lesson.titleEn}`);
        for (const q of lesson.questionBank) questionById.set(q.id, q);
      }
    }
    if (lvl.exam) {
      lessonTitle.set(lvl.exam.id, lvl.exam.title);
      for (const sec of lvl.exam.sections) for (const q of sec.pool) questionById.set(q.id, q);
    }
  }
  return { questionById, lessonTitle };
}

function questionPrompt(q: Question): string {
  return q.promptEn || q.promptRu || q.textRu || q.templateRu || "";
}
// Built once per page load — static curriculum content.
const curIndex = buildCurriculumIndex();

function questionExpected(q: Question): string {
  return (
    q.correctAnswer ||
    q.answer ||
    (q.correctOrder ? q.correctOrder.join(" ") : "") ||
    q.modelAnswerRu ||
    (q.slots ? q.slots.map((s) => s.stem + s.correct).join(", ") : "") ||
    (q.matchPairs ? q.matchPairs.map((p) => `${p.left} → ${p.right}`).join(", ") : "") ||
    (q.pairs ? q.pairs.map((p) => `${p.ru} = ${p.en}`).join(", ") : "")
  );
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Выбор ответа", fill_blank: "Пропуск", word_scramble: "Собери слово",
  matching: "Соответствия", sentence_builder: "Собери предложение", listening: "Аудирование",
  memory_match: "Мемори", drag_endings: "Окончания", free_response: "Свободный ответ",
  dialogue: "Диалог", composite: "Составное задание", translation: "Перевод",
  dictation: "Диктант", speaking: "Говорение", ordering: "Порядок слов",
  role_play: "Ролевая игра", reading_comp: "Чтение",
};

function verdictBadge(result: string): { icon: string; label: string; cls: string } {
  if (result === "correct") return { icon: "✓", label: "верно", cls: "bg-green-50 text-green-700 border-green-200" };
  if (result === "timeout") return { icon: "⏱", label: "время вышло", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (result === "viewed" || result === "done") return { icon: "👁", label: "просмотрено", cls: "bg-gray-50 text-gray-500 border-gray-200" };
  const frac = /^(\d+)\/(\d+)$/.exec(result);
  if (frac) {
    return frac[1] === frac[2]
      ? { icon: "✓", label: `все пары (${frac[2]})`, cls: "bg-green-50 text-green-700 border-green-200" }
      : { icon: frac[0], label: `${frac[1]} из ${frac[2]} пар`, cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { icon: "✗", label: "неверно", cls: "bg-red-50 text-red-600 border-red-200" };
}

export default function AnswerSheetPage() {
  const params = useParams();
  const cohortId = String(params.id);
  const learnerId = String(params.learnerId);
  const assignmentId = String(params.assignmentId);
  const [sheet, setSheet] = useState<AnswerSheet | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAssignmentAnswers(cohortId, learnerId, assignmentId)
      .then(setSheet)
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить ответы"))
      .finally(() => setLoading(false));
  }, [cohortId, learnerId, assignmentId]);

  if (loading) return <div className="text-[var(--color-text-muted)] py-12 text-center">Загружаем ответы…</div>;
  if (error || !sheet)
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error || "Не найдено"}</div>
      </div>
    );

  const isPractice = sheet.contentCount === 0;
  const practiceCorrect = sheet.practice.filter((p) => p.isCorrect).length;

  // Resolve the blob's seen-question history to full question content,
  // skipping anything already covered by a recorded answer.
  const recordedIds = new Set(sheet.pathAnswers.map((p) => p.questionId).filter(Boolean));
  const pathSeenResolved = sheet.pathSeen
    .map((les) => {
      const pendingIds = les.questionIds.filter((id) => !recordedIds.has(id));
      const questions = pendingIds
        .map((id) => curIndex.questionById.get(id))
        .filter((q): q is Question => !!q);
      return {
        lessonId: les.lessonId,
        title: curIndex.lessonTitle.get(les.lessonId) || les.lessonId,
        bestScore: les.bestScore,
        attempts: les.attempts,
        totalSeen: les.questionIds.length,
        questions,
        unresolved: pendingIds.length - questions.length,
      };
    })
    .filter((l) => l.questions.length > 0 || l.unresolved > 0);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href={`/dashboard/cohorts/${cohortId}`} className="hover:text-[var(--color-primary)]">← К классу</Link>
      </div>

      {/* header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-primary)]">{sheet.title}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Ученик: <strong className="text-[var(--color-text)]">{sheet.learnerName}</strong>
              {" · "}назначено {new Date(sheet.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              {sheet.completedAt
                ? ` · выполнено ${new Date(sheet.completedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : " · ещё не выполнено"}
              {!isPractice && sheet.timePerQuestionSec > 0 ? ` · ⏱ ${sheet.timePerQuestionSec} сек/вопрос` : ""}
            </p>
          </div>
          {isPractice ? (
            sheet.practice.length > 0 && (
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-[var(--color-primary)]">{practiceCorrect}/{sheet.practice.length}</p>
                <p className="text-xs text-[var(--color-text-muted)]">верно в адаптивном режиме</p>
              </div>
            )
          ) : (
            sheet.completedAt && (
              <div className="text-right">
                <p className={`text-3xl font-bold tabular-nums ${sheet.scoreTotal > 0 && sheet.scoreCorrect / sheet.scoreTotal >= 0.6 ? "text-green-600" : "text-red-600"}`}>
                  {sheet.scoreCorrect}/{sheet.scoreTotal}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">балл за попытку</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* ---------------- materials: recorded attempt ---------------- */}
      {!isPractice &&
        (sheet.results.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {sheet.completedAt
              ? "Детали ответов не записаны — задание было выполнено до появления записи по вопросам."
              : "Ученик ещё не выполнял это задание."}
          </div>
        ) : (
          sheet.results.map((item, k) => (
            <div key={k} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h2 className="text-sm font-bold text-[var(--color-text)] mb-4">{item.title}</h2>
              <div className="space-y-4">
                {item.steps.map((s, j) => {
                  const b = verdictBadge(s.result);
                  const missed = s.result !== "correct" && s.result !== "viewed" && s.result !== "done";
                  return (
                    <div key={j} className="flex items-start gap-3 border-b border-gray-50 last:border-0 pb-4 last:pb-0">
                      <span className={`shrink-0 text-sm font-semibold border rounded-lg px-2.5 py-1 ${b.cls}`} title={b.label}>
                        {s.i} {b.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-400 mb-0.5">{TYPE_LABEL[s.type] || s.type} · {b.label}</p>
                        {s.prompt && <p className="text-sm font-medium text-[var(--color-text)]">{s.prompt}</p>}
                        <div className="text-sm mt-1 space-y-0.5">
                          {s.result === "timeout" ? (
                            <p className="text-amber-700">Без ответа — время вышло</p>
                          ) : (
                            s.given && (
                              <p>
                                <span className="text-gray-400">Ответ ученика:</span>{" "}
                                <span className={missed ? "text-red-600 font-medium" : "text-green-700 font-medium"}>{s.given}</span>
                              </p>
                            )
                          )}
                          {missed && s.expected && (
                            <p>
                              <span className="text-gray-400">Правильный ответ:</span>{" "}
                              <span className="text-green-700 font-medium">{s.expected}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ))}

      {/* ---------------- practice: adaptive answers in the window ---------------- */}
      {isPractice && (
        <>
          {sheet.practice.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h2 className="text-sm font-bold text-[var(--color-text)] mb-1">Ответы в адаптивном режиме</h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Все ответы с момента назначения задания{sheet.completedAt ? " до его выполнения" : ""}.
              </p>
              <div className="space-y-4">
                {sheet.practice.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 border-b border-gray-50 last:border-0 pb-4 last:pb-0">
                    <span
                      className={`shrink-0 text-sm font-semibold border rounded-lg px-2.5 py-1 ${
                        p.isCorrect ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"
                      }`}
                    >
                      {i + 1} {p.isCorrect ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-400 mb-0.5">
                        {TYPE_LABEL[p.type] || p.type || "упражнение"} ·{" "}
                        {new Date(p.answeredAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {p.prompt && <p className="text-sm font-medium text-[var(--color-text)]">{p.prompt}</p>}
                      <div className="text-sm mt-1 space-y-0.5">
                        <p>
                          <span className="text-gray-400">Ответ ученика:</span>{" "}
                          <span className={p.isCorrect ? "text-green-700 font-medium" : "text-red-600 font-medium"}>{p.response}</span>
                        </p>
                        {!p.isCorrect && p.correctAnswer && (
                          <p>
                            <span className="text-gray-400">Правильный ответ:</span>{" "}
                            <span className="text-green-700 font-medium">{p.correctAnswer}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* recorded Path answers (per-question capture, from July 2026 on) */}
          {sheet.pathAnswers.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h2 className="text-sm font-bold text-[var(--color-text)] mb-1">Ответы в уроках Пути</h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">Записанные ответы за окно задания.</p>
              <div className="space-y-4">
                {sheet.pathAnswers.map((p: PracticeAnswer, i: number) => (
                  <div key={i} className="flex items-start gap-3 border-b border-gray-50 last:border-0 pb-4 last:pb-0">
                    <span
                      className={`shrink-0 text-sm font-semibold border rounded-lg px-2.5 py-1 ${
                        p.isCorrect ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"
                      }`}
                    >
                      {i + 1} {p.isCorrect ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-400 mb-0.5">
                        {curIndex.lessonTitle.get(p.type) || p.type} ·{" "}
                        {new Date(p.answeredAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {p.prompt && <p className="text-sm font-medium text-[var(--color-text)]">{p.prompt}</p>}
                      <div className="text-sm mt-1 space-y-0.5">
                        <p>
                          <span className="text-gray-400">Ответ ученика:</span>{" "}
                          <span className={p.isCorrect ? "text-green-700 font-medium" : "text-red-600 font-medium"}>{p.response}</span>
                        </p>
                        {!p.isCorrect && p.correctAnswer && (
                          <p>
                            <span className="text-gray-400">Правильный ответ:</span>{" "}
                            <span className="text-green-700 font-medium">{p.correctAnswer}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* reconstruction: the ACTUAL questions from Path work done before
              per-answer recording — resolved from the curriculum bundle */}
          {pathSeenResolved.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h2 className="text-sm font-bold text-[var(--color-text)] mb-1">Вопросы из уроков Пути</h2>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Эти вопросы ученик проходил в Пути до включения записи ответов (5 июля 2026) — сохранились сами
                вопросы и итог урока, но не ответы по каждому вопросу.
              </p>
              {pathSeenResolved.map((les) => {
                // Single attempt ⇒ the correct/wrong SPLIT is exact (score × count);
                // only the mapping to specific questions is missing.
                const totalSeen = les.totalSeen;
                const exactSplit = les.attempts === 1;
                const okCount = Math.round(les.bestScore * totalSeen);
                return (
                <div key={les.lessonId} className="mb-5 last:mb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-700">{les.title}</h3>
                    <div className="flex items-center gap-1.5">
                      {exactSplit ? (
                        <>
                          <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-green-50 text-green-700">
                            верно: {okCount}
                          </span>
                          <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-red-50 text-red-600">
                            неверно: {totalSeen - okCount}
                          </span>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${
                            les.bestScore >= 0.6 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                          }`}
                        >
                          лучший результат: {Math.round(les.bestScore * 100)}% · попыток: {les.attempts}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-3 inline-block">
                    ⚠ КАКИЕ именно вопросы были неверными — не записано: попытка была до включения записи ответов
                    (5 июля 2026). Все новые попытки записываются по каждому вопросу.
                  </p>
                  <div className="space-y-3">
                    {les.questions.map((q, j) => (
                      <div key={q.id} className="flex items-start gap-3 border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                        <span className="shrink-0 text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-500 rounded-lg px-2 py-1">
                          {j + 1}
                        </span>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="text-xs text-gray-400 mb-0.5">{TYPE_LABEL[q.exerciseType] || q.exerciseType}</p>
                          <p className="font-medium text-[var(--color-text)]">{questionPrompt(q)}</p>
                          {questionExpected(q) && (
                            <p className="mt-0.5">
                              <span className="text-gray-400">Правильный ответ:</span>{" "}
                              <span className="text-green-700 font-medium">{questionExpected(q)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {les.unresolved > 0 && (
                      <p className="text-xs text-gray-400">…и ещё {les.unresolved} вопрос(ов) из другого набора уроков.</p>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {sheet.practice.length === 0 && sheet.pathAnswers.length === 0 && pathSeenResolved.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
              За окно этого задания записанных ответов нет.
            </div>
          )}
        </>
      )}
    </div>
  );
}
