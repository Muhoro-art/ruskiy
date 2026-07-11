// Per-learner progress + question sampling, persisted in localStorage.
//
// Two ideas live here:
//  1. No-repeat sampling: each attempt draws fresh questions the learner hasn't
//     seen yet (tracked per lesson / per exam), cycling only once the bank is
//     exhausted — so retaking a test means new questions, not the same ticks.
//  2. Mastery + exam gating: lessons need MASTERY_THRESHOLD; a level's exam needs
//     EXAM_PASS_THRESHOLD; the next step unlocks only when the previous completes.

import type { Question } from "./types";

export interface LessonProgress {
  mastered: boolean;
  bestScore: number;
  attempts: number;
  seenQuestionIds: string[];
  /** True if completed via placement (tested out), not by actually doing it. */
  placedOut?: boolean;
}

export interface ExamProgress {
  passed: boolean;
  bestScore: number;
  attempts: number;
  seenQuestionIds: string[];
  /** True if completed via placement (tested out), not by actually doing it. */
  placedOut?: boolean;
}

export interface TopicStat {
  correct: number;
  total: number;
}

export interface ProgressMap {
  lessons: Record<string, LessonProgress>;
  exams: Record<string, ExamProgress>;
  /** Rolling per-topic accuracy — drives the adaptive "Focus areas". */
  topics: Record<string, TopicStat>;
  /** Level the learner was placed at. Travels with synced progress so the entry
   *  point is preserved across devices (not just in device-local localStorage). */
  placedLevel?: string;
}

function key(learnerId: string): string {
  return `curriculum_v2_${learnerId || "anon"}`;
}

function empty(): ProgressMap {
  return { lessons: {}, exams: {}, topics: {} };
}

