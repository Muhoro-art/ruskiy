import { levels } from "./data.generated";
import type { CEFR, Segment, Level, Module, Lesson, Exam, Question } from "./types";
import { isLessonMastered, isExamPassed, applyPlacement, clearPlacedOut, setPlacedLevel, weakTopics, type ProgressMap } from "./progress";
import { SEGMENT_PROFILE } from "./segments";

export type {
  CEFR, Segment, Level, Module, Lesson, Exam, ExamSection, Question, TeachBlock,
} from "./types";
export { MASTERY_THRESHOLD, EXAM_PASS_THRESHOLD } from "./types";
export * from "./progress";
export { SEGMENT_PROFILE, segmentProfile, type SegmentProfile } from "./segments";

export { levels };

const LEVEL_ORDER: CEFR[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function levelRank(id: CEFR): number {
  return LEVEL_ORDER.indexOf(id);
}

export function normalizeSegment(raw: string | null | undefined): Segment {
  switch (raw) {
    case "kid":
    case "teen":
    case "uni_prep":
    case "daily_life":
    case "senior":
      return raw;
    case "migrant":
      return "daily_life";
    default:
      return "core";
  }
}

const SEGMENT_LABELS: Record<Segment, string> = {
  core: "General", kid: "Kids", teen: "Teens",
  uni_prep: "University Prep", daily_life: "Daily Life", senior: "Senior",
};
export function segmentLabel(segment: Segment): string {
  return SEGMENT_LABELS[segment];
}

/** The CEFR level a segment is aiming for (from its goal profile). */
export function targetLevel(segment: Segment): CEFR {
  return SEGMENT_PROFILE[segment].targetLevel;
}

/**
 * Whether a module belongs in a given segment's track. A module with no
 * `audience` (or `["*"]`) is shared CORE shown to everyone; a tagged `segment`
 * module appears only for the segments it lists. This is the knob that makes each
 * segment a different course off the same grammar core.
 */
function moduleInSegment(m: Module, segment: Segment, useCore: boolean): boolean {
  const isCore = !m.audience || m.audience.length === 0 || m.audience.includes("*");
  if (isCore) return useCore; // kids skip the shared adult grammar core
  return m.audience!.includes(segment);
}

/**
 * Build a learner's track by COMPOSING this segment's modules up to its target
 * level. Segments that `usesCore` get the shared grammar core PLUS their themed
 * modules (so Uni-Prep and Teen share case/aspect grammar but live in different
 * courses); kids get ONLY their own pre-A1 spine. Soft-gated segments (kids) have
 * their level exams stripped. A non-core segment with no themed content yet falls
 * back to the core, so a track is never empty.
 */
export function buildTrack(segment: Segment): Level[] {
  const profile = SEGMENT_PROFILE[segment];
  const max = levelRank(profile.targetLevel);
  const compose = (useCore: boolean): Level[] =>
    levels
      .filter((l) => levelRank(l.id) <= max)
      .map((l) => ({
        ...l,
        exam: profile.gating === "soft" ? null : l.exam,
        modules: l.modules.filter((m) => moduleInSegment(m, segment, useCore)).sort((a, b) => a.order - b.order),
      }))
      .filter((l) => l.modules.length > 0)
      .sort((a, b) => levelRank(a.id) - levelRank(b.id));
  let track = compose(profile.usesCore);
  if (track.reduce((n, l) => n + l.modules.length, 0) === 0) track = compose(true);
  return track;
}

// -------- placement / level-entry --------

/**
 * The lessons + exams a learner placed at `placedLevel` has effectively already
 * covered: everything in levels strictly below it. Marking these complete lets an
 * A2/B2 entrant start where they belong instead of at A1, while higher levels stay
 * locked behind the normal sequential gating.
 */
export function placementTargets(track: Level[], placedLevel: CEFR): { lessonIds: string[]; examIds: string[] } {
  const rank = levelRank(placedLevel);
  const lessonIds: string[] = [];
  const examIds: string[] = [];
  for (const level of track) {
    if (levelRank(level.id) >= rank) continue;
    for (const module of level.modules) {
      // Never skip a learner's OWN themed content — segment modules (texting,
      // documents, etc.) stay available even when they enter at a higher level.
      if (module.track === "segment") continue;
      for (const lesson of module.lessons) lessonIds.push(lesson.id);
    }
    if (level.exam) examIds.push(level.exam.id);
  }
  return { lessonIds, examIds };
}

/**
 * Seed placement: mark the shared CORE below `placedLevel` as tested-out. Clears
 * any prior placement first, so re-placing (e.g. a fresh level-check) is
 * authoritative and never leaves stale skip-aheads.
 */
export function seedPlacement(learnerId: string, track: Level[], placedLevel: CEFR): ProgressMap {
  clearPlacedOut(learnerId);
  const { lessonIds, examIds } = placementTargets(track, placedLevel);
  applyPlacement(learnerId, lessonIds, examIds);
  return setPlacedLevel(learnerId, placedLevel);
}

// -------- step sequence (lessons + level exams) for strict gating --------

export type Step =
  | { kind: "lesson"; id: string; lesson: Lesson; module: Module; level: Level }
  | { kind: "exam"; id: string; exam: Exam; level: Level };

export function trackSteps(track: Level[]): Step[] {
  const steps: Step[] = [];
  for (const level of track) {
    for (const module of level.modules) {
      for (const lesson of module.lessons) {
        steps.push({ kind: "lesson", id: lesson.id, lesson, module, level });
      }
    }
    if (level.exam) {
      steps.push({ kind: "exam", id: level.exam.id, exam: level.exam, level });
    }
  }
  return steps;
}

export function stepComplete(map: ProgressMap, step: Step): boolean {
  return step.kind === "lesson" ? isLessonMastered(map, step.id) : isExamPassed(map, step.id);
}

/**
 * The CEFR level the learner is actively working at — the level that owns the
 * current (first incomplete) step. When the whole track is finished, it's the
 * top level reached. This is the authoritative "current level" the whole app
 * displays, so Home and Learn never disagree. Derived purely from progress, so
 * it tracks real advancement past the placement entry point.
 */
export function currentLevelId(track: Level[], map: ProgressMap): CEFR {
  if (track.length === 0) return "A1";
  const steps = trackSteps(track);
  const idx = currentStepIndex(steps, map);
  if (idx >= 0) return steps[idx].level.id;
  return track[track.length - 1].id; // all complete → furthest level
}

/** Strict sequential gating: a step unlocks only when the previous one completes. */
export function isStepUnlocked(steps: Step[], index: number, map: ProgressMap): boolean {
  if (index <= 0) return true;
  return stepComplete(map, steps[index - 1]);
}

/** Index of the first incomplete, unlocked step — "where the learner is now". */
export function currentStepIndex(steps: Step[], map: ProgressMap): number {
  for (let i = 0; i < steps.length; i++) {
    if (!stepComplete(map, steps[i])) {
      const unlocked = i === 0 || stepComplete(map, steps[i - 1]);
      return unlocked ? i : -1;
    }
  }
  return -1; // all complete
}

export interface LevelStatus {
  masteredLessons: number;
  totalLessons: number;
  examPassed: boolean;
  examUnlocked: boolean;
  /** "locked" (prior level not done) | "active" | "complete". */
  state: "locked" | "active" | "complete";
}

/** A level is fully complete when every lesson is mastered AND its exam (if any) is passed. */
export function levelFullyComplete(level: Level, map: ProgressMap): boolean {
  const lessons = level.modules.flatMap((m) => m.lessons);
  const allMastered = lessons.length > 0 && lessons.every((l) => isLessonMastered(map, l.id));
  const examOk = level.exam ? isExamPassed(map, level.exam.id) : true;
  return allMastered && examOk;
}

export function levelStatus(track: Level[], steps: Step[], level: Level, map: ProgressMap): LevelStatus {
  const lessons = level.modules.flatMap((m) => m.lessons);
  const masteredLessons = lessons.filter((l) => isLessonMastered(map, l.id)).length;
  const totalLessons = lessons.length;
  const examPassed = level.exam ? isExamPassed(map, level.exam.id) : true;
  const examUnlocked = totalLessons > 0 && masteredLessons === totalLessons;
  const complete = levelFullyComplete(level, map);

  // A level stays locked until the PREVIOUS level is fully complete (all lessons
  // mastered + its exam passed). Falling back to lesson-completion keeps the gate
  // intact even if a level's exam hasn't been authored yet.
  const idx = track.findIndex((l) => l.id === level.id);
  const prev = idx > 0 ? track[idx - 1] : null;
  const prevDone = !prev ? true : levelFullyComplete(prev, map);

  return {
    masteredLessons,
    totalLessons,
    examPassed,
    examUnlocked,
    state: complete ? "complete" : prevDone ? "active" : "locked",
  };
}

export function findLesson(track: Level[], lessonId: string): { level: Level; module: Module; lesson: Lesson } | null {
  for (const level of track) {
    for (const module of level.modules) {
      const lesson = module.lessons.find((l) => l.id === lessonId);
      if (lesson) return { level, module, lesson };
    }
  }
  return null;
}

export function findExam(track: Level[], examId: string): { level: Level; exam: Exam } | null {
  for (const level of track) {
    if (level.exam && level.exam.id === examId) return { level, exam: level.exam };
  }
  return null;
}

export function moduleByTopic(track: Level[], topic: string): Module | null {
  for (const level of track) {
    const m = level.modules.find((mm) => mm.id === topic || mm.topic === topic);
    if (m) return m;
  }
  return null;
}

/**
 * Build an adaptive review set drawn from the learner's WEAK topics, using only
 * lessons they've already mastered (so we re-test learned material, not new
 * grammar). Returns up to `n` questions tagged with their topic so results feed
 * back into the topic model.
 */
export function buildReview(
  track: Level[],
  topics: string[],
  map: ProgressMap,
  n = 8
): Array<{ question: Lesson["questionBank"][number]; topic: string; lessonId: string }> {
  const pool: Array<{ question: Lesson["questionBank"][number]; topic: string; lessonId: string }> = [];
  for (const topic of topics) {
    const mod = moduleByTopic(track, topic);
    if (!mod) continue;
    for (const lesson of mod.lessons) {
      if (isLessonMastered(map, lesson.id)) {
        for (const q of lesson.questionBank) pool.push({ question: q, topic, lessonId: lesson.id });
      }
    }
  }
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Topics (module ids) the learner has at least one mastered lesson in. */
export function masteredTopics(track: Level[], map: ProgressMap): string[] {
  const topics: string[] = [];
  for (const level of track)
    for (const m of level.modules)
      if (m.topic && m.lessons.some((l) => isLessonMastered(map, l.id))) topics.push(m.topic);
  return topics;
}

/**
 * A small set of review questions to INTERLEAVE into the current lesson, drawn
 * from previously-mastered topics. Prefers topics already looking weak (so a miss
 * surfaces real weakening); otherwise it's plain spaced repetition over anything
 * learned. Excludes the current topic. Empty until the learner has mastered
 * something to review.
 */
export function buildInterleavedReview(
  track: Level[],
  map: ProgressMap,
  excludeTopic: string,
  n: number
): Array<{ question: Question; topic: string; lessonId: string }> {
  const mastered = masteredTopics(track, map).filter((t) => t && t !== excludeTopic);
  if (mastered.length === 0) return [];
  const weak = new Set(weakTopics(map).map((w) => w.topic));
  const weakMastered = mastered.filter((t) => weak.has(t));
  return buildReview(track, weakMastered.length ? weakMastered : mastered, map, n);
}

export interface OverallProgress {
  masteredLessons: number;
  totalLessons: number;
  examsPassed: number;
  totalExams: number;
  fraction: number;
}

export function overallProgress(track: Level[], map: ProgressMap): OverallProgress {
  const lessons = track.flatMap((l) => l.modules.flatMap((m) => m.lessons));
  const exams = track.map((l) => l.exam).filter(Boolean) as Exam[];
  const masteredLessons = lessons.filter((l) => isLessonMastered(map, l.id)).length;
  const examsPassed = exams.filter((e) => isExamPassed(map, e.id)).length;
  const totalSteps = lessons.length + exams.length;
  const done = masteredLessons + examsPassed;
  return {
    masteredLessons,
    totalLessons: lessons.length,
    examsPassed,
    totalExams: exams.length,
    fraction: totalSteps > 0 ? done / totalSteps : 0,
  };
}
