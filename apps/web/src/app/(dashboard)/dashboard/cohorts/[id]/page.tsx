"use client";

// Группа = КЛАСС. Вид сверху: доска, стол преподавателя и ученики за партами.
// Клик по парте — карточка ученика с его данными и действиями; выбор нескольких
// парт (или всех) — назначение готовых материалов именно этим ученикам.
// «Карта навыков» — вторая вкладка с честной аналитикой по темам и навыкам.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useToasts, ToastStack } from "@/components/Toasts";
import {
  api,
  type Heatmap,
  type HeatmapRow,
  type LearnerBrief,
  type CohortInvite,
  type RosterStudent,
  type TeacherContent,
  type StudentAssignmentStatus,
} from "@/lib/api";
import { T } from "@/lib/ru";
import { subscribeEvents } from "@/lib/live";
import { CohortReportView } from "@/components/dashboard/CohortReportView";

// Per-question result → compact Russian badge for the teacher's drill-down.
function resultBadge(result: string): { icon: string; cls: string; label: string } {
  if (result === "correct") return { icon: "✓", cls: "bg-green-50 text-green-700 border-green-200", label: "верно" };
  if (result === "timeout") return { icon: "⏱", cls: "bg-amber-50 text-amber-700 border-amber-200", label: "время вышло — не отвечено" };
  if (result === "viewed" || result === "done") return { icon: "👁", cls: "bg-gray-50 text-gray-500 border-gray-200", label: "просмотрено" };
  const frac = /^(\d+)\/(\d+)$/.exec(result);
  if (frac) {
    return frac[1] === frac[2]
      ? { icon: "✓", cls: "bg-green-50 text-green-700 border-green-200", label: `все пары (${frac[2]})` }
      : { icon: frac[0], cls: "bg-amber-50 text-amber-700 border-amber-200", label: `${frac[1]} из ${frac[2]} пар` };
  }
  return { icon: "✗", cls: "bg-red-50 text-red-600 border-red-200", label: "неверно" };
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Выбор ответа", fill_blank: "Пропуск", word_scramble: "Собери слово",
  matching: "Соответствия", sentence_builder: "Собери предложение", listening: "Аудирование",
  memory_match: "Мемори", drag_endings: "Окончания", free_response: "Свободный ответ",
  dialogue: "Диалог", composite: "Составное задание",
};

function getHeatColor(value: number): string {
  if (value >= 0.8) return "bg-green-100 text-green-800";
  if (value >= 0.6) return "bg-green-50 text-green-700";
  if (value >= 0.4) return "bg-yellow-50 text-yellow-700";
  if (value >= 0.25) return "bg-orange-50 text-orange-700";
  return "bg-red-50 text-red-700";
}
function getHeatBg(value: number): string {
  if (value >= 0.8) return "#22c55e";
  if (value >= 0.6) return "#86efac";
  if (value >= 0.4) return "#fde047";
  if (value >= 0.25) return "#fb923c";
  return "#ef4444";
}
function masteryBadge(v: number): string {
  if (v >= 0.8) return "bg-green-100 text-green-800";
  if (v >= 0.4) return "bg-yellow-50 text-yellow-700";
  return "bg-red-50 text-red-700";
}
// Topic ids look like "b1-wordformation" — make them readable.
function topicLabel(id: string): string {
  const s = id.replace(/^[abc][12][-_]?/i, "").replace(/[-_]/g, " ").trim() || id;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400e3);
}