export function loadProgress(learnerId: string): ProgressMap {
  if (typeof window === "undefined") return empty();
  try {
    const raw = window.localStorage.getItem(key(learnerId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ProgressMap>;
    return { lessons: parsed.lessons || {}, exams: parsed.exams || {}, topics: parsed.topics || {}, placedLevel: parsed.placedLevel };
  } catch {
    return empty();
  }
}

export function saveProgress(learnerId: string, map: ProgressMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(learnerId), JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Sampled {
  questions: Question[];
  /** Updated seen-id list to persist after the attempt is recorded. */
  nextSeen: string[];
}

/**
 * Pick `n` questions from `bank`, preferring those not in `seen`. When the unseen
 * pool runs short, it cycles (resetting the seen window) but still avoids
 * repeating within the same attempt. Returns the chosen questions and the seen
 * list to store next.
 */
export function sampleQuestions(bank: Question[], n: number, seen: string[]): Sampled {
  if (bank.length === 0) return { questions: [], nextSeen: seen };
  const take = Math.min(n, bank.length);
  const unseen = bank.filter((q) => !seen.includes(q.id));

  let chosen: Question[];
  let reset = false;
  if (unseen.length >= take) {
    chosen = shuffle(unseen).slice(0, take);
  } else {
    // exhausted the bank — use remaining unseen first, then cycle from the rest
    const rest = shuffle(bank.filter((q) => seen.includes(q.id)));
    chosen = shuffle(unseen).concat(rest).slice(0, take);
    reset = true;
  }
  const chosenIds = chosen.map((q) => q.id);
  return { questions: chosen, nextSeen: reset ? chosenIds : seen.concat(chosenIds) };
}

// -------- recording --------

export function recordLesson(
  learnerId: string,
  lessonId: string,
  correct: number,
  total: number,
  seenIds: string[],
  threshold: number
): ProgressMap {
  const map = loadProgress(learnerId);
  const score = total > 0 ? correct / total : 0;
  const prev = map.lessons[lessonId] || { mastered: false, bestScore: 0, attempts: 0, seenQuestionIds: [] };
  map.lessons[lessonId] = {
    mastered: prev.mastered || score >= threshold,
    bestScore: Math.max(prev.bestScore, score),
    attempts: prev.attempts + 1,
    seenQuestionIds: seenIds,
  };
  saveProgress(learnerId, map);
  return map;
}

export function recordExam(
  learnerId: string,
  examId: string,
  correct: number,
  total: number,
  seenIds: string[],
  threshold: number
): ProgressMap {
  const map = loadProgress(learnerId);
  const score = total > 0 ? correct / total : 0;
  const prev = map.exams[examId] || { passed: false, bestScore: 0, attempts: 0, seenQuestionIds: [] };
  map.exams[examId] = {
    passed: prev.passed || score >= threshold,
    bestScore: Math.max(prev.bestScore, score),
    attempts: prev.attempts + 1,
    seenQuestionIds: seenIds,
  };
  saveProgress(learnerId, map);
  return map;
}

/**
 * Record a result against a TOPIC (a module's topic id). Uses an exponentially
 * decayed accumulator so recent performance counts more — the model "adjusts as
 * the learner is learning" and recovers once a weak area improves.
 */
export function recordTopic(learnerId: string, topic: string, correct: number, total: number): ProgressMap {
  if (!topic || total <= 0) return loadProgress(learnerId);
  const map = loadProgress(learnerId);
  const prev = map.topics[topic] || { correct: 0, total: 0 };
  const DECAY = 0.7; // weight on history vs the new batch
  map.topics[topic] = {
    correct: prev.correct * DECAY + correct,
    total: prev.total * DECAY + total,
  };
  saveProgress(learnerId, map);
  return map;
}

export interface WeakTopic {
  topic: string;
  accuracy: number;
  attempts: number;
}

/** Topics the learner is struggling with: enough attempts and accuracy below threshold. */
export function weakTopics(
  map: ProgressMap,
  opts: { threshold?: number; minAttempts?: number } = {}
): WeakTopic[] {
  const threshold = opts.threshold ?? 0.7;
  const minAttempts = opts.minAttempts ?? 4;
  return Object.entries(map.topics)
    .map(([topic, s]) => ({ topic, accuracy: s.total > 0 ? s.correct / s.total : 1, attempts: s.total }))
    .filter((t) => t.attempts >= minAttempts && t.accuracy < threshold)
    .sort((a, b) => a.accuracy - b.accuracy);
}

/**
 * Placement / level-entry: mark the given lessons + exams complete so a learner
 * who tested into level N is not forced to grind levels below N. They are flagged
 * `placedOut` (distinct from genuinely mastered) so the UI can label them "Tested
 * out" and the learner can still revisit them. Existing real progress is never
 * downgraded. Idempotent: only fills in missing/placed-out entries.
 */
export function applyPlacement(learnerId: string, lessonIds: string[], examIds: string[]): ProgressMap {
  const map = loadProgress(learnerId);
  for (const id of lessonIds) {
    const prev = map.lessons[id];
    if (prev?.mastered && !prev.placedOut) continue; // keep genuine mastery
    map.lessons[id] = { mastered: true, bestScore: prev?.bestScore ?? 0, attempts: prev?.attempts ?? 0, seenQuestionIds: prev?.seenQuestionIds ?? [], placedOut: true };
  }
  for (const id of examIds) {
    const prev = map.exams[id];
    if (prev?.passed && !prev.placedOut) continue;
    map.exams[id] = { passed: true, bestScore: prev?.bestScore ?? 0, attempts: prev?.attempts ?? 0, seenQuestionIds: prev?.seenQuestionIds ?? [], placedOut: true };
  }
  saveProgress(learnerId, map);
  return map;
}

export function isPlacedOut(map: ProgressMap, lessonOrExamId: string): boolean {
  return !!(map.lessons[lessonOrExamId]?.placedOut || map.exams[lessonOrExamId]?.placedOut);
}

/** Record the placed level so it syncs with progress (cross-device entry point). */
export function setPlacedLevel(learnerId: string, level: string): ProgressMap {
  const map = loadProgress(learnerId);
  map.placedLevel = level;
  saveProgress(learnerId, map);
  return map;
}

/**
 * Remove all placement (tested-out) entries, keeping genuine progress. Called
 * before re-seeding so a NEW placement is authoritative — re-testing LOWER
 * correctly re-locks levels that were previously skipped.
 */
export function clearPlacedOut(learnerId: string): ProgressMap {
  const map = loadProgress(learnerId);
  for (const id of Object.keys(map.lessons)) if (map.lessons[id].placedOut) delete map.lessons[id];
  for (const id of Object.keys(map.exams)) if (map.exams[id].placedOut) delete map.exams[id];
  saveProgress(learnerId, map);
  return map;
}

export function isLessonMastered(map: ProgressMap, lessonId: string): boolean {
  return !!map.lessons[lessonId]?.mastered;
}

export function isExamPassed(map: ProgressMap, examId: string): boolean {
  return !!map.exams[examId]?.passed;
}

export function lessonSeen(map: ProgressMap, lessonId: string): string[] {
  return map.lessons[lessonId]?.seenQuestionIds || [];
}

export function examSeen(map: ProgressMap, examId: string): string[] {
  return map.exams[examId]?.seenQuestionIds || [];
}
