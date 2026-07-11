"use client";

import { useEffect, useState } from "react";
import {
  api,
  type Institution,
  type InstTeacher,
  type InstCohort,
  type InstInvite,
  type LearnerBrief,
  type AssignedExam,
  type ExamResultRow,
} from "@/lib/api";
import { PageHeader, Panel, StatCard, Denied, fmtNum } from "@/components/dashboard/ui";
import { T } from "@/lib/ru";

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500";
const btnCls = "bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50";
const dangerCls = "text-xs font-semibold text-red-600 hover:text-red-700 hover:underline disabled:opacity-40";

export default function InstitutionAdmin() {
  const [inst, setInst] = useState<Institution | null>(null);
  const [teachers, setTeachers] = useState<InstTeacher[]>([]);
  const [students, setStudents] = useState<LearnerBrief[]>([]);
  const [cohorts, setCohorts] = useState<InstCohort[]>([]);
  const [invites, setInvites] = useState<InstInvite[]>([]);
  const [denied, setDenied] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("teacher");
  const [issued, setIssued] = useState<{ token: string; email: string } | null>(null);
  const [inviteErr, setInviteErr] = useState("");

  const [cohortName, setCohortName] = useState("");
  const [assignTeacher, setAssignTeacher] = useState("");
  const [assignMsg, setAssignMsg] = useState("");

  // Exams
  const [exams, setExams] = useState<AssignedExam[]>([]);
  const [examCohort, setExamCohort] = useState("");
  const [examLevel, setExamLevel] = useState("A1");
  const [examTitle, setExamTitle] = useState("");
  const [examDue, setExamDue] = useState("");
  const [examMsg, setExamMsg] = useState("");
  const [openExam, setOpenExam] = useState<string | null>(null);
  const [examResults, setExamResults] = useState<ExamResultRow[]>([]);

  // Settings edit state
  const [editName, setEditName] = useState<string | null>(null);
  // Inline cohort rename
  const [renameCohort, setRenameCohort] = useState<{ id: string; name: string } | null>(null);
  // Confirm modal for destructive actions
  const [confirm, setConfirm] = useState<{ msg: string; danger?: boolean; onYes: () => void } | null>(null);
  const [toast, setToast] = useState("");

  function flash(m: string) {
    setToast(m);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function load() {
    setLoadErr(false);
    setLoading(true);
    try {
      const [me, ts, ss, cs, iv, ex] = await Promise.all([
        api.getInstitutionMe(),
        api.getInstitutionTeachers(),
        api.getInstitutionStudents(),
        api.getInstitutionCohorts(),
        api.getInstitutionInvites(),
        api.getInstitutionExams(),
      ]);
      setInst(me.institution);
      setTeachers(ts);
      setStudents(ss);
      setCohorts(cs);
      setInvites(iv);
      setExams(ex);
    } catch (e) {
      if ((e as Error).message === "insufficient_permissions") setDenied(true);
      else setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  // A wrapper that runs a mutation, then reloads + toasts (or shows the error).
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await load();
      flash(ok);
    } catch (e) {
      flash((e as Error).message || "Не удалось выполнить действие");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (denied) return <Denied role="dean" />;
  if (loadErr)
    return (
      <div className="max-w-4xl">
        <PageHeader title="Institution" subtitle="Your institution" />
        <Panel title="Couldn't load your institution">
          <p className="text-sm text-gray-500">Something went wrong loading this page.</p>
          <button onClick={load} className={`${btnCls} mt-3`}>Retry</button>
        </Panel>
      </div>
    );
  if (loading && !inst)
    return (
      <div className="max-w-4xl">
        <PageHeader title="Institution" subtitle="Your institution" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteErr("");
    setIssued(null);
    try {
      const r = await api.inviteTeacher(inviteEmail, inviteRole);
      setIssued({ token: r.token, email: r.email });
      setInviteEmail("");
      load();
    } catch (err) {
      setInviteErr((err as Error).message || "Failed to create invite");
    }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setAssignMsg("");
    try {
      await api.assignCohort(cohortName, assignTeacher);
      setAssignMsg(`✓ «${cohortName}» назначена`);
      setCohortName("");
      load();
    } catch (err) {
      setAssignMsg((err as Error).message || "Failed to assign");
    }
  }

  async function assignExam(e: React.FormEvent) {
    e.preventDefault();
    setExamMsg("");
    try {
      await api.createInstitutionExam({
        cohortId: examCohort,
        level: examLevel,
        title: examTitle.trim(),
        dueAt: examDue || undefined,
      });
      setExamMsg(`✓ Экзамен «${examTitle}» назначен`);
      setExamTitle("");
      setExamDue("");
      load();
    } catch (err) {
      setExamMsg((err as Error).message || "Не удалось назначить экзамен");
    }
  }

  async function toggleExamResults(id: string) {
    if (openExam === id) {
      setOpenExam(null);
      return;
    }
    setOpenExam(id);
    setExamResults([]);
    try {
      setExamResults(await api.getInstitutionExamResults(id));
    } catch {
      setExamResults([]);
    }
  }

  const teacherCount = teachers.filter((t) => t.role === "teacher").length;
  const deanCount = teachers.filter((t) => t.role === "dean").length;

  return (
    <div className="max-w-5xl">
      <PageHeader title={T.instTitle} subtitle={inst ? `${inst.name} · ${T.instSubtitle}` : T.instTitle} />

      {toast && (
        <div className="mb-4 rounded-lg bg-slate-800 text-white text-sm px-4 py-2.5">{toast}</div>
      )}

      {/* ---- Institution settings ---- */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border border-gray-200 col-span-2">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">Учреждение</p>
          {editName === null ? (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-lg font-bold text-slate-800">{inst?.name}</p>
              <button onClick={() => setEditName(inst?.name ?? "")} className="text-xs text-indigo-600 hover:underline">переименовать</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls + " max-w-xs"} />
              <button
                disabled={busy || editName.trim().length < 2}
                onClick={() => run(async () => { const u = await api.renameInstitution(editName.trim()); setInst(u); setEditName(null); }, "Название обновлено")}
                className={btnCls}
              >
                Сохранить
              </button>
              <button onClick={() => setEditName(null)} className="text-xs text-gray-400 hover:underline">отмена</button>
            </div>
          )}
          <div className="mt-4 flex items-end gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">Код для студентов</p>
              <p className="text-2xl font-bold text-slate-800 mt-1 font-mono tracking-widest">{inst?.joinCode ?? "…"}</p>
            </div>
            <button
              disabled={busy}
              onClick={() => setConfirm({ msg: "Сменить код? Старый код перестанет работать — студентам понадобится новый.", onYes: () => run(async () => { const r = await api.rotateInstitutionCode(); setInst((p) => (p ? { ...p, joinCode: r.joinCode } : p)); }, "Код обновлён") })}
              className="text-xs font-semibold text-indigo-600 hover:underline mb-1.5"
            >
              ↻ сменить код
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Студенты вводят код при регистрации, чтобы зачислиться в набор.</p>
        </div>
        <div className="grid grid-rows-2 gap-4">
          <StatCard label={T.teachers} value={fmtNum(teacherCount)} />
          <StatCard label="Зачислено студентов" value={fmtNum(students.length)} />
        </div>
      </div>

      {/* ---- Invite + assign ---- */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Panel title={T.inviteTeacherPanel}>
          <form onSubmit={invite} className="space-y-3">
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required placeholder="teacher@university.edu" className={inputCls} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className={inputCls}>
              <option value="teacher">{T.roleTeacher}</option>
              <option value="dean">{T.roleDean}</option>
            </select>
            <button className={btnCls}>Создать приглашение</button>
          </form>
          {inviteErr && <p className="text-sm text-red-600 mt-2">{inviteErr}</p>}
          {issued && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              Приглашение для <strong>{issued.email}</strong> создано. Передайте этот код — его вводят при регистрации преподавателя (<em>«Join my institution»</em>):
              <div className="mt-1 font-mono text-xs bg-white border border-green-200 rounded px-2 py-1 break-all">{issued.token}</div>
            </div>
          )}
        </Panel>

        <Panel title={T.assignCohortPanel}>
          <form onSubmit={assign} className="space-y-3">
            <input value={cohortName} onChange={(e) => setCohortName(e.target.value)} required placeholder="напр. Осень 2026 — группа 1" className={inputCls} />
            <select value={assignTeacher} onChange={(e) => setAssignTeacher(e.target.value)} required className={inputCls}>
              <option value="">Выберите преподавателя…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.email} ({t.role})</option>
              ))}
            </select>
            <button className={btnCls} disabled={!assignTeacher}>Назначить группу</button>
          </form>
          {assignMsg && <p className={`text-sm mt-2 ${assignMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{assignMsg}</p>}
        </Panel>
      </div>

      {/* ---- Pending invites ---- */}
      {invites.length > 0 && (
        <Panel title="Приглашения (ожидают принятия)" className="mb-6">
          <table className="w-full text-sm">
            <tbody>
              {invites.map((iv) => (
                <tr key={iv.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-slate-700">{iv.email}</td>
                  <td className="py-2 text-gray-500">{iv.role === "dean" ? T.roleDean : T.roleTeacher}</td>
                  <td className="py-2 text-gray-400 text-xs">до {new Date(iv.expiresAt).toLocaleDateString("ru-RU")}</td>
                  <td className="py-2 text-right">
                    <button disabled={busy} onClick={() => run(() => api.revokeInstitutionInvite(iv.id), "Приглашение отозвано")} className={dangerCls}>отозвать</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* ---- Teachers management ---- */}
      <Panel title="Преподаватели и деканы" right={<span className="text-xs text-gray-400">{deanCount} декан(ов) · {teacherCount} преп.</span>} className="mb-6">
        {teachers.length === 0 ? (
          <p className="text-sm text-gray-400">Пока никого — пригласите преподавателей выше.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-slate-700">{t.email}</td>
                  <td className="py-2">
                    <select
                      value={t.role}
                      disabled={busy}
                      onChange={(e) => run(() => api.setInstitutionTeacherRole(t.id, e.target.value as "teacher" | "dean"), "Роль изменена")}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white"
                    >
                      <option value="teacher">{T.roleTeacher}</option>
                      <option value="dean">{T.roleDean}</option>
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      disabled={busy}
                      onClick={() => setConfirm({ msg: `Убрать ${t.email} из учреждения? Их группы перейдут к вам, а аккаунт станет обычным учеником.`, danger: true, onYes: () => run(() => api.removeInstitutionTeacher(t.id), "Преподаватель удалён") })}
                      className={dangerCls}
                    >
                      убрать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* ---- Cohorts management ---- */}
      <Panel title="Группы учреждения" className="mb-6">
        {cohorts.length === 0 ? (
          <p className="text-sm text-gray-400">Групп пока нет — назначьте первую выше.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Группа</th>
                <th className="py-2 font-medium">Преподаватель</th>
                <th className="py-2 font-medium">Студентов</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {cohorts.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-slate-700">
                    {renameCohort?.id === c.id ? (
                      <span className="flex items-center gap-1.5">
                        <input value={renameCohort.name} onChange={(e) => setRenameCohort({ id: c.id, name: e.target.value })} className="border border-gray-200 rounded px-2 py-1 text-sm w-40" />
                        <button disabled={busy || renameCohort.name.trim().length < 1} onClick={() => run(async () => { await api.updateInstitutionCohort(c.id, { name: renameCohort.name.trim() }); setRenameCohort(null); }, "Группа переименована")} className="text-xs text-indigo-600 hover:underline">ок</button>
                        <button onClick={() => setRenameCohort(null)} className="text-xs text-gray-400 hover:underline">×</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {c.name}
                        <button onClick={() => setRenameCohort({ id: c.id, name: c.name })} className="text-xs text-indigo-500 hover:underline">✎</button>
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <select
                      value={c.teacherId}
                      disabled={busy}
                      onChange={(e) => run(() => api.updateInstitutionCohort(c.id, { teacherId: e.target.value }), "Группа переназначена")}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white max-w-[16rem]"
                    >
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.email}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-gray-500">{c.students}</td>
                  <td className="py-2 text-right">
                    <button
                      disabled={busy}
                      onClick={() => setConfirm({ msg: `Удалить группу «${c.name}»? Это удалит её задания и списки — действие необратимо.`, danger: true, onYes: () => run(() => api.deleteInstitutionCohort(c.id), "Группа удалена") })}
                      className={dangerCls}
                    >
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* ---- Exams ---- */}
      <Panel title="Экзамены" className="mb-6" right={<span className="text-xs text-gray-400">оценка группы по уровню сложности</span>}>
        <form onSubmit={assignExam} className="grid grid-cols-2 gap-3 mb-4">
          <input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} required placeholder="Название экзамена (напр. Итоговый B1)" className={inputCls} />
          <select value={examCohort} onChange={(e) => setExamCohort(e.target.value)} required className={inputCls}>
            <option value="">Группа…</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.teacherEmail})</option>
            ))}
          </select>
          <select value={examLevel} onChange={(e) => setExamLevel(e.target.value)} className={inputCls} title="Уровень = сложность">
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
              <option key={l} value={l}>Уровень {l}</option>
            ))}
          </select>
          <input type="date" value={examDue} onChange={(e) => setExamDue(e.target.value)} className={inputCls} title="Срок сдачи" />
          <button className={`${btnCls} col-span-2`} disabled={!examCohort || !examTitle.trim()}>Назначить экзамен</button>
        </form>
        {examMsg && <p className={`text-sm mb-3 ${examMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{examMsg}</p>}

        {exams.length === 0 ? (
          <p className="text-sm text-gray-400">Экзамены ещё не назначены.</p>
        ) : (
          <div className="space-y-2">
            {exams.map((ex) => (
              <div key={ex.id} className="border border-gray-100 rounded-lg">
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{ex.level}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{ex.title}</p>
                    <p className="text-[11px] text-gray-400">{ex.cohortName}{ex.dueAt ? ` · до ${new Date(ex.dueAt).toLocaleDateString("ru-RU")}` : ""}</p>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums" title="сдали / назначено · прошли · средний балл">
                    {ex.completed}/{ex.assigned} · ✓{ex.passed} · {Math.round(ex.avgScore * 100)}%
                  </span>
                  <button onClick={() => toggleExamResults(ex.id)} className="text-xs text-indigo-600 hover:underline">{openExam === ex.id ? "скрыть" : "результаты"}</button>
                  <button disabled={busy} onClick={() => setConfirm({ msg: `Удалить экзамен «${ex.title}»? Результаты студентов будут удалены.`, danger: true, onYes: () => run(() => api.deleteInstitutionExam(ex.id), "Экзамен удалён") })} className={dangerCls}>удалить</button>
                </div>
                {openExam === ex.id && (
                  <div className="border-t border-gray-100 px-3 py-2">
                    {examResults.length === 0 ? (
                      <p className="text-xs text-gray-400">Загрузка…</p>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody>
                          {examResults.map((r) => (
                            <tr key={r.learnerId} className="border-b border-gray-50 last:border-0">
                              <td className="py-1 text-slate-700">{r.name}</td>
                              <td className="py-1 text-right tabular-nums">
                                {r.completedAt ? (
                                  <span className={r.passed ? "text-green-600 font-medium" : "text-slate-500"}>{r.correct}/{r.total}{r.passed ? " ✓" : ""}</span>
                                ) : (
                                  <span className="text-gray-300">не сдавал(а)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ---- Students pool ---- */}
      <Panel title={T.enrolledStudentsPanel} right={<span className="text-xs text-gray-400">набор, из которого выбирают преподаватели</span>}>
        {students.length === 0 ? (
          <p className="text-sm text-gray-400">Студентов пока нет — поделитесь кодом выше, чтобы они зачислились.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">{T.studentCol}</th>
                <th className="py-2 font-medium">Сегмент</th>
                <th className="py-2 font-medium">{T.levelLabel}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 text-slate-700">{s.name}</td>
                  <td className="py-2 text-gray-500">{s.segment}</td>
                  <td className="py-2 text-gray-500">{s.level}</td>
                  <td className="py-2 text-right">
                    <button
                      disabled={busy}
                      onClick={() => setConfirm({ msg: `Отчислить ${s.name} из учреждения? Студента уберут из всех групп и из набора.`, danger: true, onYes: () => run(() => api.unenrolInstitutionStudent(s.id), "Студент отчислен") })}
                      className={dangerCls}
                    >
                      отчислить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* ---- Confirm modal ---- */}
      {confirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => !busy && setConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-slate-700">{confirm.msg}</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirm(null)} disabled={busy} className="flex-1 border border-gray-300 text-slate-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Отмена</button>
              <button
                onClick={confirm.onYes}
                disabled={busy}
                className={`flex-1 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50 ${confirm.danger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
              >
                {busy ? "…" : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
