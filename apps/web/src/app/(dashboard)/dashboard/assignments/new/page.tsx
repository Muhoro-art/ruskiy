"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type Cohort, type TeacherContent } from "@/lib/api";
import { T } from "@/lib/ru";

const SKILL_OPTIONS = [
  { id: "grammar.cases.nominative", label: "Именительный падеж", category: "Грамматика" },
  { id: "grammar.cases.accusative", label: "Винительный падеж", category: "Грамматика" },
  { id: "grammar.cases.genitive", label: "Родительный падеж", category: "Грамматика" },
  { id: "grammar.cases.dative", label: "Дательный падеж", category: "Грамматика" },
  { id: "grammar.cases.instrumental", label: "Творительный падеж", category: "Грамматика" },
  { id: "grammar.verbs.aspect", label: "Вид глагола", category: "Грамматика" },
  { id: "grammar.verbs.motion", label: "Глаголы движения", category: "Грамматика" },
  { id: "grammar.verbs.present", label: "Настоящее время", category: "Грамматика" },
  { id: "vocab.food", label: "Еда и напитки", category: "Лексика" },
  { id: "vocab.transport", label: "Транспорт", category: "Лексика" },
  { id: "vocab.medical", label: "Медицинская лексика", category: "Лексика" },
  { id: "phonetics.palatalization", label: "Палатализация", category: "Фонетика" },
  { id: "phonetics.stress", label: "Ударение", category: "Фонетика" },
];

// useSearchParams() must sit inside a Suspense boundary for the production build.
export default function NewAssignmentPage() {
  return (
    <Suspense fallback={null}>
      <NewAssignmentInner />
    </Suspense>
  );
}

function NewAssignmentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [title, setTitle] = useState("");
  const [cohort, setCohort] = useState("");
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [minExercises, setMinExercises] = useState(10);
  const [deadline, setDeadline] = useState("");
  // Teacher assignments are ALWAYS timed — 30s per question unless changed here.
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [audience, setAudience] = useState<"all" | "some">("all");
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  // Студия materials (Phase B): the teacher's own items, attachable to this assignment.
  const [myContent, setMyContent] = useState<TeacherContent[]>([]);
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCohorts().then(setCohorts).catch(() => {});
    api.listContent().then(setMyContent).catch(() => {});
  }, []);

  // Reuse: ?from=<assignmentId> prefills the form from a past assignment so a
  // teacher can re-send stored work to a new group or the same one.
  useEffect(() => {
    const from = params.get("from");
    if (!from) return;
    api
      .getAssignments()
      .then((all) => {
        const src = all.find((a) => a.id === from);
        if (!src) return;
        setTitle(src.title);
        setCohort(src.cohortId);
        setSelectedSkills(src.targetSkills);
        setMinExercises(src.minExercises);
        setTimePerQuestion(src.timePerQuestionSec || 30);
      })
      .catch(() => {});
  }, [params]);

  // Audience picker: the cohort's member list comes from the heatmap endpoint
  // (it already returns every member with names).
  useEffect(() => {
    setSelectedStudents([]);
    if (!cohort) {
      setMembers([]);
      return;
    }
    api
      .getCohortHeatmap(cohort)
      .then((hm) => setMembers(hm.students.map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setMembers([]));
  }, [cohort]);

  function toggleSkill(id: string) {
    setSelectedSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }
  function toggleStudent(id: string) {
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function submit() {
    if (!title.trim() || !cohort) {
      setError(T.titleAndCohortRequired);
      return;
    }
    // "Selected students" with nobody selected must NOT silently fall back to the
    // whole cohort — a remedial assignment meant for two students would land on
    // every Home page. Force an explicit choice.
    if (audience === "some" && selectedStudents.length === 0) {
      setError(T.audienceEmptyError);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.createAssignment({
        cohortId: cohort,
        title: title.trim(),
        targetSkills: selectedSkills,
        minExercises,
        deadline: deadline || undefined,
        learnerIds: audience === "some" && selectedStudents.length > 0 ? selectedStudents : undefined,
        contentIds: selectedContent.length > 0 ? selectedContent : undefined,
        timePerQuestionSec: timePerQuestion > 0 ? timePerQuestion : undefined,
      });
      router.push("/dashboard/assignments");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать задание");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-4">
        <Link href="/dashboard/assignments" className="hover:text-[var(--color-primary)]">
          {T.breadcrumbAssignments}
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)]">{T.newAssignmentTitle}</span>
      </div>

      <h1 className="text-3xl font-bold text-[var(--color-primary)] mb-8">{T.newAssignmentTitle}</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">{T.assignmentTitleLabel}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={T.assignmentTitlePh}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
          />
        </div>

        {/* Cohort */}
        <div>
          <label className="block text-sm font-medium mb-2">{T.cohortLabel}</label>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
          >
            <option value="">{cohorts.length ? T.selectCohort : T.noCohortsCreateFirst}</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Audience: whole cohort or specific students */}
        {cohort && (
          <div>
            <label className="block text-sm font-medium mb-2">{T.audienceLabel}</label>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setAudience("all")}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  audience === "all" ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {T.audienceAll}
              </button>
              <button
                type="button"
                onClick={() => setAudience("some")}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  audience === "some" ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {T.audienceSome}
              </button>
            </div>
            {audience === "some" && (
              <>
                <p className="text-xs text-[var(--color-text-muted)] mb-2">{T.audienceHint}</p>
                {members.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">{T.noStudentsYet}</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleStudent(m.id)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selectedStudents.includes(m.id)
                            ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)] font-medium"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Студия materials (Phase B) */}
        {myContent.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Материалы из Студии{" "}
              <span className="text-[var(--color-text-muted)] font-normal">(необязательно — ученики пройдут их прямо в задании)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {myContent.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedContent((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                  className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                    selectedContent.includes(c.id)
                      ? "border-[var(--color-gold)] bg-amber-50 text-amber-800"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="font-medium">{c.title}</span>
                  <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">
                    {c.exerciseType === "composite" ? "Составное задание" : c.exerciseType} · {c.cefrLevel}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Target Skills */}
        <div>
          <label className="block text-sm font-medium mb-2">
            {T.targetSkillsLabel} <span className="text-[var(--color-text-muted)] font-normal">{T.targetSkillsHint}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SKILL_OPTIONS.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggleSkill(skill.id)}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  selectedSkills.includes(skill.id)
                    ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="font-medium">{skill.label}</span>
                <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">{skill.category}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">{T.minExercisesLabel}</label>
            <input
              type="number"
              value={minExercises}
              onChange={(e) => setMinExercises(Number(e.target.value))}
              min={5}
              max={50}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{T.deadlineLabel}</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              {T.timePerQuestionLabel}{" "}
              <span className="text-[var(--color-text-muted)] font-normal">{T.timePerQuestionHint}</span>
            </label>
            <input
              type="number"
              value={timePerQuestion}
              onChange={(e) => setTimePerQuestion(Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
              min={0}
              max={600}
              step={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>{T.howAdaptiveTitle}</strong> {T.howAdaptiveBody}
          </p>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}

        <div className="flex gap-3 pt-4">
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 bg-[var(--color-primary)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--color-primary-light)] transition-colors disabled:opacity-50"
          >
            {submitting ? T.creating : T.createAssignment}
          </button>
          <Link
            href="/dashboard/assignments"
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors text-center"
          >
            {T.cancel}
          </Link>
        </div>
      </div>
    </div>
  );
}
