// Path answer logger: every question answered in a Path lesson/exam is queued
// here and flushed to POST /v1/curriculum/answers in small batches, so the
// teacher's answer sheets can show Path work question-by-question. Losing a
// batch is acceptable (fire-and-forget) — the Path's own progress sync remains
// the source of truth for completion; this is review detail on top.

import { api } from "./api";

export interface PathQuestionLike {
  id: string;
  exerciseType?: string;
  promptEn?: string;
  promptRu?: string;
  textRu?: string;
  correctAnswer?: string;
  answer?: string;
  correctOrder?: string[];
  modelAnswerRu?: string;
  templateRu?: string;
  slots?: Array<{ stem: string; correct: string }>;
  matchPairs?: Array<{ left: string; right: string }>;
  pairs?: Array<{ ru: string; en: string }>;
}

interface QueuedAnswer {
  questionId: string;
  lessonId: string;
  prompt: string;
  response: string;
  correctAnswer: string;
  isCorrect: boolean;
}

let queue: QueuedAnswer[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function asText(resp: unknown): string {
  if (resp == null) return "";
  if (typeof resp === "string") return resp.slice(0, 300);
  if (Array.isArray(resp)) return resp.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ").slice(0, 300);
  if (typeof resp === "object") {
    try { return JSON.stringify(resp).slice(0, 300); } catch { return ""; }
  }
  return String(resp).slice(0, 300);
}

function expectedOf(q: PathQuestionLike): string {
  return (
    q.correctAnswer ||
    q.answer ||
    (q.correctOrder ? q.correctOrder.join(" ") : "") ||
    q.modelAnswerRu ||
    (q.slots ? q.slots.map((s) => s.stem + s.correct).join(", ") : "") ||
    (q.matchPairs ? q.matchPairs.map((p) => `${p.left} → ${p.right}`).join(", ") : "") ||
    (q.pairs ? q.pairs.map((p) => `${p.ru} = ${p.en}`).join(", ") : "")
  ).slice(0, 300);
}

async function flush() {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.slice(0, 100);
  queue = queue.slice(100);
  try {
    await api.recordPathAnswers(batch);
  } catch {
    // Put the batch back (bounded) — next answer or timer retries.
    queue = batch.concat(queue).slice(0, 300);
  }
  if (queue.length > 0 && !timer) timer = setTimeout(flush, 4000);
}

/** Queue one answered Path question. lessonId derives from the question id
 *  (`lesson:idx#n`), so callers only pass the question and the outcome. */
export function logPathAnswer(q: PathQuestionLike, resp: unknown, isCorrect: boolean, responseLabel?: string) {
  if (!q || !q.id) return;
  queue.push({
    questionId: q.id.slice(0, 120),
    lessonId: q.id.split("#")[0].slice(0, 120),
    prompt: (q.promptEn || q.promptRu || q.textRu || q.templateRu || "").slice(0, 300),
    response: (responseLabel || asText(resp)).slice(0, 300),
    correctAnswer: expectedOf(q),
    isCorrect,
  });
  if (queue.length > 300) queue = queue.slice(-300);
  if (!timer) timer = setTimeout(flush, 2500);
}