// One honest grid: unattempted cells are a grey dash (never a red 0), and every
// average — per student and per column — is over ATTEMPTED cells only.
function HeatGrid({
  cols,
  rows,
  onCell,
}: {
  cols: Array<{ id: string; name: string }>;
  rows: HeatmapRow[];
  onCell: (student: string, skill: string, score: number) => void;
}) {
  const colAvg = cols.map((_, c) => {
    const vals = rows.filter((r) => r.attempted?.[c]).map((r) => r.scores[c] || 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-xs font-medium text-[var(--color-text-muted)] pb-3 pr-4 w-36">{T.studentCol}</th>
            {cols.map((s) => (
              <th key={s.id} className="text-center text-xs font-medium text-[var(--color-text-muted)] pb-3 px-1" title={s.name}>
                {s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name}
              </th>
            ))}
            <th className="text-center text-xs font-medium text-[var(--color-text-muted)] pb-3 px-2">Сред.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student) => {
            const attemptedVals = cols.map((_, i) => (student.attempted?.[i] ? student.scores[i] || 0 : null)).filter((v): v is number => v !== null);
            const avg = attemptedVals.length ? attemptedVals.reduce((a, b) => a + b, 0) / attemptedVals.length : null;
            return (
              <tr key={student.id}>
                <td className="py-1 pr-4">
                  <Link href={`/dashboard/students/${student.id}`} className="text-sm font-medium hover:text-[var(--color-primary)]">
                    {student.name}
                  </Link>
                </td>
                {cols.map((s, i) => {
                  const attempted = !!student.attempted?.[i];
                  const score = student.scores[i] || 0;
                  return (
                    <td key={s.id} className="py-1 px-1">
                      {attempted ? (
                        <button
                          onClick={() => onCell(student.name, s.name, score)}
                          className={`w-full py-2 rounded text-xs font-semibold hover:ring-2 hover:ring-[var(--color-primary)] transition-all ${getHeatColor(score)}`}
                          style={{ opacity: 0.6 + score * 0.4 }}
                        >
                          {Math.round(score * 100)}
                        </button>
                      ) : (
                        <div className="w-full py-2 rounded text-xs text-center text-gray-300 bg-gray-50" title="Не пробовал(а)">—</div>
                      )}
                    </td>
                  );
                })}
                <td className="py-1 px-2">
                  {avg === null ? (
                    <span className="text-xs text-gray-300">—</span>
                  ) : (
                    <span className="text-sm font-bold text-[var(--color-primary)]">{Math.round(avg * 100)}%</span>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-gray-200">
            <td className="py-2 pr-4 text-xs font-bold text-[var(--color-text-muted)]">{T.classAvg}</td>
            {colAvg.map((avg, i) => (
              <td key={i} className="py-2 px-1 text-center">
                {avg === null ? (
                  <span className="text-xs text-gray-300">—</span>
                ) : (
                  <div className="text-xs font-bold rounded py-1" style={{ backgroundColor: getHeatBg(avg) + "30", color: getHeatBg(avg) }}>
                    {Math.round(avg * 100)}
                  </div>
                )}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function CohortDetailPage() {
  const params = useParams();
  const cohortId = String(params.id);
  const [tab, setTab] = useState<"class" | "map" | "report">("class");
  const [cohortName, setCohortName] = useState("");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [hm, setHm] = useState<Heatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCell, setSelectedCell] = useState<{ student: string; skill: string; score: number } | null>(null);
  // invites
  const [showInvite, setShowInvite] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LearnerBrief[]>([]);
  const [searching, setSearching] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<CohortInvite[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  // classroom
  const [openStudent, setOpenStudent] = useState<RosterStudent | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Per-student drill-down: which assignments they did / didn't, with results.
  const [stuAssign, setStuAssign] = useState<StudentAssignmentStatus[] | null>(null);
  const [openResult, setOpenResult] = useState<string | null>(null);
  // Removing a student from the group (two-step confirm inside the drawer).
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Live updates: refs give the polling interval the CURRENT roster/drawer
  // without re-arming the timer on every render.
  const { toasts, push: pushToast, dismiss } = useToasts();
  const rosterRef = useRef<RosterStudent[]>([]);
  const openStudentRef = useRef<RosterStudent | null>(null);
  openStudentRef.current = openStudent;
  // assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [materials, setMaterials] = useState<TeacherContent[]>([]);
  const [chosenMaterial, setChosenMaterial] = useState("");
  const [assignTitle, setAssignTitle] = useState("");
  const [assignDeadline, setAssignDeadline] = useState("");
  const [assignTimer, setAssignTimer] = useState(30); // сек на вопрос (задания всегда с таймером)
  const [assignMsg, setAssignMsg] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function loadAll() {
    try {
      const [r, h] = await Promise.all([api.getCohortRoster(cohortId), api.getCohortHeatmap(cohortId)]);
      rosterRef.current = r;
      setRoster(r);
      setHm(h);
      if (h.joinCode) setJoinCode(h.joinCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить группу");
    } finally {
      setLoading(false);
    }
  }
  async function removeStudent(s: RosterStudent) {
    setRemoving(true);
    try {
      await api.removeCohortMember(cohortId, s.id);
      setOpenStudent(null);
      setConfirmRemove(false);
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(s.id);
        return n;
      });
      await loadAll();
      pushToast(`${s.name} удалён(а) из группы.`);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не удалось удалить ученика");
    } finally {
      setRemoving(false);
    }
  }
  async function loadInvites() {
    try {
      const inv = await api.getCohortInvites(cohortId);
      setPending(inv);
      setInvitedIds(new Set(inv.map((i) => i.learnerId)));
    } catch { /* non-fatal */ }
  }
  useEffect(() => {
    loadAll();
    loadInvites();
    api.getCohorts().then((cs) => setCohortName(cs.find((c) => c.id === cohortId)?.name || "")).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  // Live classroom: the server pushes an SSE poke the instant a student
  // finishes a task; a 15s poll stays as the fallback. Both paths run the SAME
  // diff-based refresh (desk chips, open drawer, toast) — one toast per change.
  useEffect(() => {
    const refresh = async () => {
      try {
        const fresh = await api.getCohortRoster(cohortId);
        const prev = new Map(rosterRef.current.map((s) => [s.id, s]));
        for (const s of fresh) {
          const old = prev.get(s.id);
          if (old && s.completedCount > old.completedCount) {
            pushToast(`✓ ${s.name} выполнил(а) задание — теперь ${s.completedCount} из ${s.assignedCount}`);
          }
        }
        rosterRef.current = fresh;
        setRoster(fresh);
        const open = openStudentRef.current;
        if (open) {
          const upd = fresh.find((s) => s.id === open.id);
          if (upd) setOpenStudent(upd);
          api.getStudentAssignments(cohortId, open.id).then(setStuAssign).catch(() => {});
        }
      } catch {
        /* transient network blip — the next tick retries */
      }
    };
    const iv = setInterval(refresh, 15000);
    const unsubscribe = subscribeEvents((e) => {
      if (e.type === "assignment_completed") refresh();
    });
    return () => {
      clearInterval(iv);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  // Load the opened student's assignment statuses (done/not-done + results).
  useEffect(() => {
    setStuAssign(null);
    setOpenResult(null);
    setConfirmRemove(false);
    if (!openStudent) return;
    let stale = false;
    api
      .getStudentAssignments(cohortId, openStudent.id)
      .then((list) => { if (!stale) setStuAssign(list); })
      .catch(() => { if (!stale) setStuAssign([]); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStudent?.id]);

  async function search() {
    setSearching(true);
    try { setResults(await api.searchLearners(query)); } catch { setResults([]); } finally { setSearching(false); }
  }
  async function invite(learnerId: string) {
    try {
      await api.inviteCohortMember(cohortId, learnerId);
      setInvitedIds((s) => new Set(s).add(learnerId));
      loadInvites();
    } catch { /* ignore */ }
  }
  async function rotateCode() {
    if (joinCode && !window.confirm(T.rotateConfirm)) return;
    try {
      const r = await api.rotateCohortCode(cohortId);
      setJoinCode(r.joinCode);
      setCodeCopied(false);
    } catch { /* ignore */ }
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch { /* ignore */ }
  }

  // ---- classroom actions ----
  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function openAssign(forIds: string[]) {
    setSelected(new Set(forIds));
    setAssignTitle("");
    setChosenMaterial("");
    setAssignDeadline("");
    setAssignTimer(30);
    setAssignMsg("");
    setAssignOpen(true);
    if (materials.length === 0) {
      Promise.allSettled([api.listContent(), api.getGlobalContent()]).then(([own, glob]) => {
        const mine = own.status === "fulfilled" ? own.value : [];
        const pool = glob.status === "fulfilled" ? glob.value : [];
        const seen = new Set(mine.map((m) => m.id));
        setMaterials([...mine, ...pool.filter((g) => !seen.has(g.id))]);
      });
    }
  }
  async function submitAssign() {
    if (!chosenMaterial) { setAssignMsg("Выберите материал."); return; }
    const mat = materials.find((m) => m.id === chosenMaterial);
    setAssigning(true);
    setAssignMsg("");
    try {
      await api.createAssignment({
        cohortId,
        title: assignTitle.trim() || (mat ? mat.title : "Материал от учителя"),
        targetSkills: [],
        minExercises: 5,
        deadline: assignDeadline || undefined,
        learnerIds: selected.size > 0 && selected.size < roster.length ? [...selected] : undefined,
        contentIds: [chosenMaterial],
        timePerQuestionSec: assignTimer > 0 ? assignTimer : undefined,
      });
      setAssignMsg(`✓ Назначено ${selected.size > 0 && selected.size < roster.length ? `${selected.size} учен.` : "всей группе"}.`);
      setSelected(new Set());
      loadAll(); // desks show ✓ done/assigned counts — refresh them
      setTimeout(() => setAssignOpen(false), 1200);
    } catch (e) {
      setAssignMsg((e as Error).message || "Не удалось назначить");
    } finally {
      setAssigning(false);
    }
  }

  const enrolledIds = new Set(roster.map((s) => s.id));
  const skills = hm?.skills || [];
  const students = hm?.students || [];
  const topics = useMemo(() => (hm?.topics || []).map((t) => ({ ...t, name: topicLabel(t.name) })), [hm]);
  const topicRows = hm?.topicRows || [];
  // Collapse never-started students out of the grids — a wall of dashes tells
  // the teacher nothing; one line naming them tells everything.
  const activeTopicRows = topicRows.filter((r) => r.attempted?.some(Boolean));
  // "Not started" must not contradict the grids: a student who answered SOME
  // questions mid-lesson (topic data) without finishing a lesson (hasWork false)
  // belongs in the grid, not in the idle line.
  const hasGridData = new Set([
    ...activeTopicRows.map((r) => r.id),
    ...students.filter((r) => r.attempted?.some(Boolean)).map((r) => r.id),
  ]);
  const idleNames = roster.filter((r) => !r.hasWork && !hasGridData.has(r.id)).map((r) => r.name);

  if (loading) return <div className="text-[var(--color-text-muted)] py-12 text-center">{T.loading}</div>;
  if (error)
    return (
      <div className="max-w-2xl">
        <Link href="/dashboard/cohorts" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">← {T.cohortsTitle}</Link>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center mt-4">
          <p className="font-semibold text-[var(--color-primary)]">
            {/permission|forbidden|unauthorized/i.test(error) ? T.teacherAccessRequired : "Не удалось загрузить группу"}
          </p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">{error}</p>
        </div>
      </div>
    );

  return (
    <div className="max-w-7xl">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard/cohorts" className="hover:text-[var(--color-primary)]">{T.cohortsTitle}</Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">{cohortName || "Группа"}</span>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-primary)]">{cohortName || "Группа"}</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            {roster.length} учен. · {roster.filter((r) => r.hasWork).length} приступили · {roster.filter((r) => (daysSince(r.lastActive) ?? 99) <= 7).length} активны за неделю
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setTab("class")}
              className={`px-4 py-2 text-sm font-medium ${tab === "class" ? "bg-[var(--color-primary)] text-white" : "bg-white text-slate-700 hover:bg-gray-50"}`}>
              🏫 Класс
            </button>
            <button onClick={() => setTab("map")}
              className={`px-4 py-2 text-sm font-medium ${tab === "map" ? "bg-[var(--color-primary)] text-white" : "bg-white text-slate-700 hover:bg-gray-50"}`}>
              📊 Карта навыков
            </button>
            <button onClick={() => setTab("report")}
              className={`px-4 py-2 text-sm font-medium ${tab === "report" ? "bg-[var(--color-primary)] text-white" : "bg-white text-slate-700 hover:bg-gray-50"}`}>
              📅 Отчёт
            </button>
          </div>
          <button onClick={() => setShowInvite((v) => !v)}
            className="border border-gray-300 text-gray-700 font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            {T.inviteStudents}
          </button>
        </div>
      </div>

      {showInvite && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">{T.joinCode}</h3>
            <div className="flex items-center gap-3">
              {joinCode ? (
                <>
                  <span className="font-mono text-lg tracking-widest bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">{joinCode}</span>
                  <button onClick={copyCode} className="text-sm border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50">
                    {codeCopied ? T.copied : T.copy}
                  </button>
                  <button onClick={rotateCode} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] underline">
                    {T.rotateCode}
                  </button>
                </>
              ) : (
                <button onClick={rotateCode} className="bg-[var(--color-accent)] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90">
                  {T.generateCode}
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">{T.codeHint}</p>
          </div>
          <hr className="border-gray-100" />
          <div>
            <div className="flex gap-3 mb-3">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()} placeholder={T.searchPh}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
              <button onClick={search} className="bg-[var(--color-primary)] text-white font-semibold px-5 rounded-lg">
                {searching ? "…" : T.search}
              </button>
            </div>
            {results.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">{searching ? T.searching : T.searchHint}</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {results.map((l) => {
                  const already = enrolledIds.has(l.id);
                  const wasInvited = invitedIds.has(l.id);
                  return (
                    <div key={l.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="text-sm font-medium">{l.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-2">{l.level} · {l.segment}</span>
                      </div>
                      <button onClick={() => invite(l.id)} disabled={already || wasInvited}
                        className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${
                          already || wasInvited ? "bg-gray-100 text-gray-400" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)]"
                        }`}>
                        {already ? T.enrolled : wasInvited ? T.invited : T.invite}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {pending.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">{T.pendingInvites}</h4>
                <div className="flex flex-wrap gap-2">
                  {pending.map((iv) => (
                    <span key={iv.id} className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1">
                      {iv.learnerName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================== КЛАСС ============================== */}
      {tab === "class" && (
        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0">
            {/* selection action bar */}
            <div className="flex items-center gap-3 mb-3 text-sm">
              <button onClick={() => setSelected(new Set(roster.map((r) => r.id)))} className="text-[var(--color-primary)] hover:underline">
                Выбрать всех
              </button>
              {selected.size > 0 && (
                <>
                  <button onClick={() => setSelected(new Set())} className="text-[var(--color-text-muted)] hover:underline">Снять выбор</button>
                  <span className="text-[var(--color-text-muted)]">Выбрано: <strong className="text-[var(--color-text)]">{selected.size}</strong></span>
                  <button onClick={() => openAssign([...selected])}
                    className="ml-auto bg-[var(--color-primary)] text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-[var(--color-primary-light)]">
                    📚 Назначить материал выбранным
                  </button>
                </>
              )}
              {selected.size === 0 && (
                <button onClick={() => openAssign(roster.map((r) => r.id))}
                  className="ml-auto border border-gray-300 text-slate-700 font-medium px-4 py-1.5 rounded-lg hover:bg-gray-50">
                  📚 Назначить материал всей группе
                </button>
              )}
            </div>

            {/* the classroom, viewed from above */}
            <div className="rounded-2xl border border-[#e5ddd0] bg-[#faf6ef] p-6">
              {/* whiteboard */}
              <div className="mx-auto w-3/4 h-12 bg-white border-2 border-slate-200 rounded-lg shadow-sm flex items-center justify-center mb-2">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Доска</span>
              </div>
              {/* teacher's desk */}
              <div className="mx-auto w-44 h-10 bg-[#e8dcc8] border border-[#d9c9ae] rounded-lg flex items-center justify-center mb-8">
                <span className="text-[11px] text-[#8a7550]">Стол преподавателя</span>
              </div>

              {roster.length === 0 ? (
                <p className="text-center text-sm text-[var(--color-text-muted)] py-10">{T.noStudentsYet}</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-8">
                  {roster.map((s) => {
                    const days = daysSince(s.lastActive);
                    const dot = days === null ? "bg-gray-300" : days <= 7 ? "bg-green-500" : days <= 14 ? "bg-amber-400" : "bg-red-400";
                    const dotTitle = days === null ? "никогда не был(а) активен(на)" : days === 0 ? "активен(на) сегодня" : `активность: ${days} дн. назад`;
                    const isSel = selected.has(s.id);
                    return (
                      <div key={s.id} className="flex flex-col items-center">
                        {/* desk */}
                        <button
                          onClick={() => setOpenStudent(s)}
                          className={`relative w-full bg-white rounded-lg border-2 px-3 pt-2.5 pb-2 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                            isSel ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20" : "border-[#e2d7c3]"
                          }`}
                        >
                          <span className={`absolute top-2 left-2 w-2.5 h-2.5 rounded-full ${dot}`} title={dotTitle} />
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleSelect(s.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-1.5 right-1.5 w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
                            title="Выбрать для группового действия"
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <span className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center text-xs font-bold shrink-0">
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-sm font-medium text-slate-800 truncate">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{s.level}</span>
                            {s.hasWork ? (
                              <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${masteryBadge(s.effMastery)}`}>
                                {Math.round(s.effMastery * 100)}%
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">не начал(а)</span>
                            )}
                            {/* assignments at a glance: done / assigned, green when everything is in */}
                            {s.assignedCount > 0 && (
                              <span
                                className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                                  s.completedCount >= s.assignedCount
                                    ? "bg-green-100 text-green-700"
                                    : s.completedCount > 0
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-gray-100 text-gray-500"
                                }`}
                                title={
                                  s.lastCompletedAt
                                    ? `заданий выполнено: ${s.completedCount} из ${s.assignedCount} · последнее: ${new Date(s.lastCompletedAt).toLocaleString("ru-RU")}`
                                    : `заданий выполнено: ${s.completedCount} из ${s.assignedCount}`
                                }
                              >
                                ✓ {s.completedCount}/{s.assignedCount}
                              </span>
                            )}
                          </div>
                        </button>
                        {/* chair */}
                        <div className="w-10 h-3 bg-[#d9c9ae] rounded-b-lg mt-0.5" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-3">
              Точка на парте — активность (зелёная: за неделю, жёлтая: до двух недель, красная: дольше). Процент — освоенный материал.
              «✓ 2/3» — выполненные задания из назначенных (зелёный — всё сдано; наведите, чтобы увидеть, когда было последнее).
              Клик по парте — данные ученика; галочки — выбор для групповых действий.
            </p>
          </div>

          {/* student drawer */}
          {openStudent && (
            <aside className="w-80 shrink-0 bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-lg font-bold">
                    {openStudent.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-bold text-slate-800">{openStudent.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{T.levelLabel} {openStudent.level}</p>
                  </div>
                </div>
                <button onClick={() => setOpenStudent(null)} className="text-gray-400 hover:text-slate-700">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Прогресс</p>
                  <p className="text-lg font-bold text-slate-800">{openStudent.hasWork ? `${Math.round(openStudent.effMastery * 100)}%` : "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{T.lessonsWorked}</p>
                  <p className="text-lg font-bold text-slate-800">{openStudent.curriculumLessons}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">XP</p>
                  <p className="text-lg font-bold text-slate-800">{openStudent.totalXp.toLocaleString("ru-RU")}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Активность</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {openStudent.lastActive ? new Date(openStudent.lastActive).toLocaleDateString("ru-RU") : T.never}
                  </p>
                </div>
              </div>
              {/* assignment drill-down: EVERY assignment, done or not, with the
                  per-question results of the single recorded attempt */}
              <div className="bg-gray-50 rounded-lg p-2.5 mt-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Задания</p>
                  {openStudent.assignedCount > 0 && (
                    <p className="text-[10px] text-gray-400">
                      {openStudent.completedCount} из {openStudent.assignedCount} выполнено
                    </p>
                  )}
                </div>
                {stuAssign === null ? (
                  <p className="text-sm text-gray-400 mt-1">Загрузка…</p>
                ) : stuAssign.length === 0 ? (
                  <p className="text-sm text-gray-400 mt-1">заданий пока нет</p>
                ) : (
                  <div className="mt-1.5 space-y-1 max-h-72 overflow-y-auto pr-1">
                    {stuAssign.map((a) => {
                      const done = !!a.completedAt;
                      const open = openResult === a.id;
                      return (
                        <div key={a.id} className="bg-white border border-gray-100 rounded-lg px-2 py-1.5">
                          <button
                            onClick={() => done && setOpenResult(open ? null : a.id)}
                            className={`w-full flex items-center gap-2 text-left ${done ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <span className={`shrink-0 text-xs ${done ? "text-green-600" : "text-gray-300"}`}>{done ? "✓" : "○"}</span>
                            <span className="flex-1 min-w-0 text-xs font-medium text-slate-700 truncate" title={a.title}>{a.title}</span>
                            {done ? (
                              <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                                {a.scoreTotal > 0 ? `${a.scoreCorrect}/${a.scoreTotal}` : "—"} {open ? "▾" : "▸"}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] text-amber-600">не выполнено</span>
                            )}
                          </button>
                          {(done || a.contentCount === 0) && (
                            <div className="flex items-center justify-between gap-2 mt-0.5 ml-5">
                              <p className="text-[10px] text-gray-400">
                                {done
                                  ? new Date(a.completedAt as string).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                                  : ""}
                              </p>
                              {/* Полный разбор в новой вкладке — карточка остаётся компактной. */}
                              <a
                                href={`/dashboard/cohorts/${cohortId}/answers/${openStudent.id}/${a.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-medium text-indigo-600 hover:underline shrink-0"
                              >
                                Ответы ↗
                              </a>
                            </div>
                          )}
                          {open && (
                            <div className="mt-1.5 ml-5 space-y-1.5">
                              {(a.results || []).length === 0 ? (
                                <p className="text-[10px] text-gray-400">
                                  {a.contentCount === 0
                                    ? "практика в адаптивном режиме / Пути — по вопросам не записывается"
                                    : "детали ответов не записаны (старое задание)"}
                                </p>
                              ) : (
                                a.results.map((it, k) => (
                                  <div key={k}>
                                    <p className="text-[10px] text-gray-500 truncate" title={it.title}>{it.title}</p>
                                    <div className="space-y-1 mt-0.5">
                                      {it.steps.map((s, j) => {
                                        const b = resultBadge(s.result);
                                        const missed = s.result !== "correct" && s.result !== "viewed" && s.result !== "done";
                                        return (
                                          <div key={j} className="flex items-start gap-1.5">
                                            <span
                                              title={`Вопрос ${s.i} · ${TYPE_LABEL[s.type] || s.type} — ${b.label}`}
                                              className={`text-[10px] font-semibold border rounded px-1.5 py-0.5 shrink-0 ${b.cls}`}
                                            >
                                              {s.i} {b.icon}
                                            </span>
                                            <div className="min-w-0 text-[10px] leading-snug">
                                              {s.prompt && <p className="text-slate-600">{s.prompt}</p>}
                                              {/* Ответ ученика виден ВСЕГДА — и верный, и неверный. */}
                                              {!missed && s.given && (
                                                <p className="text-gray-400">
                                                  ответ: <span className="text-green-600 font-medium">{s.given}</span>
                                                </p>
                                              )}
                                              {missed && (
                                                <p className="text-gray-400">
                                                  {s.result === "timeout" ? (
                                                    <span className="text-amber-600">без ответа — время вышло</span>
                                                  ) : (
                                                    s.given && (
                                                      <>
                                                        ответ: <span className="text-red-500 font-medium">{s.given}</span>
                                                      </>
                                                    )
                                                  )}
                                                  {s.expected && (
                                                    <>
                                                      {" · "}верно: <span className="text-green-600 font-medium">{s.expected}</span>
                                                    </>
                                                  )}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {!openStudent.hasWork && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
                  Ещё не приступал(а) к занятиям — назначьте материал или напомните о платформе.
                </p>
              )}

              <div className="space-y-2 mt-4">
                <button onClick={() => openAssign([openStudent.id])}
                  className="w-full bg-[var(--color-primary)] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[var(--color-primary-light)]">
                  📚 Назначить материал
                </button>
                <Link href={`/dashboard/students/${openStudent.id}`}
                  className="block w-full text-center border border-gray-300 text-slate-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                  Полный отчёт →
                </Link>
                {confirmRemove ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                    <p className="text-xs text-red-700 mb-2">
                      Удалить <span className="font-semibold">{openStudent.name}</span> из группы? Ученик потеряет доступ к заданиям этой группы (прогресс сохранится).
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setConfirmRemove(false)} disabled={removing}
                        className="flex-1 border border-gray-300 text-slate-700 text-sm font-medium py-1.5 rounded-lg hover:bg-white disabled:opacity-50">
                        Отмена
                      </button>
                      <button onClick={() => removeStudent(openStudent)} disabled={removing}
                        className="flex-1 bg-red-600 text-white text-sm font-semibold py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50">
                        {removing ? "Удаление…" : "Да, удалить"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRemove(true)}
                    className="w-full border border-red-200 text-red-600 text-sm font-medium py-2 rounded-lg hover:bg-red-50">
                    Удалить из группы
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}

      {/* ============================ КАРТА НАВЫКОВ ============================ */}
      {tab === "map" && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm text-blue-800">
            <strong>Как читать карту:</strong> строка — ученик, колонка — тема Пути или навык из адаптивных сессий.
            Цвет ячейки — точность ответов (зелёный — хорошо, красный — слабое место). Прочерк — ученик этого ещё не пробовал.
            Ученики без занятий вынесены в строку под таблицей. Нажмите ячейку, чтобы увидеть рекомендацию.
          </div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              {roster.length} учен. · {topics.length} тем Пути · {skills.length} адаптивных навыков
            </p>
            <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 text-center leading-3 text-gray-300">–</span> не пробовал(а)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> &lt;25%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400" /> 25-40%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400" /> 40-60%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-300" /> 60-80%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> &gt;80%</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-bold text-[var(--color-text)] mb-1">Темы курса (Путь)</h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Точность по темам из пройденных уроков Пути — только реальные попытки.</p>
            {topics.length === 0 ? (
              <p className="text-sm text-gray-400">Ученики ещё не проходили уроки Пути — темы появятся после первых занятий.</p>
            ) : activeTopicRows.length === 0 ? (
              <p className="text-sm text-gray-400">Пока никто из учеников не занимался по этим темам.</p>
            ) : (
              <HeatGrid cols={topics} rows={activeTopicRows} onCell={(student, skill, score) => setSelectedCell({ student, skill, score })} />
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-bold text-[var(--color-text)] mb-1">Адаптивные навыки</h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Уверенность по навыкам из адаптивных сессий — колонки есть только у реально затронутых навыков.</p>
            {skills.length === 0 ? (
              <p className="text-sm text-gray-400">Ученики ещё не занимались в адаптивном режиме — колонки появятся после первых попыток.</p>
            ) : (
              <HeatGrid cols={skills} rows={students.filter((r) => r.attempted?.some(Boolean))} onCell={(student, skill, score) => setSelectedCell({ student, skill, score })} />
            )}
          </div>

          {idleNames.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-800">
              <strong>Ещё не начали ({idleNames.length}):</strong> {idleNames.join(", ")} — пригласите их на платформу или назначьте первый материал во вкладке «Класс».
            </div>
          )}

          {selectedCell && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--color-primary)]">{selectedCell.student} — {selectedCell.skill}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Уверенность: {Math.round(selectedCell.score * 100)}% ·{" "}
                  {selectedCell.score < 0.4 ? T.needsFocused : selectedCell.score < 0.7 ? T.developing : T.onTrack}
                </p>
              </div>
              <button onClick={() => setSelectedCell(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg">✕</button>
            </div>
          )}
        </>
      )}

      {/* ============================ ОТЧЁТ ============================ */}
      {tab === "report" && <CohortReportView cohortId={cohortId} />}

      {/* ======================== assign modal ======================== */}
      {assignOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setAssignOpen(false)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[var(--color-primary)] mb-1">Назначить материал</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Кому:{" "}
              <strong className="text-[var(--color-text)]">
                {selected.size > 0 && selected.size < roster.length
                  ? roster.filter((r) => selected.has(r.id)).map((r) => r.name).join(", ")
                  : "всей группе"}
              </strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Материал (ваши + одобренные платформой)</label>
                <select value={chosenMaterial} onChange={(e) => setChosenMaterial(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">{materials.length ? "Выберите материал…" : "Загрузка…"}</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} · {TYPE_LABEL[m.exerciseType] || m.exerciseType} · {m.cefrLevel}{m.authorName ? ` · ${m.authorName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Название задания (необязательно)</label>
                <input value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} placeholder="по умолчанию — название материала"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Срок (необязательно)</label>
                <input type="date" value={assignDeadline} onChange={(e) => setAssignDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {T.timePerQuestionLabel} <span className="text-[var(--color-text-muted)] font-normal">{T.timePerQuestionHint}</span>
                </label>
                <input type="number" min={0} max={600} step={5} value={assignTimer}
                  onChange={(e) => setAssignTimer(Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            {assignMsg && <p className={`text-sm mt-3 ${assignMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{assignMsg}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={submitAssign} disabled={assigning}
                className="flex-1 bg-[var(--color-primary)] text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-[var(--color-primary-light)] disabled:opacity-50">
                {assigning ? "Назначаем…" : "Назначить"}
              </button>
              <button onClick={() => setAssignOpen(false)} className="px-5 border border-gray-300 rounded-lg text-sm text-slate-700 hover:bg-gray-50">
                {T.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
