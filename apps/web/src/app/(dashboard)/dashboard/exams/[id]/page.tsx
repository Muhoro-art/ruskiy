"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type LearnerExam } from "@/lib/api";
import { auth } from "@/lib/auth";
import { buildTrack, findExam } from "@/curriculum";
import { ExamRunner } from "../../path/CurriculumPath";

// Takes a dean-assigned exam. The exam CONTENT is the existing CEFR level exam
// (from the client curriculum); we run it with recordToPath=false so it stays
// separate from the learner's own Path progression, and post the graded result to
// the assignment. Single attempt: an already-completed exam shows its result.
export default function TakeAssignedExam() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [exam, setExam] = useState<LearnerExam | null>(null);
  const [err, setErr] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    api.getMyExam(id).then(setExam).catch(() => setErr("Экзамен недоступен или не назначен вам."));
  }, [id]);

  const back = (
    <Link href="/dashboard/exams" className="mt-4 inline-block text-sm text-[var(--color-primary)] hover:underline">
      ← Ко всем экзаменам
    </Link>
  );

  if (err)
    return <div className="max-w-2xl mx-auto py-10 px-4"><p className="text-sm text-red-600">{err}</p>{back}</div>;
  if (!exam)
    return <div className="max-w-2xl mx-auto py-10 px-4"><p className="text-sm text-gray-400">Загрузка…</p></div>;

  // Single attempt: if a result already exists (and they didn't just finish), show it.
  if (exam.completedAt && !justSubmitted) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-8 text-center">
          <div className="text-5xl mb-2">{exam.passed ? "🏆" : "📄"}</div>
          <h2 className="text-xl font-bold text-[var(--color-primary)]">{exam.title}</h2>
          <p className="mt-2 text-slate-600">
            Ваш результат: <strong>{exam.correct}/{exam.total}</strong> {exam.passed ? "— сдано ✓" : "— не сдано"}
          </p>
          <p className="text-xs text-gray-400 mt-1">Экзамен можно пройти только один раз.</p>
          {back}
        </div>
      </div>
    );
  }

  const track = buildTrack("core");
  const found = findExam(track, "exam-" + exam.level);
  if (!found)
    return <div className="max-w-2xl mx-auto py-10 px-4"><p className="text-sm text-red-600">Не удалось загрузить экзамен уровня {exam.level}.</p>{back}</div>;

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <ExamRunner
        exam={found.exam}
        level={found.level}
        learnerId={auth.getLearnerId() || ""}
        seenIds={[]}
        recordToPath={false}
        onGraded={(_c, _t, _passed, answers) => {
          setJustSubmitted(true);
          // Send the raw answers; the server re-grades authoritatively.
          api.submitMyExam(id, answers).catch(() => {});
        }}
        onExit={() => router.push("/dashboard/exams")}
      />
    </div>
  );
}
